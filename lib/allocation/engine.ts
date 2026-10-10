import { rankHospitals, type RankingHospital } from "../ranking.ts";
import { MAX_REROUTES_PER_PATIENT, REROUTE_PENALTY_MIN, URGENCY_WEIGHT } from "./constants.ts";
import { ReservationLedger } from "./ledger.ts";
import type { AllocationHospital, AllocationPatient, AllocationResult, AvailabilityForecaster, ForecastInput, SimResourceType, UnservedReason } from "./types.ts";

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
    status: hospital.closedTypes.includes(patient.resourceType) ? "inactive" : "active",
    travelTimeMinutes: hospital.travelTimeMinutes,
    resources: [
      { category: resourceCategory(patient.resourceType), availableQuantity: ledger.freeUnits(hospital.id, patient.resourceType), updatedAt: new Date(0) },
      ...hospital.capabilities.map((category) => ({ category, availableQuantity: 1, updatedAt: new Date(0) })),
    ],
  }));
  const ranked = rankHospitals(candidates, { emergencyType: "allocation", requiredResources: need, ambulanceLocation: { latitude: 0, longitude: 0 } }, { limit: hospitals.length, now: new Date(0) });
  return new Set(ranked.filter((item) => need.every((category) => item.matchedResources.includes(category))).map((item) => item.hospitalId));
}

function unservedReason(patient: AllocationPatient, hospitals: AllocationHospital[], ledger: ReservationLedger): UnservedReason {
  if (!hospitals.length) return "no_compatible_resource";
  const matchingType = hospitals.filter((hospital) => (hospital.confirmedFree[patient.resourceType] > 0 || ledger.reservations.some((item) => item.hospitalId === hospital.id && item.resourceType === patient.resourceType)));
  if (!matchingType.length) return "no_compatible_resource";
  const capable = matchingType.filter((hospital) => !patient.capability || hospital.capabilities.includes(patient.capability));
  if (!capable.length) return "no_capability_match";
  if (capable.every((hospital) => hospital.closedTypes.includes(patient.resourceType))) return "hospitals_closed";
  return "capacity_exhausted";
}

export function allocateBatch(patients: AllocationPatient[], hospitals: AllocationHospital[], forecaster: AvailabilityForecaster, ledger = new ReservationLedger(hospitals)): AllocationResult {
  const assignments = [] as AllocationResult["assignments"];
  const unserved: AllocationResult["unserved"] = [];
  const sorted = [...patients].sort((a, b) => URGENCY_WEIGHT[b.urgency] - URGENCY_WEIGHT[a.urgency] || b.waitingMinutes - a.waitingMinutes || a.id.localeCompare(b.id));
  for (const patient of sorted) {
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
      created = true;
      break;
    }
    if (!created) unserved.push({ patientId: patient.id, reason: patient.travelTimeLimitMin !== undefined && hospitals.some((hospital) => hospital.travelTimeMinutes > patient.travelTimeLimitMin!) ? "travel_time_limit" : unservedReason(patient, hospitals, ledger) });
  }
  ledger.assertInvariants();
  return { assignments, unserved };
}

export function replanAffected(patient: AllocationPatient, hospitals: AllocationHospital[], forecaster: AvailabilityForecaster, ledger: ReservationLedger, reroutes: number): AllocationResult {
  if (reroutes >= MAX_REROUTES_PER_PATIENT) return { assignments: [], unserved: [{ patientId: patient.id, reason: "handover_failed" }] };
  return allocateBatch([patient], hospitals, forecaster, ledger);
}
