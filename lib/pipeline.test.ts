// Tests the retry logic with a fake fetch, so no real API calls are made.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateDiagram } from "./pipeline";
import { getConcept } from "./concepts";

process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
process.env.GEMINI_BASE_DELAY_MS = "1";

const circle = getConcept("circle")!;

const GOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><title>Parts of a circle</title>
<circle cx="200" cy="150" r="100" fill="none" stroke="black"><animate attributeName="stroke-width" values="1;3;1" dur="2s" repeatCount="indefinite"/></circle>
<text x="200" y="30" text-anchor="middle" font-size="14">Circumference</text><text x="210" y="170" font-size="12">Centre</text>
<text x="240" y="140" font-size="12">Radius</text><text x="200" y="285" text-anchor="middle" font-size="12">Diameter</text></svg>`;
const BAD_SVG = GOOD_SVG.replace(/<animate [^>]*\/>/, ""); // no animation

type Reply = { status: number; body: unknown };
let replies: Reply[] = [];
let requests: { prompt: string }[] = [];

const ok = (text: string): Reply => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 2000 } },
});
const err = (status: number): Reply => ({ status, body: { error: { message: `fake ${status}` } } });

beforeEach(() => {
  replies = [];
  requests = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    requests.push({ prompt: JSON.parse(String(init.body)).contents[0].parts[0].text });
    const r = replies.shift() ?? err(500);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
});

test("passes first time: one call, no retries, cost logged", async () => {
  replies = [ok("```svg\n" + GOOD_SVG + "\n```")];
  const r = await generateDiagram(circle);
  assert.equal(r.passed, true);
  assert.equal(r.retries, 0);
  assert.equal(requests.length, 1);
  assert.equal(r.inputTokens, 1000);
  assert.equal(r.outputTokens, 2000);
  assert.equal(r.costUsd, 0.0053); // 1000 × $0.30/M + 2000 × $2.50/M
});

test("failed check -> retries once and tells the model why", async () => {
  replies = [ok(BAD_SVG), ok(GOOD_SVG)];
  const r = await generateDiagram(circle);
  assert.equal(r.passed, true);
  assert.equal(r.retries, 1);
  assert.equal(requests.length, 2);
  assert.match(requests[1].prompt, /rejected by automatic checks/);
  assert.match(requests[1].prompt, /Animated: No <animate>/);
  assert.equal(r.attempts[0].checks.find((c) => c.id === "animated")?.passed, false);
});

test("only retries once, then keeps the failing result", async () => {
  replies = [ok(BAD_SVG), ok(BAD_SVG)];
  const r = await generateDiagram(circle);
  assert.equal(r.passed, false);
  assert.equal(r.retries, 1);
  assert.equal(requests.length, 2);
  assert.ok(r.svg);
});

test("429/503 -> waits and retries the API call up to 3 times", async () => {
  replies = [err(429), err(503), ok(GOOD_SVG)];
  const r = await generateDiagram(circle);
  assert.equal(r.passed, true);
  assert.equal(r.apiRetries, 2);
  assert.equal(r.retries, 0);
});

test("gives up after 3 API retries with a clear error", async () => {
  replies = [err(429), err(429), err(429), err(429)];
  const r = await generateDiagram(circle);
  assert.equal(requests.length, 4); // 1 call + 3 retries
  assert.equal(r.svg, null);
  assert.match(r.error ?? "", /429.*gave up after 3 retries/);
});

test("non-retryable error (400) fails fast", async () => {
  replies = [err(400)];
  const r = await generateDiagram(circle);
  assert.equal(requests.length, 1);
  assert.match(r.error ?? "", /400/);
});
