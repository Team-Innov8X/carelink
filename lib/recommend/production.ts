import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ObjectId } from "mongodb";
import conditions from "../../data/conditions.json";
import profiles from "../../data/hospital-profiles.json";
import { allocateBatch, createReplanState, replan } from "../allocation/engine.ts";
import { ReservationLedger } from "../allocation/ledger.ts";
import { probabilityFromFeatureVector, type LogisticModelArtifact } from "../allocation/forecaster.ts";
import { buildFeatureVector, type TrainingStayDurations } from "../../sim/features.ts";
import type { DecisionSample } from "../../sim/world.ts";
import { getHoldsCollection, getHospitalsCollection, getResourcesCollection, initializeIndexes } from "../models/index.ts";
import { confirmPatientBedHold, createHold, rejectPatientBedHold, releaseHold } from "../services/hold-service.ts";
import { distanceKm, sosCollections, validCoordinates, type Coordinates } from "../sos.ts";
import { ACCEPTANCE_FEATURE_ORDER, buildAcceptanceFeatures } from "./accept-features.ts";
import { scoreAcceptance, type AcceptanceModelArtifact } from "./accept-model.ts";
import { rankConditionHospitals, patientForCondition, type Recommendation, type RecommendationHospital } from "./engine.ts";
import { RECOMMENDATION } from "./constants.ts";

type RecommendationState = {
  requestId: string; conditionId: string; conditionLabel: string; urgency: number;
  status: "proposed" | "requested" | "confirmed" | "unserved";
  ranked: Array<Recommendation & { location: Coordinates; bedCategory: "icu" | "emergency" }>;
  selectedHospitalId?: string; selectedHospitalName?: string; selectedHospitalLocation?: Coordinates;
  currentHoldId?: string; responseDeadline?: Date; reroutes: number; rejectedHospitalIds: string[];
  overrideReason?: string; unservedReason?: string; fallbackText?: string; fallbackFlags: string[];
  timeline: Array<{ status: string; at: Date; actor: string; reason: string; hospitalId?: string; hospitalName?: string }>;
};
type TripDoc = { _id: string; patientId: string; patientName: string; location: Coordinates; status: string; driverId: string | null; tripStage?: string; arrivedAt?: Date; recommendation?: RecommendationState };

function hospitalCoordinates(value: unknown): Coordinates | null {
  if (validCoordinates(value)) return value;
  if (!value || typeof value !== "object") return null;
  const point = value as { coordinates?: unknown; latitude?: unknown; longitude?: unknown };
  if (Array.isArray(point.coordinates) && typeof point.coordinates[0] === "number" && typeof point.coordinates[1] === "number") return { latitude: point.coordinates[1], longitude: point.coordinates[0] };
  return null;
}
function tags(values: unknown): string[] {
  const list = Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : [];
  const text = list.join(" ").toLowerCase();
  return [...( /cardiac|cardio/.test(text) ? ["cardiac"] : []), ...(/trauma/.test(text) ? ["trauma"] : [])];
}
function typeForCategory(category: string): "icu_bed" | "emergency_bed" | null {
  const value = category.trim().toLowerCase();
  if (value === "icu") return "icu_bed";
  if (value === "emergency") return "emergency_bed";
  return null;
}

