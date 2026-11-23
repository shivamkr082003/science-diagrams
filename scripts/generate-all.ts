// Runs Part A for the 5 concepts and saves results.json at the repo root.
//   npm run generate              -> all 5 concepts
//   npm run generate -- circle    -> only "circle" (other saved results are kept)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONCEPTS } from "../lib/concepts";
import { generateDiagram, type DiagramResult } from "../lib/pipeline";

const RESULTS_FILE = "results.json";
const GAP_MS = 5000; // pause between concepts to stay under the free-tier requests-per-minute limit

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const only = process.argv.slice(2);
  const concepts = only.length ? CONCEPTS.filter((c) => only.includes(c.id)) : CONCEPTS;
  if (!concepts.length) throw new Error(`Unknown concept id. Use one of: ${CONCEPTS.map((c) => c.id).join(", ")}`);

  const saved: DiagramResult[] = existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(RESULTS_FILE, "utf8")).results : [];
  const byId = new Map(saved.map((r) => [r.conceptId, r]));

  for (const [i, concept] of concepts.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    console.log(`\n=== ${concept.name} ===`);
    const result = await generateDiagram(concept);
    byId.set(concept.id, result);
    // Save after every concept so a crash halfway doesn't lose the earlier ones.
    const results = CONCEPTS.map((c) => byId.get(c.id)).filter(Boolean);
    writeFileSync(RESULTS_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), results }, null, 2) + "\n");
  }

  const all = CONCEPTS.map((c) => byId.get(c.id)).filter((r): r is DiagramResult => !!r);
  console.log("\nconcept            pass  cost($)    retries  apiRetries");
  for (const r of all) {
    console.log(
      `${r.conceptId.padEnd(18)} ${(r.passed ? "yes" : "no").padEnd(5)} ${r.costUsd.toFixed(6).padEnd(10)} ${String(r.retries).padEnd(8)} ${r.apiRetries}`,
    );
  }
  const total = all.reduce((s, r) => s + r.costUsd, 0);
  console.log(`total estimated cost: $${total.toFixed(6)}  -> saved ${RESULTS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
