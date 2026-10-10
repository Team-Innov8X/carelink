import { rankHospitals, type RankingHospital } from "../ranking.ts";
import { ETA_REPLAN_THRESHOLD_MIN, MAX_REROUTES_PER_PATIENT, REROUTE_PENALTY_MIN, URGENCY_WEIGHT } from "./constants.ts";
import { ReservationLedger } from "./ledger.ts";
import type { AllocationHospital, AllocationPatient, AllocationResult, AvailabilityForecaster, ForecastInput, ReplanEvent, ReplanState, SimResourceType, UnservedReason } from "./types.ts";

function resourceCategory(type: SimResourceType) { return type === "icu_bed" ? "icu" : "emergency"; }
const validProbability = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

function forecastOrBaseline(forecaster: AvailabilityForecaster, input: ForecastInput): { probability: number; fallback: boolean } {
  try {
    const probability = forecaster(input);
    if (validProbability(probability)) return { probability, fallback: false };
  } catch { /* use the hard-capacity baseline */ }
  return { probability: input.hospital.confirmedFree[input.patient.resourceType] > 0 ? 1 : 0, fallback: true };
}

function feasibleByExistingRanking(patient: AllocationPatient, hospitals: AllocationHospital[], ledger: ReservationLedger): Set<string> {
  const need = [resourceCategory(patient.resourceType), ...(patient.capability ? [patient.capability] : [])];
  const candidates: RankingHospital[] = hospitals.map((hospital) => ({
    id: hospital.id,
    name: hospital.name,
    location: { type: "Point", coordinates: [0, 0] },
    status: hospital.closedTypes.includes(patient.resourceType) || ledger.isClosed(hospital.id, patient.resourceType) ? "inactive" : "active",
    travelTimeMinutes: hospital.travelTimeMinutes,
    resources: [
      { category: resourceCategory(patient.resourceType), availableQuantity: Math.max(ledger.freeUnits(hospital.id, patient.resourceType), hospital.supportedTypes?.includes(patient.resourceType) ? 1 : 0), updatedAt: new Date(0) },
      ...hospital.capabilities.map((category) => ({ category, availableQuantity: 1, updatedAt: new Date(0) })),
    ],
  }));
  const ranked = rankHospitals(candidates, { emergencyType: "allocation", requiredResources: need, ambulanceLocation: { latitude: 0, longitude: 0 } }, { limit: hospitals.length, now: new Date(0) });
  return new Set(ranked.filter((item) => need.every((category) => item.matchedResources.includes(category))).map((item) => item.hospitalId));
}

function unservedReason(patient: AllocationPatient, hospitals: AllocationHospital[], ledger: ReservationLedger): UnservedReason {
  if (!hospitals.length) return "no_compatible_resource";
  const matchingType = hospitals.filter((hospital) => (hospital.supportedTypes?.includes(patient.resourceType) || hospital.confirmedFree[patient.resourceType] > 0 || ledger.reservations.some((item) => item.hospitalId === hospital.id && item.resourceType === patient.resourceType)));
  if (!matchingType.length) return "no_compatible_resource";
  const capable = matchingType.filter((hospital) => !patient.capability || hospital.capabilities.includes(patient.capability));
  if (!capable.length) return "no_capability_match";
  if (capable.every((hospital) => hospital.closedTypes.includes(patient.resourceType) || ledger.isClosed(hospital.id, patient.resourceType))) return "hospitals_closed";
  return "capacity_exhausted";
}

function allCompatibleHospitalsBeyondLimit(patient: AllocationPatient, hospitals: AllocationHospital[]): boolean {
  if (patient.travelTimeLimitMin === undefined) return false;
  const compatible = hospitals.filter((hospital) =>
    (hospital.supportedTypes?.includes(patient.resourceType) || hospital.confirmedFree[patient.resourceType] > 0)
    && (!patient.capability || hospital.capabilities.includes(patient.capability)),
  );
  return compatible.length > 0 && compatible.every((hospital) => hospital.travelTimeMinutes > patient.travelTimeLimitMin!);
}

export function createReplanState(patients: AllocationPatient[] = []): ReplanState {
  return { patients: new Map(patients.map((patient) => [patient.id, { ...patient }])), reroutes: new Map(), arrivalFailures: new Map(), rejectedHospitals: new Map() };
}

