// Part A: one concept in, one checked SVG out.
// Flow: ask model -> extract SVG -> sanitize -> run checks -> if any fail, retry ONCE
// telling the model exactly what failed -> return the result with a full cost/retry log.
// API-level retries (429/503) happen inside callGemini and are counted separately.

import { callGemini, getModelName, GeminiError } from "./gemini";
import { runChecks, extractSvg, sanitizeSvg, CHECK_NAMES, type CheckResult, type CheckId } from "./checks";
import { estimateCostUsd } from "./cost";
import type { Concept } from "./concepts";

const MAX_VALIDATION_RETRIES = 1; // the brief: "retry once and tell the model why it failed"

export type Attempt = {
  attempt: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  apiRetries: number;
  durationMs: number;
  checks: CheckResult[];
  error: string | null;
};

export type DiagramResult = {
  conceptId: string;
  concept: string;
  subject: string;
  model: string;
  svg: string | null;
  passed: boolean; // every check passed on the final attempt
  checks: CheckResult[]; // checks of the final attempt
  retries: number; // validation retries (0 or 1)
  apiRetries: number; // 429/503 retries across all attempts
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  attempts: Attempt[];
  sanitized: string[]; // anything unsafe we stripped from the SVG
  error: string | null; // set if the API failed and we have no diagram
  generatedAt: string;
  durationMs: number;
};

export const SYSTEM_PROMPT = `You are an expert illustrator of science diagrams for UK GCSE students (age 14-16).
You reply with ONE animated SVG and nothing else: no explanation, no markdown fences.

Hard rules (your SVG is checked by code and rejected if it breaks any of them):
1. Valid XML. Root is <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">. No width/height attributes.
2. Everything stays inside the viewBox, including while it animates. Keep a 20px margin from every edge.
   Text: font-size 14 to 22, font-family sans-serif. Estimate text width as about 0.55 x font-size per character
   and make sure long labels fit. Prefer text-anchor="middle" for centred labels.
   Labels must not overlap each other: leave clear space between them.
   Labels must not sit on top of lines or shapes they don't describe: put them beside the shape
   (e.g. "Lamp 1" next to the lamp symbol, never across it).
   Layout: title at the top (y < 70). Put the diagram and all of its labels in x 20-520.
   If you add a key or info panel, put it in x 540-780 and keep everything else out of that area.
3. The first child of <svg> is a <title> naming the concept. Use at least 3 <text> labels.
4. Animate with SMIL (<animate>, <animateTransform>, <animateMotion>) or CSS @keyframes in a <style> block.
   Give every shape its own fill colour (or fill="none"), even if an animation changes it later:
   a shape with no fill is drawn black until its animation starts.
   Animations loop forever (repeatCount="indefinite" or animation-iteration-count: infinite) and teach
   something (e.g. show movement, flow or a step-by-step build-up), not just decoration.
   Key information (labels, equations, values) must be visible most of the time: animate it by
   highlighting or moving, never by hiding it for most of the loop. No empty boxes waiting for text.
5. Use only plain shapes, paths and text. No <script>, <foreignObject>, <image>, external links or fonts.
6. Scientifically correct for GCSE. Use UK spelling (centre, colour). Use clear colours on a white
   background (add a white <rect> as the background) and make it readable for colour-blind students.`;

export function buildPrompt(concept: Concept): string {
  const terms = concept.requiredLabels.map((r) => `"${r.label}"`).join(", ");
  return `Draw an animated diagram for this ${concept.subject} concept: "${concept.name}".

Text for the diagram:
${concept.text}

What a good diagram shows:
${concept.visualBrief}

The diagram must include these terms as visible <text> labels: ${terms}.`;
}

export function buildRetryPrompt(concept: Concept, previousSvg: string | null, failed: CheckResult[]): string {
  const reasons = failed.map((c) => `- ${c.name}: ${c.detail}`).join("\n");
  const previous = previousSvg
    ? `Here is your previous SVG:\n${previousSvg}\n\nFix these problems and return the full corrected SVG.`
    : `Your previous reply did not contain an <svg> element. Return only the SVG.`;
  return `${buildPrompt(concept)}

Your previous attempt was rejected by automatic checks:
${reasons}

${previous}`;
}

