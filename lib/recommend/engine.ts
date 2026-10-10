import conditions from "../../data/conditions.json";
import profiles from "../../data/hospital-profiles.json";
import { allocateBatch } from "../allocation/engine.ts";
import { ReservationLedger } from "../allocation/ledger.ts";
import type { AllocationHospital, AllocationPatient, SimResourceType } from "../allocation/types.ts";
import { RECOMMENDATION } from "./constants.ts";

export type Condition = (typeof conditions)[number];
export type RecommendationAvailabilityPredictor = (hospital: RecommendationHospital, patient: AllocationPatient) => number;
const currentCapacityPredictor: RecommendationAvailabilityPredictor = (hospital, patient) => hospital.confirmedFree[patient.resourceType] > 0 ? 1 : 0;
export type RecommendationHospital = AllocationHospital & {
  coordinates: { latitude: number; longitude: number };
  occupancyRatio: number;
  recentRejectionRate: number;
  walkInsLast30Min: number;
  capacity: number;
  casesHandled: Record<string, number>;
  /** Optional acceptance score input; production passes the feature-builder output. */
  acceptanceFeatures?: number[];
};
export type Recommendation = {
  hospitalId: string; hospitalName: string; travelTimeMinutes: number; p_available: number; p_accept: number;
  experienceScore: number; cost: number; reasons: string[]; fallbackFlags: string[];
};

export const CONDITIONS: Condition[] = conditions as Condition[];

export function patientForCondition(patientId: string, conditionId: string, etaMin: number): AllocationPatient {
  const condition = CONDITIONS.find((candidate) => candidate.id === conditionId);
  if (!condition) throw new RangeError("Choose a configured patient condition.");
  return {
    id: patientId, batchId: patientId, urgency: condition.urgency as 1 | 2 | 3,
    waitingMinutes: 0, resourceType: condition.resourceType as SimResourceType,
    ...(condition.capability ? { capability: condition.capability } : {}), etaMin,
    travelTimeLimitMin: RECOMMENDATION.maxTravelMin,
  };
}

/** Feasibility is checked by the existing allocateBatch engine before any model score is applied. */
export function rankConditionHospitals(input: {
  patient: AllocationPatient;
  conditionId: string;
  hospitals: RecommendationHospital[];
  ledger: ReservationLedger;
  availabilityProbability?: RecommendationAvailabilityPredictor;
  rejectedHospitalIds?: Set<string>;
  acceptanceProbability?: (hospital: RecommendationHospital) => number;
  override?: { hospitalId: string; reason: string };
}) {
  const condition = CONDITIONS.find((candidate) => candidate.id === input.conditionId);
  if (!condition) throw new RangeError("Choose a configured patient condition.");
  const fallbacks = new Set<string>();
  const feasible = input.hospitals.flatMap((hospital) => {
    if (input.rejectedHospitalIds?.has(hospital.id)) return [];
    if (condition.capability && !hospital.capabilities.includes(condition.capability)) return [];
    if (hospital.travelTimeMinutes > RECOMMENDATION.maxTravelMin) return [];
    const current = { ...hospital, confirmedFree: { ...hospital.confirmedFree, [input.patient.resourceType]: input.ledger.freeUnits(hospital.id, input.patient.resourceType) } };
    const isolatedLedger = new ReservationLedger([current]);
    const allocation = allocateBatch([input.patient], [current], ({ hospital, patient }) => currentCapacityPredictor(hospital as RecommendationHospital, patient), isolatedLedger);
    return allocation.assignments.length === 1 ? [current] : [];
  });

  const ranked: Recommendation[] = feasible.map((hospital) => {
    let pAvailable = currentCapacityPredictor(hospital, input.patient);
    try {
      if (!input.availabilityProbability) throw new Error("Availability forecaster unavailable.");
      const prediction = input.availabilityProbability(hospital, input.patient);
      if (!Number.isFinite(prediction) || prediction < 0 || prediction > 1) throw new RangeError("Availability model returned invalid probability.");
      pAvailable = prediction;
    } catch {
      fallbacks.add("forecast_fallback");
    }
    let pAccept = 1;
    try {
      const prediction = input.acceptanceProbability?.(hospital);
      if (prediction === undefined || !Number.isFinite(prediction) || prediction < 0 || prediction > 1) throw new RangeError("Acceptance model returned invalid probability.");
      pAccept = prediction;
    } catch {
      fallbacks.add("accept_model_fallback");
    }
    const profile = profiles.find((item) => item.hospitalId === hospital.id);
    const experienceScore = Math.min(1, Math.max(0, (hospital.casesHandled[condition.id] ?? profile?.casesHandled[condition.id as keyof typeof profile.casesHandled] ?? 0) / 100));
    const cost = hospital.travelTimeMinutes + (1 - pAvailable) * RECOMMENDATION.reroutePenaltyMin
      + (1 - pAccept) * RECOMMENDATION.rejectPenaltyMin - RECOMMENDATION.experienceBonus * experienceScore;
    const capabilityMatch = !condition.capability || hospital.capabilities.includes(condition.capability);
    const reasons = [
      capabilityMatch ? "Required capability matches." : "Required capability does not match.",
      `Expected free-bed chance at arrival: ${Math.round(pAvailable * 100)}%.`,
      `Simulated acceptance likelihood: ${Math.round(pAccept * 100)}%.`,
      `Estimated travel: ${hospital.travelTimeMinutes} min.`,
      `Simulated case experience: ${hospital.casesHandled[condition.id] ?? profile?.casesHandled[condition.id as keyof typeof profile.casesHandled] ?? 0} cases.`,
    ];
    return { hospitalId: hospital.id, hospitalName: hospital.name, travelTimeMinutes: hospital.travelTimeMinutes, p_available: pAvailable, p_accept: pAccept, experienceScore, cost, reasons, fallbackFlags: [] };
  }).sort((a, b) => a.cost - b.cost || a.hospitalId.localeCompare(b.hospitalId));

  let overrideApplied = false;
  if (input.override) {
    if (!input.override.reason.trim()) throw new RangeError("A reason is required for a destination override.");
    const index = ranked.findIndex((item) => item.hospitalId === input.override!.hospitalId);
    if (index < 0) throw new RangeError("The chosen override is not feasible under the hard allocation rules.");
    ranked.unshift(...ranked.splice(index, 1));
    overrideApplied = true;
  }
  for (const item of ranked) item.fallbackFlags = [...fallbacks];
  return { ranked, chosen: ranked[0] ?? null, fallbackFlags: [...fallbacks], overrideApplied, overrideReason: overrideApplied ? input.override?.reason.trim() : undefined };
}