export function allocateBatch(patients: AllocationPatient[], hospitals: AllocationHospital[], forecaster: AvailabilityForecaster, ledger = new ReservationLedger(hospitals), state?: ReplanState): AllocationResult {
  const assignments = [] as AllocationResult["assignments"];
  const unserved: AllocationResult["unserved"] = [];
  for (const patient of patients) state?.patients.set(patient.id, { ...patient });
  const allocatedByType = new Map<SimResourceType, Array<{ hospitalId: string; urgency: 1 | 2 | 3 }>>();
  const processedPatients = new Set<string>();
  const sorted = [...patients].sort((a, b) => URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency] || b.waitingMinutes - a.waitingMinutes || a.id.localeCompare(b.id));
  for (const patient of sorted) {
    if (processedPatients.has(patient.id)) continue;
    processedPatients.add(patient.id);
    const feasible = feasibleByExistingRanking(patient, hospitals, ledger);
    const candidates = hospitals.filter((hospital) => feasible.has(hospital.id) && !hospital.closedTypes.includes(patient.resourceType) && ledger.freeUnits(hospital.id, patient.resourceType) > 0)
      .map((hospital) => {
        const { probability, fallback } = forecastOrBaseline(forecaster, { hospital, patient, unitsNeeded: 1 });
        const cost = hospital.travelTimeMinutes + (1 - probability) * REROUTE_PENALTY_MIN;
        return { hospital, probability, fallback, cost };
      })
      .filter(({ hospital }) => patient.travelTimeLimitMin === undefined || hospital.travelTimeMinutes <= patient.travelTimeLimitMin)
      .sort((a, b) => a.cost - b.cost || a.hospital.rejectionRate - b.hospital.rejectionRate || a.hospital.id.localeCompare(b.hospital.id));
    let created = false;
    for (const candidate of candidates) {
      const result = ledger.reserve({ patientId: patient.id, batchId: patient.batchId, hospitalId: candidate.hospital.id, resourceType: patient.resourceType, requiredResourceType: patient.resourceType });
      if (!result) continue;
      if (!result.created && assignments.some((assignment) => assignment.patientId === patient.id)) break;
      assignments.push({
        patientId: patient.id, hospitalId: candidate.hospital.id, reservationId: result.reservation.id,
        p_available: candidate.probability, travelTimeMinutes: candidate.hospital.travelTimeMinutes, cost: candidate.cost,
        reason: candidate.fallback ? "Assigned using current-capacity forecast fallback." : "Lowest-cost feasible hospital by travel time and arrival-availability forecast.",
      });
      const winners = allocatedByType.get(patient.resourceType) ?? [];
      winners.push({ hospitalId: candidate.hospital.id, urgency: patient.urgency });
      allocatedByType.set(patient.resourceType, winners);
      created = true;
      break;
    }
    if (!created) {
      let reason: UnservedReason = unservedReason(patient, hospitals, ledger);
      if (reason === "capacity_exhausted" && allCompatibleHospitalsBeyondLimit(patient, hospitals)) reason = "travel_time_limit";
      if (reason === "capacity_exhausted" && (allocatedByType.get(patient.resourceType) ?? []).some(({ hospitalId, urgency }) => {
        const hospital = hospitals.find((item) => item.id === hospitalId);
        return urgency < patient.urgency && Boolean(hospital) && (!patient.capability || hospital!.capabilities.includes(patient.capability)) && !hospital!.closedTypes.includes(patient.resourceType);
      })) reason = "displaced_by_higher_priority";
      unserved.push({ patientId: patient.id, reason });
    }
  }
  ledger.assertInvariants();
  return { assignments, unserved };
}

function replanOne(patient: AllocationPatient, hospitals: AllocationHospital[], forecaster: AvailabilityForecaster, ledger: ReservationLedger, state: ReplanState, trigger: ReplanEvent["type"]): AllocationResult {
  const reroutes = state.reroutes.get(patient.id) ?? 0;
  if (reroutes >= MAX_REROUTES_PER_PATIENT || (trigger === "arrival_failure" && (state.arrivalFailures.get(patient.id) ?? 0) >= 2)) {
    return { assignments: [], unserved: [{ patientId: patient.id, reason: "handover_failed" }] };
  }
  state.reroutes.set(patient.id, reroutes + 1);
  const rejected = state.rejectedHospitals.get(patient.id) ?? new Set<string>();
  const patientHospitals = hospitals.map((hospital) => rejected.has(hospital.id)
    ? { ...hospital, closedTypes: [...new Set([...hospital.closedTypes, patient.resourceType])] }
    : hospital);
  const result = allocateBatch([patient], patientHospitals, forecaster, ledger, state);
  if (result.assignments.length === 0 && trigger === "hospital_rejection") result.unserved[0] = { patientId: patient.id, reason: "rejected_no_alternative" };
  return result;
}

