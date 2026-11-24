// Prints the README results table from results.json:  npm run table
import { readFileSync } from "node:fs";
import type { DiagramResult } from "../lib/pipeline";

const { results } = JSON.parse(readFileSync("results.json", "utf8")) as { results: DiagramResult[] };

const rows = results.map((r) => {
  const failed = r.checks.filter((c) => !c.passed).map((c) => c.name);
  const status = r.error ? `Error: ${r.error}` : r.passed ? "Pass (all 6)" : `Fail: ${failed.join(", ")}`;
  return `| ${r.concept} | ${status} | $${r.costUsd.toFixed(5)} | ${r.retries} | ${r.apiRetries} | ${r.model} | ${r.inputTokens} / ${r.outputTokens} |`;
});
const total = results.reduce((s, r) => s + r.costUsd, 0);

console.log(
  [
    "| Concept | Checks | Est. cost (USD) | Retries | API retries | Model | Tokens in / out |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    `| **Total** | | **$${total.toFixed(5)}** | | | | |`,
  ].join("\n"),
);
