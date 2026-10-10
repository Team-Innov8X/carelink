import type { DecisionSample } from "../../sim/world.ts";
import type { ResourceAvailabilityForecaster } from "./forecaster.ts";

/** Current-capacity-only baseline: no forecast when current confirmed capacity is insufficient. */
export const baselineForecaster: ResourceAvailabilityForecaster = (sample: DecisionSample) =>
  sample.features.freeNow >= sample.unitsNeeded ? 1 : 0;