async function hospitalSnapshot(origin: Coordinates, conditionId: string, etaMin: number) {
  await initializeIndexes();
  const [hospitalRows, resources, recentResponses] = await Promise.all([
    (await getHospitalsCollection()).find({ status: { $in: ["active", "busy", "full"] }, isDemo: { $ne: true } }).toArray(),
    (await getResourcesCollection()).find({ type: "bed" }).toArray(),
    (await getHoldsCollection()).find({ recommendationRespondedAt: { $gte: new Date(Date.now() - RECOMMENDATION.recentRejectionWindowMinutes * 60_000) } }).project({ hospitalId: 1, status: 1 }).toArray(),
  ]);
  const recentByHospital = new Map<string, { count: number; rejected: number }>();
  for (const response of recentResponses) {
    const entry = recentByHospital.get(response.hospitalId) ?? { count: 0, rejected: 0 };
    entry.count += 1;
    if (response.status === "rejected" || response.status === "expired") entry.rejected += 1;
    recentByHospital.set(response.hospitalId, entry);
  }
  const resourceByHospital = new Map<string, typeof resources>();
  for (const resource of resources) {
    const rows = resourceByHospital.get(resource.hospitalId) ?? [];
    rows.push(resource); resourceByHospital.set(resource.hospitalId, rows);
  }
  const condition = conditions.find((item) => item.id === conditionId)!;
  const acceptanceModel = JSON.parse(readFileSync(join(process.cwd(), "model", "accept-model.json"), "utf8")) as AcceptanceModelArtifact;
  const availabilityModel = JSON.parse(readFileSync(join(process.cwd(), "model", "model.json"), "utf8")) as LogisticModelArtifact;
  const hospitals = hospitalRows.flatMap((row) => {
    const id = row._id?.toString() ?? row.id ?? row.code;
    const location = hospitalCoordinates(row.location);
    if (!location) return [];
    const idResources = resourceByHospital.get(id) ?? [];
    const supportedTypes = [...new Set(idResources.map((resource) => typeForCategory(String(resource.category))).filter((type): type is "icu_bed" | "emergency_bed" => Boolean(type)))];
    const confirmedFree = { icu_bed: 0, emergency_bed: 0 };
    const totalCapacity = { icu_bed: 0, emergency_bed: 0 };
    const closedTypes: Array<"icu_bed" | "emergency_bed"> = [];
    for (const resource of idResources) {
      const type = typeForCategory(String(resource.category));
      if (!type) continue;
      totalCapacity[type] += resource.totalQuantity;
      confirmedFree[type] += Math.max(0, resource.availableQuantity - resource.heldQuantity);
      if (resource.status === "unavailable") closedTypes.push(type);
    }
    const statusClosed = row.status === "inactive";
    if (statusClosed) closedTypes.push("icu_bed", "emergency_bed");
    const capacity = totalCapacity[condition.resourceType as "icu_bed" | "emergency_bed"];
    const free = confirmedFree[condition.resourceType as "icu_bed" | "emergency_bed"];
    const capabilityTags = tags(row.specialties);
    const rowWithExtra = row as typeof row & { equipment?: string[]; responseRate?: number };
    capabilityTags.push(...tags(rowWithExtra.equipment));
    const profile = profiles.find((item) => item.hospitalId === id);
    const rejectionRate = typeof rowWithExtra.responseRate === "number" ? 1 - Math.max(0, Math.min(1, rowWithExtra.responseRate)) : 0.1;
    const recent = recentByHospital.get(id);
    const recentRejectionRate = recent?.count ? recent.rejected / recent.count : rejectionRate;
    const hospital: RecommendationHospital = {
      id, name: row.name, travelTimeMinutes: Math.max(1, Math.ceil(distanceKm(origin, location) * 2.5)), rejectionRate,
      capabilities: [...new Set(capabilityTags)], confirmedFree, supportedTypes, closedTypes: [...new Set(closedTypes)],
      coordinates: location, occupancyRatio: capacity > 0 ? Math.max(0, Math.min(1, 1 - free / capacity)) : 1,
      recentRejectionRate, walkInsLast30Min: 0, capacity,
      casesHandled: (profile?.casesHandled ?? {}) as Record<string, number>,
    };
    const at = new Date();
    const sample: DecisionSample = {
      id: `live-${id}-${conditionId}`, day: at.getDay() + 1, minute: at.getHours() * 60 + at.getMinutes(), hospitalId: id,
      resourceType: condition.resourceType as "icu_bed" | "emergency_bed", etaMin, unitsNeeded: 1, label: 1,
      features: {
        freeNow: free, freeNowMinusK: free - 1, k: 1, occupancyRatio: hospital.occupancyRatio, etaMin,
        walkInsLast30Min: 0, hour: at.getHours(), weekend: at.getDay() === 0 || at.getDay() === 6 ? 1 : 0,
        resourceTypeIsIcu: condition.resourceType === "icu_bed" ? 1 : 0, closedNow: statusClosed ? 1 : 0,
        currentStayElapsedMinutes: [],
      },
    };
    const durationData = availabilityModel.trainingStayDurations as TrainingStayDurations;
    const avFeatures = buildFeatureVector(sample, durationData);
    const accFeatures = buildAcceptanceFeatures({ freeNow: free, occupancyRatio: hospital.occupancyRatio, recentRejectionRate, walkInsLast30Min: 0, urgency: condition.urgency, conditionId, capabilityMatch: !condition.capability || hospital.capabilities.includes(condition.capability), etaMin: Math.max(etaMin, hospital.travelTimeMinutes), capacity, at });
    if (accFeatures.length !== ACCEPTANCE_FEATURE_ORDER.length) throw new Error("Acceptance feature order mismatch.");
    hospital.acceptanceFeatures = accFeatures;
    return [{ hospital, location, bedCategory: condition.resourceType === "icu_bed" ? "icu" as const : "emergency" as const, availabilityFeatures: avFeatures, acceptanceModel }];
  });
  return { hospitals: hospitals.map(({ hospital }) => hospital), locations: new Map(hospitals.map((item) => [item.hospital.id, item.location])), categories: new Map(hospitals.map((item) => [item.hospital.id, item.bedCategory])), availability: new Map(hospitals.map((item) => [item.hospital.id, item.availabilityFeatures])), availabilityModel, acceptanceModel };
}