/** `deadline`: a Date.now() timestamp to finish by (used by the Generate route; the script has none). */
export async function generateDiagram(concept: Concept, deadline = Infinity): Promise<DiagramResult> {
  const startedAt = Date.now();
  const attempts: Attempt[] = [];
  let svg: string | null = null;
  let checks: CheckResult[] = [];
  let sanitized: string[] = [];
  let error: string | null = null;

  for (let attempt = 1; attempt <= 1 + MAX_VALIDATION_RETRIES; attempt++) {
    const failed = checks.filter((c) => !c.passed);
    const prompt = attempt === 1 ? buildPrompt(concept) : buildRetryPrompt(concept, svg, failed);
    const t0 = Date.now();

    try {
      const reply = await callGemini(prompt, SYSTEM_PROMPT, deadline);
      const extracted = extractSvg(reply.text);
      let newSvg: string | null = null;
      let newChecks = noSvgChecks();
      let newSanitized: string[] = [];
      if (extracted) {
        const clean = sanitizeSvg(extracted);
        newSvg = clean.svg;
        newSanitized = clean.removed;
        newChecks = runChecks(newSvg, concept);
      }
      attempts.push({
        attempt,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        costUsd: estimateCostUsd(reply.model, reply.inputTokens, reply.outputTokens),
        apiRetries: reply.apiRetries,
        durationMs: Date.now() - t0,
        checks: newChecks,
        error: null,
      });
      // Keep the retry unless it is worse than what we had (e.g. the retry came back with no SVG).
      const passedCount = (cs: CheckResult[]) => cs.filter((c) => c.passed).length;
      if (attempt === 1 || passedCount(newChecks) >= passedCount(checks)) {
        svg = newSvg;
        checks = newChecks;
        sanitized = newSanitized;
      }
      error = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({
        attempt,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        apiRetries: err instanceof GeminiError ? err.apiRetries : 0,
        durationMs: Date.now() - t0,
        checks: [],
        error: message,
      });
      error = message;
      break; // API is down or out of quota: retrying the prompt won't help, keep what we have
    }

    if (checks.every((c) => c.passed)) break;
  }

  const sum = (key: "inputTokens" | "outputTokens" | "costUsd" | "apiRetries") =>
    attempts.reduce((total, a) => total + a[key], 0);

  const result: DiagramResult = {
    conceptId: concept.id,
    concept: concept.name,
    subject: concept.subject,
    model: getModelName(),
    svg,
    passed: checks.length > 0 && checks.every((c) => c.passed),
    checks,
    retries: attempts.length - 1,
    apiRetries: sum("apiRetries"),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    costUsd: Number(sum("costUsd").toFixed(6)),
    attempts,
    sanitized,
    // An API error after a good first attempt is not fatal: we still have a diagram.
    error: svg ? null : error,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
  logResult(result);
  return result;
}

function noSvgChecks(): CheckResult[] {
  return (Object.keys(CHECK_NAMES) as CheckId[]).map((id) => ({
    id,
    name: CHECK_NAMES[id],
    passed: false,
    detail: id === "valid" ? "The reply did not contain an <svg>…</svg> element." : "Skipped: no SVG.",
  }));
}

/** One log line per concept, as the brief asks: model, tokens, cost, retries, checks. */
export function logResult(r: DiagramResult): void {
  const checks = r.checks.map((c) => `${c.id}:${c.passed ? "PASS" : "FAIL"}`).join(" ");
  console.log(
    `[diagram] ${r.conceptId} model=${r.model} in=${r.inputTokens} out=${r.outputTokens} ` +
      `cost=$${r.costUsd.toFixed(6)} retries=${r.retries} apiRetries=${r.apiRetries} ` +
      `${r.passed ? "PASSED" : "FAILED"} ${checks}${r.error ? ` error="${r.error}"` : ""}`,
  );
  for (const c of r.checks.filter((c) => !c.passed)) console.log(`           ✗ ${c.name}: ${c.detail}`);
}
