// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, extractSvg, sanitizeSvg, parseTransform } from "./checks";
import { getConcept } from "./concepts";

const circle = getConcept("circle")!;
const byId = (svg: string) => Object.fromEntries(runChecks(svg, circle).map((r) => [r.id, r]));

const GOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <title>Parts of a circle</title>
  <circle cx="200" cy="150" r="100" fill="none" stroke="black"/>
  <line x1="200" y1="150" x2="300" y2="150" stroke="red">
    <animate attributeName="stroke-width" values="1;4;1" dur="2s" repeatCount="indefinite"/>
  </line>
  <text x="200" y="30" text-anchor="middle" font-size="14">Circumference</text>
  <text x="210" y="170" font-size="12">Centre</text>
  <text x="240" y="140" font-size="12">Radius</text>
  <text x="200" y="285" text-anchor="middle" font-size="12">Diameter = 2 × radius</text>
</svg>`;

test("a good SVG passes every check", () => {
  for (const r of runChecks(GOOD, circle)) assert.equal(r.passed, true, `${r.id}: ${r.detail}`);
});

test("broken XML fails 'valid' and skips the rest", () => {
  const r = byId("<svg viewBox='0 0 10 10'><g></svg>");
  assert.equal(r.valid.passed, false);
  assert.equal(r.animated.passed, false);
  assert.match(r.animated.detail, /Skipped/);
});

test("missing viewBox fails 'valid'", () => {
  assert.equal(byId(GOOD.replace(' viewBox="0 0 400 300"', "")).valid.passed, false);
});

test("a shape outside the viewBox fails", () => {
  const r = byId(GOOD.replace('r="100"', 'r="180"'));
  assert.equal(r.inViewBox.passed, false);
  assert.match(r.inViewBox.detail, /<circle>/);
});

test("text running off the right edge fails", () => {
  const r = byId(GOOD.replace('<text x="240" y="140" font-size="12">Radius', '<text x="380" y="140" font-size="12">Radius'));
  assert.equal(r.inViewBox.passed, false);
  assert.match(r.inViewBox.detail, /Radius/);
});

test("transforms are applied", () => {
  const svg = GOOD.replace("<circle ", '<circle transform="translate(150 0)" ');
  assert.equal(byId(svg).inViewBox.passed, false);
});

test("an animation that moves a shape outside the viewBox fails", () => {
  const svg = GOOD.replace(
    '<text x="210" y="170" font-size="12">Centre</text>',
    `<circle cx="200" cy="150" r="5"><animateTransform attributeName="transform" type="translate" values="0 0; 300 0; 0 0" dur="2s"/></circle>
     <text x="210" y="170" font-size="12">Centre</text>`,
  );
  const r = byId(svg);
  assert.equal(r.inViewBox.passed, false);
  assert.match(r.inViewBox.detail, /during translate/);
});

test("rotating a circle around its own centre stays inside", () => {
  const svg = GOOD.replace(
    "</svg>",
    // touches the edge (x 0..40): a naive rotated-corner box would poke outside at 45°
    `<circle cx="20" cy="150" r="20"><animateTransform attributeName="transform" type="rotate" values="0 20 150;45 20 150;360 20 150" dur="2s"/></circle></svg>`,
  );
  assert.equal(byId(svg).inViewBox.passed, true, byId(svg).inViewBox.detail);
});

test("no title / too few labels fails", () => {
  const svg = GOOD.replace("<title>Parts of a circle</title>", "").replace(/<text[^>]*>Centre<\/text>|<text[^>]*>Radius<\/text>/g, "");
  const r = byId(svg);
  assert.equal(r.titleAndLabels.passed, false);
  assert.match(r.titleAndLabels.detail, /title/);
  assert.match(r.titleAndLabels.detail, /only 2/);
});

test("no animation fails; CSS keyframes that are used pass", () => {
  const still = GOOD.replace(/<animate [^>]*\/>/, "");
  assert.equal(byId(still).animated.passed, false);
  const css = still.replace("<title>", "<style>@keyframes pulse{to{opacity:.3}} circle{animation: pulse 1s infinite}</style><title>");
  assert.equal(byId(css).animated.passed, true);
  const unused = still.replace("<title>", "<style>@keyframes pulse{to{opacity:.3}}</style><title>");
  assert.equal(byId(unused).animated.passed, false);
});

test("missing key terms fail our own check", () => {
  const r = byId(GOOD.replace("Diameter = 2 × radius", "Twice the radius").replace("Radius", "r"));
  assert.equal(r.requiredLabels.passed, false);
  assert.match(r.requiredLabels.detail, /diameter/);
});

test("pythagoras equation matches different ways of writing it", () => {
  const p = getConcept("pythagoras")!.requiredLabels[1].pattern;
  for (const s of ["a² + b² = c²", "a^2 + b^2 = c^2", "a 2 + b 2 = c 2"]) assert.match(s, p);
});

test("extractSvg strips markdown fences", () => {
  assert.equal(extractSvg("Here:\n```svg\n<svg viewBox='0 0 1 1'></svg>\n```"), "<svg viewBox='0 0 1 1'></svg>");
  assert.equal(extractSvg("no svg here"), null);
});

test("sanitizeSvg removes scripts, handlers and external links", () => {
  const { svg, removed } = sanitizeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script><rect onclick="x()"/><a href="https://evil.example"><use href="#ok"/></a></svg>`,
  );
  assert.doesNotMatch(svg, /script|onclick|evil/);
  assert.match(svg, /href="#ok"/);
  assert.equal(removed.length, 3);
});

test("parseTransform handles rotate around a point", () => {
  const m = parseTransform("rotate(90 10 10)");
  // (20,10) rotated 90° around (10,10) -> (10,20)
  const x = m[0] * 20 + m[2] * 10 + m[4];
  const y = m[1] * 20 + m[3] * 10 + m[5];
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 20) < 1e-9);
});