function selectedState(state: RecommendationState, chosen: Recommendation & { location: Coordinates; bedCategory: "icu" | "emergency" }, holdId: string) {
  const now = new Date();
  state.status = "requested"; state.currentHoldId = holdId; state.selectedHospitalId = chosen.hospitalId;
  state.selectedHospitalName = chosen.hospitalName; state.selectedHospitalLocation = chosen.location;
  state.responseDeadline = new Date(now.getTime() + RECOMMENDATION.hospitalResponseSeconds * 1000);
  state.timeline.push({ status: "requested", at: now, actor: "system", reason: "Bed request sent to the selected hospital.", hospitalId: chosen.hospitalId, hospitalName: chosen.hospitalName });
  return state;
}

async function saveTripRecommendation(trip: TripDoc, state: RecommendationState) {
  const { requests } = await sosCollections();
  await requests.updateOne({ _id: trip._id, driverId: trip.driverId, status: "accepted" }, {
    $set: { recommendation: state, destination: { hospitalId: state.selectedHospitalId, name: state.selectedHospitalName, latitude: state.selectedHospitalLocation?.latitude, longitude: state.selectedHospitalLocation?.longitude } },
  } as never);
}

async function rankForTrip(trip: TripDoc, state: RecommendationState, override?: { hospitalId: string; reason: string }) {
  const { drivers } = await sosCollections();
  const driver = trip.driverId ? await drivers.findOne({ userId: trip.driverId }) : null;
  const origin = validCoordinates(driver?.location) ? driver.location : trip.location;
  const snapshot = await hospitalSnapshot(origin, state.conditionId, 10);
  const patient = patientForCondition(trip._id, state.conditionId, 10);
  const ledger = new ReservationLedger(snapshot.hospitals);
  const ranked = rankConditionHospitals({
    patient, conditionId: state.conditionId, hospitals: snapshot.hospitals, ledger,
    rejectedHospitalIds: new Set(state.rejectedHospitalIds),
    availabilityProbability: (hospital) => probabilityFromFeatureVector(snapshot.availability.get(hospital.id)!, snapshot.availabilityModel),
    acceptanceProbability: (hospital) => scoreAcceptance(hospital.acceptanceFeatures ?? [], snapshot.acceptanceModel),
    ...(override ? { override } : {}),
  });
  state.ranked = ranked.ranked.map((item) => ({ ...item, location: snapshot.locations.get(item.hospitalId)!, bedCategory: snapshot.categories.get(item.hospitalId)! }));
  state.fallbackFlags = ranked.fallbackFlags;
  if (ranked.overrideApplied) state.overrideReason = ranked.overrideReason;
  return { snapshot, ranked };
}