/** Apply a single operational trigger and replan only its affected patient(s). */
export function replan(event: ReplanEvent, hospitals: AllocationHospital[], forecaster: AvailabilityForecaster, ledger: ReservationLedger, state: ReplanState): AllocationResult {
  const affected = event.type === "closure"
    ? ledger.getActiveReservations().filter((item) => item.hospitalId === event.hospitalId && item.resourceType === event.resourceType)
    : [ledger.reservations.find((item) => item.id === event.reservationId)].filter((item): item is NonNullable<typeof item> => {
      if (!item) return false;
      if (event.type === "hospital_rejection") return item.status === "requested";
      if (event.type === "resource_loss") return item.status === "requested" || item.status === "confirmed" || item.status === "arrived";
      if (event.type === "eta_change") return item.status === "requested" || item.status === "confirmed";
      return item.status === "arrived";
    });
  if (!affected.length) return { assignments: [], unserved: [] };
  if (event.type === "hospital_rejection") {
    for (const reservation of affected) {
      ledger.transition(reservation.id, "rejected", event.at, "hospital", "hospital rejected reservation");
      const rejected = state.rejectedHospitals.get(reservation.patientId) ?? new Set<string>();
      rejected.add(reservation.hospitalId);
      state.rejectedHospitals.set(reservation.patientId, rejected);
    }
  } else if (event.type === "resource_loss") {
    for (const reservation of affected) {
      const terminal = reservation.status === "requested" ? "cancelled" : reservation.status === "arrived" ? "arrival_failed" : "lost";
      ledger.transition(reservation.id, terminal, event.at, "event", "reserved unit lost");
      ledger.setConfirmedFree(reservation.hospitalId, reservation.resourceType, Math.max(0, ledger.getConfirmedFree(reservation.hospitalId, reservation.resourceType) - 1), event.at);
    }
  } else if (event.type === "closure") {
    ledger.setClosed(event.hospitalId, event.resourceType, true, event.at);
  } else if (event.type === "eta_change") {
    const reservation = affected[0];
    const patient = state.patients.get(reservation.patientId);
    if (!patient || Math.abs(event.newEtaMin - patient.etaMin) <= ETA_REPLAN_THRESHOLD_MIN) return { assignments: [], unserved: [] };
    state.patients.set(patient.id, { ...patient, etaMin: event.newEtaMin });
    ledger.transition(reservation.id, "cancelled", event.at, "event", "ETA changed beyond replan threshold");
  } else if (event.type === "arrival_failure") {
    for (const reservation of affected) {
      ledger.transition(reservation.id, "arrival_failed", event.at, "hospital", "no compatible unit available on arrival");
      const failures = (state.arrivalFailures.get(reservation.patientId) ?? 0) + 1;
      state.arrivalFailures.set(reservation.patientId, failures);
      ledger.setConfirmedFree(reservation.hospitalId, reservation.resourceType, Math.max(0, ledger.getConfirmedFree(reservation.hospitalId, reservation.resourceType) - 1), event.at);
    }
  }

  const results: AllocationResult[] = [];
  for (const reservation of affected) {
    const patient = state.patients.get(reservation.patientId);
    if (!patient) continue;
    const failedTwice = event.type === "arrival_failure" && (state.arrivalFailures.get(patient.id) ?? 0) >= 2;
    results.push(failedTwice
      ? { assignments: [], unserved: [{ patientId: patient.id, reason: "handover_failed" }] }
      : replanOne(event.type === "eta_change" ? state.patients.get(patient.id)! : patient, hospitals, forecaster, ledger, state, event.type));
  }
  ledger.assertInvariants();
  return { assignments: results.flatMap((result) => result.assignments), unserved: results.flatMap((result) => result.unserved) };
}
