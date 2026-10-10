import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ScenarioDemo, { type DemoScenario } from "./scenario-demo";

export const metadata = { title: "Allocation simulation | CareLink", description: "Synthetic hospital allocation scenarios." };

export default async function SurgeDemoPage() {
  const scenarioIds = ["S1", "S2", "S3", "S4", "S5", "S6"];
  const scenarios = await Promise.all(scenarioIds.map(async (id) => JSON.parse(await readFile(join(process.cwd(), "data", "scenarios", `${id}.json`), "utf8")) as DemoScenario));
  const metrics = JSON.parse(await readFile(join(process.cwd(), "model", "metrics.json"), "utf8")) as {
    test: { model: { brierScore: number }; baseline: { brierScore: number } };
  };
  const model = JSON.parse(await readFile(join(process.cwd(), "model", "model.json"), "utf8")) as {
    modelType: string; trainingPeriod: { days: [number, number] };
  };
  return <ScenarioDemo scenarios={scenarios} model={{ type: model.modelType, trainingDays: model.trainingPeriod.days, testBrier: metrics.test.model.brierScore, baselineBrier: metrics.test.baseline.brierScore }} />;
}