async function placeNextHold(trip: TripDoc, state: RecommendationState, userId: string, override?: { hospitalId: string; reason: string }) {
  await rankForTrip(trip, state, override);
  const rejected = new Set(state.rejectedHospitalIds);
  for (const candidate of state.ranked) {
    if (rejected.has(candidate.hospitalId)) continue;
    const hold = await createHold({
      hospitalId: candidate.hospitalId, patientId: trip.patientId, requestedByUserId: userId, ambulanceId: userId,
      resourceType: "bed", category: candidate.bedCategory, quantity: 1,
      originLocation: [trip.location.longitude, trip.location.latitude], holdTimeoutMinutes: RECOMMENDATION.hospitalResponseSeconds / 60,
      patientDetails: { name: trip.patientName, conditionSummary: state.conditionLabel, priority: state.urgency === 1 ? "critical" : state.urgency === 2 ? "urgent" : "standard", etaMinutes: candidate.travelTimeMinutes },
      notes: `Condition-based bed request: ${state.conditionLabel}. Decision support; simulation data.`,
      recommendationRequestKey: `${trip.patientId}:${state.requestId}:${candidate.hospitalId}`,
      recommendationTripId: trip._id, recommendationConditionId: state.conditionId,
    });
    if (hold.success && hold.hold) {
      const holdId = hold.hold._id?.toString() ?? hold.hold.id ?? "";
      if (!holdId) continue;
      selectedState(state, candidate, holdId);
      if (state.overrideReason) state.timeline.push({ status: "override", at: new Date(), actor: userId, reason: state.overrideReason, hospitalId: candidate.hospitalId, hospitalName: candidate.hospitalName });
      await saveTripRecommendation(trip, state);
      return state;
    }
    rejected.add(candidate.hospitalId);
  }
  state.status = "unserved"; state.unservedReason = "capacity_exhausted"; state.fallbackText = RECOMMENDATION.emergencyFallbackText;
  state.timeline.push({ status: "unserved", at: new Date(), actor: "system", reason: "No feasible hospital could reserve the requested bed." });
  await saveTripRecommendation(trip, state);
  return state;
}

export async function createTripRecommendation(driverId: string, tripId: string, conditionId: string) {
  const condition = conditions.find((item) => item.id === conditionId);
  if (!condition) throw new RangeError("Choose a condition from the configured list.");
  const { requests } = await sosCollections();
  const trip = await requests.findOne({ _id: tripId, driverId, status: "accepted" }) as TripDoc | null;
  if (!trip) throw new Error("Active trip not found for this driver.");
  if (!trip.arrivedAt && !["arrived_patient", "patient_on_board"].includes(trip.tripStage ?? "")) throw new Error("Select a condition after arriving at the patient or picking them up.");
  if (trip.recommendation?.currentHoldId && trip.recommendation.status === "requested") {
    if (trip.recommendation.conditionId === conditionId) return trip.recommendation;
    throw new Error("A hospital is already reviewing this trip's bed request.");
  }
  const now = new Date();
  const state: RecommendationState = {
    requestId: randomUUID(), conditionId, conditionLabel: condition.label, urgency: condition.urgency,
    status: "proposed", ranked: [], reroutes: 0, rejectedHospitalIds: [], fallbackFlags: [],
    timeline: [{ status: "condition_selected", at: now, actor: driverId, reason: `Condition selected: ${condition.label}.` }],
  };
  trip.recommendation = state;
  const initial = await rankForTrip(trip, state);
  state.timeline.push({ status: "recommended", at: new Date(), actor: "system", reason: "Feasible hospitals ranked using availability, simulated acceptance and simulated case experience." });
  if (!initial.ranked.chosen) {
    const reason = allocateBatch([patientForCondition(trip._id, conditionId, 10)], initial.snapshot.hospitals, ({ hospital, patient }) => hospital.confirmedFree[patient.resourceType] > 0 ? 1 : 0, new ReservationLedger(initial.snapshot.hospitals)).unserved[0]?.reason ?? "capacity_exhausted";
    state.status = "unserved"; state.unservedReason = reason; state.fallbackText = RECOMMENDATION.emergencyFallbackText;
    await saveTripRecommendation(trip, state);
    return state;
  }
  return placeNextHold(trip, state, driverId);
}

