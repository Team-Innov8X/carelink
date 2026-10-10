import type { ResourceType, SimDay, SimulatedPeriod } from "./world.ts";

export type SplitName = "train" | "validation" | "test";
type SplitDataset = { seed: number; split: SplitName; days: SimDay[]; samples: SimulatedPeriod["samples"]; trainingStayDurations?: Record<ResourceType, number[]> };

export function splitForDay(day: number): SplitName {
  if (day >= 1 && day <= 30) return "train";
  if (day >= 31 && day <= 40) return "validation";
  if (day >= 41 && day <= 50) return "test";
  throw new RangeError(`Day ${day} is outside the configured 1–50 period.`);
}

export function splitPeriod(period: SimulatedPeriod): Record<SplitName, SplitDataset> {
  const output: Record<SplitName, SplitDataset> = {
    train: { seed: period.seed, split: "train", days: [], samples: [] },
    validation: { seed: period.seed, split: "validation", days: [], samples: [] },
    test: { seed: period.seed, split: "test", days: [], samples: [] },
  };
  for (const day of period.days) output[splitForDay(day.day)].days.push(day);
  for (const sample of period.samples) output[splitForDay(sample.day)].samples.push(sample);
  output.train.trainingStayDurations = {
    icu_bed: period.stayRecords.filter((stay) => stay.resourceType === "icu_bed" && stay.admissionDay <= 30 && stay.releaseDay <= 30).map((stay) => stay.durationMinutes).sort((a, b) => a - b),
    emergency_bed: period.stayRecords.filter((stay) => stay.resourceType === "emergency_bed" && stay.admissionDay <= 30 && stay.releaseDay <= 30).map((stay) => stay.durationMinutes).sort((a, b) => a - b),
  };
  return output;
}
