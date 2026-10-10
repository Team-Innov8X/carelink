export const RESOURCE_TYPES = ["icu_bed", "emergency_bed"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface HospitalSpec {
  id: string;
  name: string;
  capacity: Record<ResourceType, number>;
  walkInRatePerMinute: Record<ResourceType, number>;
  rejectionRate: number;
  capabilities: string[];
}

export interface SimEvent {
  minute: number;
  hospitalId: string;
  resourceType: ResourceType;
  kind: "surge_start" | "closure_start" | "resource_loss";
  durationMinutes?: number;
  multiplier?: number;
  unitsLost?: number;
}

export interface HospitalDay {
  hospitalId: string;
  resourceType: ResourceType;
  initialCapacity: number;
  /** Ground truth only: actual free units after occupancy, closure, and resource loss. */
  groundTruth: {
    freeUnits: number[];
    operationalCapacity: number[];
    isOpen: boolean[];
  };
  /** Decision-time observations: known capacity, occupancy, arrivals, and current availability. */
  observed: {
    occupancy: number[];
    knownCapacity: number[];
    availableUnits: number[];
    walkInArrivals: number[];
    admissionMinutes: number[];
  };
}

export interface SimDay {
  day: number;
  hospitals: HospitalDay[];
  /** Includes future events and is for evaluator/replay use only. */
  hiddenEvents: SimEvent[];
}

export interface DecisionSample {
  id: string;
  day: number;
  minute: number;
  hospitalId: string;
  resourceType: ResourceType;
  etaMin: number;
  unitsNeeded: number;
  /** This object is built only from the observed timelines at `minute`. */
  features: {
    freeNow: number;
    freeNowMinusK: number;
    k: number;
    occupancyRatio: number;
    etaMin: number;
    walkInsLast30Min: number;
    hour: number;
    weekend: number;
    resourceTypeIsIcu: number;
    closedNow: number;
  };
  /** Kept outside features so training code must opt in to the target explicitly. */
  label: 0 | 1;
}

export interface SimulatedPeriod {
  seed: number;
  days: SimDay[];
  samples: DecisionSample[];
}

export const HOSPITALS: HospitalSpec[] = [
  { id: "north", name: "North General", capacity: { icu_bed: 8, emergency_bed: 18 }, walkInRatePerMinute: { icu_bed: 0.0024, emergency_bed: 0.035 }, rejectionRate: 0.04, capabilities: ["cardiac", "trauma"] },
  { id: "east", name: "East Medical", capacity: { icu_bed: 6, emergency_bed: 14 }, walkInRatePerMinute: { icu_bed: 0.0028, emergency_bed: 0.030 }, rejectionRate: 0.07, capabilities: ["cardiac"] },
  { id: "central", name: "Central Hospital", capacity: { icu_bed: 5, emergency_bed: 12 }, walkInRatePerMinute: { icu_bed: 0.0025, emergency_bed: 0.024 }, rejectionRate: 0.10, capabilities: ["trauma"] },
  { id: "west", name: "West Community", capacity: { icu_bed: 7, emergency_bed: 16 }, walkInRatePerMinute: { icu_bed: 0.0020, emergency_bed: 0.028 }, rejectionRate: 0.03, capabilities: [] },
];

export const GENERATOR = {
  days: 50,
  samplesPerDay: 240,
  walkInTimePattern: "1.0 + 0.6 * (0.5 + 0.5 * sin(2π * (minuteOfDay - 480) / 1440))",
  walkInRateMultiplierMax: 1.6,
  surgeProbabilityPerHospitalTypeDay: 0.11,
  surgeCountMaxPerDay: 2,
  surgeDurationMinutes: [30, 90] as const,
  surgeDemandMultiplier: 2.8,
  closureProbabilityPerHospitalTypeDay: 0.018,
  closureDurationMinutes: [20, 75] as const,
  resourceLossProbabilityPerHospitalTypeDay: 0.008,
  resourceLossUnits: 1,
  emergencyStayLogNormal: { medianMinutes: 330, sigma: 0.72 },
  icuStayLogNormal: { medianMinutes: 60 * 60, sigma: 0.58 },
  initialOccupancyFraction: [0.2, 0.72] as const,
  decisionEtaMinutes: [10, 60] as const,
  maxUnitsNeeded: 5,
  baseSeed: 20261011,
};

/** Mulberry32: every stochastic decision in the world uses a local seeded stream. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function poisson(lambda: number, random: () => number): number {
  if (lambda <= 0) return 0;
  // Rates here are below 0.2/minute, so Knuth's exact sampler is inexpensive.
  const cutoff = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > cutoff);
  return count - 1;
}

function normal(random: () => number): number {
  const first = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function stayLength(resourceType: ResourceType, random: () => number): number {
  const parameters = resourceType === "icu_bed" ? GENERATOR.icuStayLogNormal : GENERATOR.emergencyStayLogNormal;
  return Math.max(1, Math.round(parameters.medianMinutes * Math.exp(parameters.sigma * normal(random))));
}

interface ActiveStay { releaseMinute: number }

/** Creates a complete 50-day minute-resolution ground-truth world and observable record. */
export function simulateWorld(seed = GENERATOR.baseSeed): SimulatedPeriod {
  const random = createRng(seed);
  const days: SimDay[] = [];
  const state = new Map<string, { active: ActiveStay[]; nextId: number }>();

  for (const hospital of HOSPITALS) for (const resourceType of RESOURCE_TYPES) {
    const key = `${hospital.id}:${resourceType}`;
    const fraction = GENERATOR.initialOccupancyFraction[0] + random() * (GENERATOR.initialOccupancyFraction[1] - GENERATOR.initialOccupancyFraction[0]);
    const occupied = Math.floor(hospital.capacity[resourceType] * fraction);
    const active = Array.from({ length: occupied }, () => ({ releaseMinute: stayLength(resourceType, random) }));
    state.set(key, { active, nextId: occupied });
  }

  for (let day = 1; day <= GENERATOR.days; day += 1) {
    const hiddenEvents: SimEvent[] = [];
    const hospitalDays: HospitalDay[] = [];
    const globalDayStart = (day - 1) * 1440;
    for (const hospital of HOSPITALS) for (const resourceType of RESOURCE_TYPES) {
      const randomEvents = random();
      if (randomEvents < GENERATOR.surgeProbabilityPerHospitalTypeDay) {
        const minute = Math.floor(random() * (1440 - GENERATOR.surgeDurationMinutes[0]));
        const count = random() < 0.18 ? 2 : 1;
        for (let index = 0; index < count; index += 1) {
          const start = Math.min(1440 - GENERATOR.surgeDurationMinutes[0], minute + index * (35 + Math.floor(random() * 30)));
          const requestedDuration = GENERATOR.surgeDurationMinutes[0] + Math.floor(random() * (GENERATOR.surgeDurationMinutes[1] - GENERATOR.surgeDurationMinutes[0] + 1));
          const actualDuration = Math.min(requestedDuration, 1440 - start);
          hiddenEvents.push({ minute: start, hospitalId: hospital.id, resourceType, kind: "surge_start", durationMinutes: actualDuration, multiplier: GENERATOR.surgeDemandMultiplier });
        }
      }
      if (random() < GENERATOR.closureProbabilityPerHospitalTypeDay) {
        const durationMinutes = 20 + Math.floor(random() * 56);
        const minute = Math.floor(random() * (1440 - durationMinutes));
        hiddenEvents.push({ minute, hospitalId: hospital.id, resourceType, kind: "closure_start", durationMinutes });
      }
      if (random() < GENERATOR.resourceLossProbabilityPerHospitalTypeDay) {
        const minute = Math.floor(random() * 1440);
        hiddenEvents.push({ minute, hospitalId: hospital.id, resourceType, kind: "resource_loss", unitsLost: GENERATOR.resourceLossUnits });
      }
    }

    for (const hospital of HOSPITALS) for (const resourceType of RESOURCE_TYPES) {
      const key = `${hospital.id}:${resourceType}`;
      const hospitalState = state.get(key)!;
      const capacity = hospital.capacity[resourceType];
      const freeUnits: number[] = [];
      const operationalCapacity: number[] = [];
      const isOpen: boolean[] = [];
      const occupancy: number[] = [];
      const knownCapacity: number[] = [];
      const availableUnits: number[] = [];
      const walkInArrivals: number[] = [];
      const admissionMinutes: number[] = [];
      const lostAt = hiddenEvents.find((event) => event.hospitalId === hospital.id && event.resourceType === resourceType && event.kind === "resource_loss")?.minute ?? Infinity;

      for (let minute = 0; minute < 1440; minute += 1) {
        const absoluteMinute = globalDayStart + minute;
        hospitalState.active = hospitalState.active.filter((stay) => stay.releaseMinute > absoluteMinute);
        const closed = hiddenEvents.some((event) => event.hospitalId === hospital.id && event.resourceType === resourceType && event.kind === "closure_start" && minute >= event.minute && minute < event.minute + (event.durationMinutes ?? 0));
        const activeSurge = hiddenEvents.some((event) => event.hospitalId === hospital.id && event.resourceType === resourceType && event.kind === "surge_start" && minute >= event.minute && minute < event.minute + (event.durationMinutes ?? 0));
        const lost = minute >= lostAt ? GENERATOR.resourceLossUnits : 0;
        const currentCapacity = Math.max(0, capacity - lost);
        const canAdmit = !closed;
      const timePattern = 1.0 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (minute - 480) / 1440));
        const lambda = hospital.walkInRatePerMinute[resourceType] * timePattern * (activeSurge ? GENERATOR.surgeDemandMultiplier : 1);
        const arrivals = canAdmit ? poisson(lambda, random) : 0;
        let accepted = 0;
        for (let index = 0; index < arrivals; index += 1) {
          if (hospitalState.active.length >= currentCapacity) break;
          hospitalState.nextId += 1;
          hospitalState.active.push({ releaseMinute: absoluteMinute + stayLength(resourceType, random) });
          accepted += 1;
        }
        if (accepted > 0) admissionMinutes.push(minute);
        const occupied = hospitalState.active.length;
        const free = closed ? 0 : Math.max(0, currentCapacity - occupied);
        freeUnits.push(free);
        operationalCapacity.push(closed ? 0 : currentCapacity);
        isOpen.push(!closed);
        occupancy.push(occupied);
        knownCapacity.push(currentCapacity);
        availableUnits.push(free);
        walkInArrivals.push(arrivals);
      }
      hospitalDays.push({
        hospitalId: hospital.id,
        resourceType,
        initialCapacity: capacity,
        groundTruth: { freeUnits, operationalCapacity, isOpen },
        observed: { occupancy, knownCapacity, availableUnits, walkInArrivals, admissionMinutes },
      });
    }
    days.push({ day, hospitals: hospitalDays, hiddenEvents });
  }

  const samples = createDecisionSamples(days, seed);
  return { seed, days, samples };
}