export async function overrideTripHospital(driverId: string, tripId: string, hospitalId: string, reason: string) {
  if (!reason.trim()) throw new RangeError("Provide a reason for changing the recommended hospital.");
  const { requests } = await sosCollections();
  const trip = await requests.findOne({ _id: tripId, driverId, status: "accepted" }) as TripDoc | null;
  if (!trip?.recommendation) throw new Error("Choose a patient condition before changing the hospital.");
  const state = trip.recommendation;
  if (state.status === "confirmed") throw new Error("A hospital has already accepted this request.");
  if (state.currentHoldId && state.status === "requested") {
    const released = await releaseHold(state.currentHoldId, "cancelled", [trip.location.longitude, trip.location.latitude]);
    if (!released.success) throw new Error("The current hospital request could not be cancelled before the override.");
    state.timeline.push({ status: "cancelled", at: new Date(), actor: driverId, reason: "Driver changed the selected hospital.", hospitalId: state.selectedHospitalId, hospitalName: state.selectedHospitalName });
  }
  return placeNextHold(trip, state, driverId, { hospitalId, reason });
}

async function markTimeoutAndReplan(trip: TripDoc, state: RecommendationState, hold: { _id?: ObjectId | string; hospitalId: string; recommendationRespondedAt?: Date }) {
  if (!state.currentHoldId || !state.responseDeadline || state.responseDeadline.getTime() > Date.now() || state.status !== "requested") return state;
  const holds = await getHoldsCollection();
  const holdId = state.currentHoldId;
  const expired = await rejectPatientBedHold({ holdId, hospitalId: hold.hospitalId, reason: "expired" });
  if (!expired.success) {
    const latest = await holds.findOne({ _id: hold._id });
    if (latest?.status !== "expired" && latest?.status !== "rejected") return state;
  }
  await holds.updateOne({ _id: hold._id }, { $set: { recommendationRespondedAt: new Date(), recommendationRejectionReason: "timeout" } });
  return handleRejectedTrip(trip, state, hold.hospitalId, "timeout", "No hospital response before the server deadline.");
}

async function handleRejectedTrip(trip: TripDoc, state: RecommendationState, hospitalId: string, status: "rejected" | "timeout", reason: string) {
  const current = state.ranked.find((candidate) => candidate.hospitalId === hospitalId);
  state.timeline.push({ status, at: new Date(), actor: status === "timeout" ? "system" : "hospital", reason, hospitalId, hospitalName: current?.hospitalName });
  state.rejectedHospitalIds = [...new Set([...state.rejectedHospitalIds, hospitalId])];
  state.currentHoldId = undefined; state.responseDeadline = undefined; state.reroutes += 1;
  const { snapshot, ranked } = await rankForTrip(trip, state);
  const patient = patientForCondition(trip._id, state.conditionId, 10);
  const planningHospitals = snapshot.hospitals.map((item) => item.id === hospitalId
    ? { ...item, confirmedFree: { ...item.confirmedFree, [patient.resourceType]: item.confirmedFree[patient.resourceType] + 1 } }
    : item);
  const ledger = new ReservationLedger(planningHospitals);
  const reserved = ledger.reserve({ patientId: patient.id, batchId: patient.batchId, hospitalId, resourceType: patient.resourceType, requiredResourceType: patient.resourceType });
  const replanState = createReplanState([patient]);
  replanState.reroutes.set(patient.id, state.reroutes - 1);
  replanState.rejectedHospitals.set(patient.id, new Set(state.rejectedHospitalIds.filter((id) => id !== hospitalId)));
  let replanned = { assignments: [], unserved: [] as Array<{ patientId: string; reason: string }> };
  if (reserved) replanned = replan({ type: "hospital_rejection", reservationId: reserved.reservation.id, at: Date.now() }, planningHospitals, ({ hospital }) => hospital.confirmedFree[patient.resourceType] > 0 ? 1 : 0, ledger, replanState) as typeof replanned;
  if (state.reroutes > RECOMMENDATION.maxReroutes || !ranked.chosen || replanned.unserved.length) {
    state.status = "unserved"; state.unservedReason = state.reroutes > RECOMMENDATION.maxReroutes ? "rejected_no_alternative" : replanned.unserved[0]?.reason ?? "rejected_no_alternative";
    state.fallbackText = RECOMMENDATION.emergencyFallbackText;
    state.timeline.push({ status: "unserved", at: new Date(), actor: "system", reason: state.unservedReason });
    await saveTripRecommendation(trip, state);
    return state;
  }
  state.timeline.push({ status: "rerouting", at: new Date(), actor: "system", reason: `${current?.hospitalName ?? "Hospital"} ${status === "timeout" ? "timed out" : "rejected"}; requesting ${ranked.chosen.hospitalName}.`, hospitalId: ranked.chosen.hospitalId, hospitalName: ranked.chosen.hospitalName });
  return placeNextHold(trip, state, trip.driverId ?? "system");
}

