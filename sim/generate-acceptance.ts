import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulateWorld, GENERATOR } from "./world.ts";
import { simulateAcceptance } from "./acceptance-world.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "data", "synthetic", "acceptance");
const seed = Number(process.env.REC_SEED ?? GENERATOR.baseSeed);
if (!Number.isInteger(seed) || seed < 0) throw new RangeError("REC_SEED must be a non-negative integer.");
async function main() {
  const world = simulateWorld(seed);
  const period = simulateAcceptance(world.days, seed);
  await mkdir(output, { recursive: true });
  for (const [name, min, max] of [["train", 1, 30], ["val", 31, 40], ["test", 41, 50]] as const) {
    const samples = period.samples.filter((sample) => sample.day >= min && sample.day <= max);
    await writeFile(join(output, `${name}.json`), `${JSON.stringify({ seed, split: name === "val" ? "validation" : name, days: [min, max], samples })}\n`, "utf8");
  }
  console.log(`Generated ${period.samples.length} synthetic acceptance decisions (seed ${seed}); split by day 1–30, 31–40, and 41–50.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