export function createDecisionSamples(days: SimDay[], seed: number): DecisionSample[] {
  const random = createRng(seed ^ 0xa5a5a5a5);
  const samples: DecisionSample[] = [];
  for (const day of days) {
    for (let index = 0; index < GENERATOR.samplesPerDay; index += 1) {
      const minute = 60 + Math.floor(random() * 1320);
      const hospitalDay = day.hospitals[Math.floor(random() * day.hospitals.length)];
      const etaMin = GENERATOR.decisionEtaMinutes[0] + Math.floor(random() * (GENERATOR.decisionEtaMinutes[1] - GENERATOR.decisionEtaMinutes[0] + 1));
      const unitsNeeded = 1 + Math.floor(random() * GENERATOR.maxUnitsNeeded);
      const arrivalMinute = minute + etaMin;
      const freeNow = hospitalDay.observed.availableUnits[minute];
      const freeAtArrival = arrivalMinute < 1440 ? hospitalDay.groundTruth.freeUnits[arrivalMinute] : 0;
      const currentCapacity = Math.max(1, hospitalDay.observed.knownCapacity[minute]);
      const walkInsLast30Min = hospitalDay.observed.walkInArrivals.slice(Math.max(0, minute - 30), minute).reduce((sum, value) => sum + value, 0);
      const closedNow = hospitalDay.groundTruth.isOpen[minute] ? 0 : 1;
      samples.push({
        id: `d${day.day}-${hospitalDay.hospitalId}-${hospitalDay.resourceType}-${String(index).padStart(3, "0")}`,
        day: day.day,
        minute,
        hospitalId: hospitalDay.hospitalId,
        resourceType: hospitalDay.resourceType,
        etaMin,
        unitsNeeded,
        features: {
          freeNow,
          freeNowMinusK: freeNow - unitsNeeded,
          k: unitsNeeded,
          occupancyRatio: hospitalDay.observed.occupancy[minute] / currentCapacity,
          etaMin,
          walkInsLast30Min,
          hour: Math.floor(minute / 60),
          weekend: (day.day - 1) % 7 >= 5 ? 1 : 0,
          resourceTypeIsIcu: hospitalDay.resourceType === "icu_bed" ? 1 : 0,
          closedNow,
        },
        label: freeAtArrival >= unitsNeeded ? 1 : 0,
      });
    }
  }
  return samples;
}

/** Recomputes decision labels from the raw future-free timeline. */
export function deriveLabelFromTimeline(hospitalDay: HospitalDay, minute: number, etaMin: number, k: number): 0 | 1 {
  const arrivalMinute = minute + etaMin;
  return arrivalMinute < 1440 && hospitalDay.groundTruth.freeUnits[arrivalMinute] >= k ? 1 : 0;
}