export async function getTripRecommendation(tripId: string, userId: string, role: string) {
  const { requests } = await sosCollections();
  const trip = await requests.findOne({ _id: tripId }) as TripDoc | null;
  if (!trip) return null;
  if (role === "driver" || role === "ambulance_driver") {
    if (trip.driverId !== userId) throw new Error("FORBIDDEN");
  } else if (role === "patient") {
    if (trip.patientId !== userId) throw new Error("FORBIDDEN");
  } else throw new Error("FORBIDDEN");
  const state = trip.recommendation;
  if (state?.status === "requested" && state.currentHoldId) {
    const holds = await getHoldsCollection();
    const hold = await holds.findOne({ recommendationRequestKey: `${trip.patientId}:${state.requestId}:${state.selectedHospitalId}` });
    if (hold) {
      const timed = await markTimeoutAndReplan(trip, state, hold);
      return timed;
    }
  }
  return state ?? null;
}

export async function respondToRecommendation(holdId: string, hospitalId: string, actorId: string, action: "accept" | "reject", reason?: string) {
  const holds = await getHoldsCollection();
  const queryId = ObjectId.isValid(holdId) ? new ObjectId(holdId) : holdId;
  const hold = await holds.findOne({ _id: queryId as ObjectId, hospitalId, recommendationRequestKey: { $exists: true }, status: "pending" });
  if (!hold) throw new Error("Pending recommendation request not found for this hospital.");
  if (hold.recommendationResponseDeadline && hold.recommendationResponseDeadline.getTime() <= Date.now()) {
    await rejectPatientBedHold({ holdId, hospitalId, reason: "expired" });
    throw new Error("The server response deadline passed; this request timed out.");
  }
  if (action === "reject" && !reason?.trim()) throw new RangeError("A rejection reason is required.");
  const { requests } = await sosCollections();
  const trip = hold.recommendationTripId ? await requests.findOne({ _id: hold.recommendationTripId }) as TripDoc | null : null;
  if (!trip?.recommendation || trip.recommendation.currentHoldId !== holdId) throw new Error("This request is no longer current for the trip.");
  if (action === "accept") {
    const result = await confirmPatientBedHold({ holdId, hospitalId, confirmedByUserId: actorId });
    if (!result.success) throw new Error("error" in result ? result.error : "The hospital request could not be accepted.");
    await holds.updateOne({ _id: hold._id }, { $set: { recommendationRespondedAt: new Date() } });
    const state = trip.recommendation;
    state.status = "confirmed"; state.responseDeadline = undefined;
    state.timeline.push({ status: "confirmed", at: new Date(), actor: actorId, reason: "Hospital accepted and reserved the bed.", hospitalId, hospitalName: state.selectedHospitalName });
    await saveTripRecommendation(trip, state);
    return state;
  }
  const result = await rejectPatientBedHold({ holdId, hospitalId, reason: "rejected" });
  if (!result.success) throw new Error("error" in result ? result.error : "The hospital request could not be rejected.");
  await holds.updateOne({ _id: hold._id }, { $set: { recommendationRespondedAt: new Date(), recommendationRejectionReason: reason } });
  return handleRejectedTrip(trip, trip.recommendation, hospitalId, "rejected", reason!.trim());
}

export async function expireTripRecommendation(tripId: string) {
  const { requests } = await sosCollections();
  const trip = await requests.findOne({ _id: tripId }) as TripDoc | null;
  if (!trip?.recommendation || trip.recommendation.status !== "requested" || !trip.recommendation.currentHoldId || !trip.recommendation.responseDeadline || trip.recommendation.responseDeadline.getTime() > Date.now()) return trip?.recommendation ?? null;
  const hold = await getHoldsCollection().then((collection) => collection.findOne({ recommendationRequestKey: `${trip.patientId}:${trip.recommendation!.requestId}:${trip.recommendation!.selectedHospitalId}` }));
  if (!hold) return trip.recommendation;
  return markTimeoutAndReplan(trip, trip.recommendation, hold);
}
