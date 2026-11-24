// Re-runs the current checks on the SVGs saved in results.json, with no API calls:  npm run recheck
// Use it after fixing a check, so every saved result is judged by the same version of the checks.
// The attempts log is kept as it was (it shows what the checks said at generation time).

import { readFileSync, writeFileSync } from "node:fs";
import { CONCEPTS } from "../lib/concepts";
import { runChecks } from "../lib/checks";
import type { DiagramResult } from "../lib/pipeline";

type Saved = DiagramResult & { recheckedAt?: string };

const file = JSON.parse(readFileSync("results.json", "utf8")) as { updatedAt: string; results: Saved[] };

for (const r of file.results) {
  const concept = CONCEPTS.find((c) => c.id === r.conceptId);
  if (!concept || !r.svg) continue;
  const checks = runChecks(r.svg, concept);
  const passed = checks.every((c) => c.passed);
  const changed = checks.filter((c) => r.checks.find((old) => old.id === c.id)?.passed !== c.passed);
  console.log(
    `${r.conceptId.padEnd(18)} ${r.passed ? "PASS" : "FAIL"} -> ${passed ? "PASS" : "FAIL"}` +
      (changed.length ? `  changed: ${changed.map((c) => `${c.id}=${c.passed ? "pass" : "fail"}`).join(", ")}` : ""),
  );
  for (const c of checks.filter((c) => !c.passed)) console.log(`     ✗ ${c.name}: ${c.detail}`);
  r.checks = checks;
  r.passed = passed;
  r.recheckedAt = new Date().toISOString();
}

writeFileSync("results.json", JSON.stringify(file, null, 2) + "\n");
console.log("saved results.json");
