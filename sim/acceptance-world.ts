import conditions from "../data/conditions.json";
import profiles from "../data/hospital-profiles.json";
import { createRng, HOSPITALS, type ResourceType, type SimDay } from "./world.ts";
import { ACCEPTANCE_FEATURE_ORDER } from "../lib/recommend/accept-features.ts";

export { ACCEPTANCE_FEATURE_ORDER };
export type AcceptanceVector = number[];
export type AcceptanceSample = {
  id: string; day: number; minute: number; hospitalId: string; conditionId: string; label: 0 | 1;
  features: AcceptanceVector;
  /** Ground-truth-only fields; never passed to the feature builder. */
  raw: { rejectionProbability: number; draw: number; occupancyPressure: number; surgeActive: boolean; nearClosure: boolean; capabilityMismatch: boolean };
};
export type AcceptancePeriod = { seed: number; samples: AcceptanceSample[] };

const profileById = new Map(profiles.map((profile) => [profile.hospitalId, profile]));
export function acceptanceFeatureVector(sample: Pick<AcceptanceSample, "features">): AcceptanceVector {
  if (sample.features.length !== ACCEPTANCE_FEATURE_ORDER.length || sample.features.some((value) => !Number.isFinite(value))) throw new RangeError("Invalid acceptance feature vector.");
  return [...sample.features];
}

function hasEvent(day: SimDay, hospitalId: string, minute: number, kind: "surge_start" | "closure_start", lookAhead: number) {
  return day.hiddenEvents.some((event) => event.hospitalId === hospitalId && event.kind === kind && event.minute <= minute + lookAhead && event.minute + (event.durationMinutes ?? 0) >= minute);
}

/** Synthetic hospital response decisions. Latent surge/closure signals are kept only in raw event rows. */
export function simulateAcceptance(days: SimDay[], seed: number): AcceptancePeriod {
  const random = createRng(seed ^ 0x51a7c3);
  const samples: AcceptanceSample[] = [];
  const history = new Map<string, Array<{ at: number; rejected: boolean }>>();
  const base = HOSPITALS.map((hospital) => [hospital.id, hospital.rejectionRate] as const);
  const baseById = new Map(base);
  const decisions = days.flatMap((day) => HOSPITALS.flatMap((hospital) => conditions.flatMap((condition) =>
    Array.from({ length: 16 }, (_, slot) => ({ day, hospital, condition, slot }))))
    .map((item, index) => ({ ...item, minute: (6 + item.slot) * 60 + Math.floor(random() * 45), index })))
    .sort((a, b) => a.day.day - b.day.day || a.minute - b.minute || a.hospital.id.localeCompare(b.hospital.id) || a.condition.id.localeCompare(b.condition.id));

  for (const item of decisions) {
    const { day, hospital, condition } = item;
    const type = condition.resourceType as ResourceType;
    const hospitalDay = day.hospitals.find((candidate) => candidate.hospitalId === hospital.id && candidate.resourceType === type)!;
    const raw = hospitalDay.observed;
    const profile = profileById.get(hospital.id)!;
    const key = hospital.id;
    const now = (day.day - 1) * 1440 + item.minute;
    const prior = (history.get(key) ?? []).filter((event) => event.at >= now - 60);
    const recentRate = prior.length ? prior.filter((event) => event.rejected).length / prior.length : baseById.get(key)!;
    const occupancy = raw.occupancy[item.minute] / Math.max(1, raw.knownCapacity[item.minute]);
    const surgeActive = hasEvent(day, hospital.id, item.minute, "surge_start", 0);
    const nearClosure = hasEvent(day, hospital.id, item.minute, "closure_start", 90);
    const capabilityMatch = condition.capability ? profile.capabilities.includes(condition.capability) : true;
    const walkIns = raw.walkInArrivals.slice(Math.max(0, item.minute - 30), item.minute).reduce((sum, count) => sum + count, 0);
    const pressure = Math.max(0, occupancy - 0.65) * 0.28;
    const probability = Math.max(0.05, Math.min(0.4, baseById.get(key)! + pressure + (surgeActive ? 0.06 : 0) + (nearClosure ? 0.07 : 0) + (!capabilityMatch ? 0.08 : 0) + recentRate * 0.12));
    const draw = random();
    const rejected = draw < probability;
    const hour = item.minute / 60;
    const eta = 10 + Math.floor(random() * 51);
    const features = [
      raw.availableUnits[item.minute], occupancy, recentRate, walkIns, condition.urgency,
      ...conditions.map((candidate) => candidate.id === condition.id ? 1 : 0),
      capabilityMatch ? 1 : 0, eta, hospital.capacity[type],
      Math.sin((2 * Math.PI * hour) / 24), Math.cos((2 * Math.PI * hour) / 24), ((day.day - 1) % 7 >= 5) ? 1 : 0,
    ];
    samples.push({
      id: `accept-d${day.day}-${hospital.id}-${condition.id}-${item.index}`,
      day: day.day, minute: item.minute, hospitalId: hospital.id, conditionId: condition.id,
      features,
      label: rejected ? 0 : 1,
      raw: { rejectionProbability: probability, draw, occupancyPressure: pressure, surgeActive, nearClosure, capabilityMismatch: !capabilityMatch },
    });
    const bucket = history.get(key) ?? [];
    bucket.push({ at: now, rejected });
    history.set(key, bucket.filter((event) => event.at >= now - 60));
  }
  return { seed, samples };
}

export function deriveAcceptanceLabel(raw: AcceptanceSample["raw"]): 0 | 1 { return raw.draw < raw.rejectionProbability ? 0 : 1; }
