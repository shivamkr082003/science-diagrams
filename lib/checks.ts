// Code checks for every SVG the model returns. Nothing is accepted until these pass.
//
//  1. valid          - the SVG parses as XML, root is <svg>, and it has a usable viewBox
//  2. inViewBox      - no shape or text is drawn outside the viewBox (also while it animates)
//  3. titleAndLabels - it has a <title> and at least 3 non-empty <text> labels
//  4. animated       - it has SMIL animation or CSS @keyframes animation
//  5. requiredLabels - (our own) the key GCSE terms for the concept appear as labels

import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";
import { svgPathBbox } from "svg-path-bbox";
import type { Concept } from "./concepts";

export type CheckId = "valid" | "inViewBox" | "titleAndLabels" | "animated" | "requiredLabels";

export type CheckResult = { id: CheckId; name: string; passed: boolean; detail: string };

export const CHECK_NAMES: Record<CheckId, string> = {
  valid: "Valid SVG",
  inViewBox: "Inside viewBox",
  titleAndLabels: "Title + 3 labels",
  animated: "Animated",
  requiredLabels: "Key terms labelled",
};

// ---------- helpers ----------

/** Model replies may wrap the SVG in ```svg fences or add chatter. Keep only <svg>…</svg>. */
export function extractSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + "</svg>".length);
}

export function parseSvg(svg: string): { doc: Document | null; error: string | null } {
  const errors: string[] = [];
  try {
    const doc = new DOMParser({
      onError: (level, msg) => {
        if (level !== "warning") errors.push(msg);
      },
    }).parseFromString(svg, "image/svg+xml");
    if (errors.length) return { doc: null, error: errors[0] };
    return { doc, error: null };
  } catch (err) {
    return { doc: null, error: (err as Error).message };
  }
}

const children = (el: Element): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);

const descendants = (el: Element | Document, tag: string): Element[] =>
  Array.from(el.getElementsByTagName(tag));

const textOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

type ViewBox = { x: number; y: number; w: number; h: number };

function readViewBox(svg: Element): ViewBox | null {
  const parts = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

// ---------- 2D affine matrix [a, b, c, d, e, f] (same layout as SVG matrix()) ----------

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Parse an SVG transform attribute like "translate(10 20) rotate(45 50 50)". */
export function parseTransform(value: string | null): Matrix {
  let m: Matrix = IDENTITY;
  if (!value) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (const [, fn, argStr] of value.matchAll(re)) {
    const a = argStr.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    if (fn === "matrix" && a.length === 6) t = a as Matrix;
    if (fn === "translate") t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    if (fn === "scale") t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    if (fn === "skewX") t = [1, 0, Math.tan(rad(a[0] ?? 0)), 1, 0, 0];
    if (fn === "skewY") t = [1, Math.tan(rad(a[0] ?? 0)), 0, 1, 0, 0];
    if (fn === "rotate") {
      const r = rad(a[0] ?? 0);
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      const rot: Matrix = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
    }
    if (a.some((n) => !Number.isFinite(n))) continue;
    m = multiply(m, t);
  }
  return m;
}

// ---------- bounding boxes ----------

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boxOfPoints(points: [number, number][]): Box | null {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const transformBox = (m: Matrix, b: Box): Box =>
  boxOfPoints([apply(m, b.minX, b.minY), apply(m, b.maxX, b.minY), apply(m, b.minX, b.maxY), apply(m, b.maxX, b.maxY)])!;

/** Read a length; supports plain numbers, px, % (of the viewBox axis) and em. */
function len(value: string | null | undefined, axis: number, fontSize = 16): number | null {
  if (value == null || value.trim() === "") return null;
  const v = value.trim().split(/[\s,]+/)[0]; // x="10 20 30" on <text> -> first value
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (v.endsWith("%")) return (n / 100) * axis;
  if (v.endsWith("em")) return n * fontSize;
  return n;
}

// Style props can live in attributes or in style="...". Animation overrides come first.
type Ctx = { matrix: Matrix; fontSize: number; anchor: string; baseline: string; overrides: Record<string, string> };

function attr(el: Element, name: string, ctx: Ctx): string | null {
  if (name in ctx.overrides) return ctx.overrides[name];
  const style = el.getAttribute("style") ?? "";
  const m = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : el.getAttribute(name);
}

// Things that are never drawn directly, or are only drawn when referenced.
const NOT_DRAWN = new Set([
  "defs", "clipPath", "mask", "pattern", "marker", "symbol", "title", "desc", "metadata", "style",
  "linearGradient", "radialGradient", "filter", "script", "animate", "animateTransform", "animateMotion", "set", "mpath",
]);

const ANIMATION_TAGS = ["animate", "animateTransform", "animateMotion", "set"];

/** Values an animation passes through: values="a;b;c" or from/to/by. */
function animValues(anim: Element): string[] {
  const values = anim.getAttribute("values");
  if (values) return values.split(";").map((v) => v.trim()).filter(Boolean);
  return ["from", "to"].map((k) => anim.getAttribute(k)).filter((v): v is string => !!v);
}

/** Box of a single shape element in its parent's coordinate system (before ctx.matrix). */
function shapeBox(el: Element, ctx: Ctx, vb: ViewBox): { box: Box; exact?: boolean } | null {
  const W = vb.w;
  const H = vb.h;
  const n = (name: string, axis: number, def = 0) => len(attr(el, name, ctx), axis, ctx.fontSize) ?? def;
  switch (el.localName) {
    case "rect":
    case "image":
    case "foreignObject": {
      const x = n("x", W), y = n("y", H), w = n("width", W), h = n("height", H);
      return { box: { minX: x, minY: y, maxX: x + w, maxY: y + h } };
    }
    case "circle": {
      const cx = n("cx", W), cy = n("cy", H), r = n("r", Math.hypot(W, H) / Math.SQRT2);
      return { box: { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r } };
    }
    case "ellipse": {
      const cx = n("cx", W), cy = n("cy", H), rx = n("rx", W), ry = n("ry", H);
      return { box: { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry } };
    }
    case "line": {
      const pts: [number, number][] = [[n("x1", W), n("y1", H)], [n("x2", W), n("y2", H)]];
      return { box: boxOfPoints(pts)! };
    }
    case "polygon":
    case "polyline": {
      const nums = (attr(el, "points", ctx) ?? "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      const box = boxOfPoints(pts);
      return box ? { box } : null;
    }
    case "path": {
      const d = attr(el, "d", ctx);
      if (!d) return null;
      try {
        const [minX, minY, maxX, maxY] = svgPathBbox(d);
        return { box: { minX, minY, maxX, maxY } };
      } catch {
        return null; // a broken path is drawn as nothing by browsers
      }
    }
  }
  return null;
}

/** Rough text box: width = chars × 0.55 × font-size, height = font-size. */
function textBoxes(el: Element, ctx: Ctx, vb: ViewBox): { box: Box; label: string }[] {
  const fs = len(attr(el, "font-size", ctx), vb.h, ctx.fontSize) ?? ctx.fontSize;
  const anchor = attr(el, "text-anchor", ctx) ?? ctx.anchor;
  const baseline = attr(el, "dominant-baseline", ctx) ?? ctx.baseline;
  let x = len(attr(el, "x", ctx), vb.w, fs) ?? 0;
  let y = len(attr(el, "y", ctx), vb.h, fs) ?? 0;
  y += len(attr(el, "dy", ctx), vb.h, fs) ?? 0;
  x += len(attr(el, "dx", ctx), vb.w, fs) ?? 0;

  // Lines: tspans that set their own x/y/dy start a new line, everything else stays on the first line.
  const lines: { x: number; y: number; text: string; fs: number; anchor: string }[] = [];
  let current = { x, y, text: "", fs, anchor };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) current.text += node.nodeValue ?? "";
    if (node.nodeType !== 1) continue;
    const t = node as Element;
    if (t.localName !== "tspan") continue;
    const tfs = len(attr(t, "font-size", ctx), vb.h, fs) ?? fs;
    const newLine = t.hasAttribute("x") || t.hasAttribute("y") || t.hasAttribute("dy");
    if (newLine) {
      if (current.text.trim()) lines.push(current);
      const nx = len(t.getAttribute("x"), vb.w, tfs) ?? current.x;
      let ny = len(t.getAttribute("y"), vb.h, tfs) ?? current.y;
      ny += len(t.getAttribute("dy"), vb.h, tfs) ?? 0;
      current = { x: nx, y: ny, text: textOf(t), fs: tfs, anchor: t.getAttribute("text-anchor") ?? anchor };
    } else {
      current.text += textOf(t);
    }
  }
  if (current.text.trim()) lines.push(current);

  return lines.map((l) => {
    const w = l.text.trim().length * 0.55 * l.fs;
    const left = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
    // Baseline is at y by default; "middle"/"central" centres the text on y; "hanging" puts it below.
    const top =
      baseline === "middle" || baseline === "central" ? l.y - l.fs / 2 : baseline === "hanging" ? l.y : l.y - l.fs * 0.8;
    return { box: { minX: left, minY: top, maxX: left + w, maxY: top + l.fs }, label: l.text.trim().slice(0, 30) };
  });
}

type Offender = { what: string; box: Box; when: string };

function checkElement(el: Element, parent: Ctx, vb: ViewBox, out: Offender[], when: string): void {
  const tag = el.localName ?? "";
  if (NOT_DRAWN.has(tag)) return;
  if (attr(el, "display", parent) === "none") return;

  // A child <animateTransform> replaces the transform attribute (unless additive="sum").
  const ownTransform = parseTransform(parent.overrides.transform ?? el.getAttribute("transform"));
  const ctx: Ctx = {
    matrix: multiply(parent.matrix, ownTransform),
    fontSize: len(attr(el, "font-size", parent), vb.h, parent.fontSize) ?? parent.fontSize,
    anchor: attr(el, "text-anchor", parent) ?? parent.anchor,
    baseline: attr(el, "dominant-baseline", parent) ?? parent.baseline,
    overrides: {},
  };
  const name = (extra = "") => `<${tag}${el.getAttribute("id") ? ` id="${el.getAttribute("id")}"` : ""}>${extra}`;
  const tol = Math.max(2, 0.01 * Math.max(vb.w, vb.h));
  const outside = (b: Box) =>
    b.minX < vb.x - tol || b.minY < vb.y - tol || b.maxX > vb.x + vb.w + tol || b.maxY > vb.y + vb.h + tol;

  // 1) The element itself, at rest.
  if (tag === "text") {
    // textBoxes reads the element's own font-size/anchor, falling back to the parent's.
    for (const t of textBoxes(el, parent, vb)) {
      const b = transformBox(ctx.matrix, t.box);
      if (outside(b)) out.push({ what: `<text> "${t.label}"`, box: b, when });
    }
  } else if (tag === "g" || tag === "svg" || tag === "a" || tag === "switch") {
    for (const child of children(el)) checkElement(child, ctx, vb, out, when);
  } else {
    const shape = shapeBox(el, { ...ctx, overrides: parent.overrides }, vb);
    if (shape) {
      let b = transformBox(ctx.matrix, shape.box);
      if (tag === "circle" || tag === "ellipse") {
        // Exact box of a transformed ellipse, so a circle spinning on its centre isn't flagged.
        const [a, bb, c, d] = ctx.matrix;
        const rx = (shape.box.maxX - shape.box.minX) / 2;
        const ry = (shape.box.maxY - shape.box.minY) / 2;
        const [cx, cy] = apply(ctx.matrix, shape.box.minX + rx, shape.box.minY + ry);
        const hw = Math.hypot(a * rx, c * ry);
        const hh = Math.hypot(bb * rx, d * ry);
        b = { minX: cx - hw, minY: cy - hh, maxX: cx + hw, maxY: cy + hh };
      }
      if (outside(b)) out.push({ what: name(), box: b, when });
    }
  }

  // 2) The element while it animates. Only top-level calls (when === "at rest") recurse into
  //    animations, so we don't explode combinatorially on nested animations.
  if (when !== "at rest") return;
  for (const anim of children(el).filter((c) => ANIMATION_TAGS.includes(c.localName ?? ""))) {
    const kind = anim.localName;
    const attrName = anim.getAttribute("attributeName") ?? "";
    for (const value of animValues(anim)) {
      if (kind === "animateTransform") {
        const type = anim.getAttribute("type") ?? "translate";
        const animated = `${type}(${value})`;
        const additive = anim.getAttribute("additive") === "sum";
        const t = additive ? `${el.getAttribute("transform") ?? ""} ${animated}` : animated;
        checkElement(el, { ...parent, overrides: { transform: t } }, vb, out, `during ${type} "${value}"`);
      } else if ((kind === "animate" || kind === "set") && /^(x|y|cx|cy|x1|x2|y1|y2|r|rx|ry|width|height|d|points)$/.test(attrName)) {
        checkElement(el, { ...parent, overrides: { [attrName]: value } }, vb, out, `during ${attrName}="${value.slice(0, 20)}"`);
      }
    }
    if (kind === "animateMotion") {
      const d = anim.getAttribute("path");
      if (!d) continue;
      try {
        const [x1, y1, x2, y2] = svgPathBbox(d);
        for (const [dx, dy] of [[x1, y1], [x2, y2], [x1, y2], [x2, y1]]) {
          const moved: Ctx = { ...parent, matrix: multiply(parent.matrix, [1, 0, 0, 1, dx, dy]) };
          checkElement(el, moved, vb, out, `during animateMotion`);
        }
      } catch {
        /* ignore bad motion path */
      }
    }
  }
}

// ---------- the checks ----------

function checkInViewBox(root: Element, vb: ViewBox): CheckResult {
  const out: Offender[] = [];
  const ctx: Ctx = { matrix: IDENTITY, fontSize: 16, anchor: "start", baseline: "auto", overrides: {} };
  for (const child of children(root)) checkElement(child, ctx, vb, out, "at rest");

  const r = (n: number) => Math.round(n);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const o of out) {
    const line = `${o.what} ${o.when} spans x ${r(o.box.minX)}..${r(o.box.maxX)}, y ${r(o.box.minY)}..${r(o.box.maxY)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  const vbText = `viewBox is x ${vb.x}..${vb.x + vb.w}, y ${vb.y}..${vb.y + vb.h}`;
  return {
    id: "inViewBox",
    name: CHECK_NAMES.inViewBox,
    passed: lines.length === 0,
    detail: lines.length ? `${lines.length} element(s) outside the ${vbText}: ${lines.slice(0, 5).join("; ")}` : `All shapes and text are inside the ${vbText}.`,
  };
}

function checkTitleAndLabels(doc: Document): CheckResult {
  const title = descendants(doc, "title").map(textOf).find(Boolean);
  const labels = descendants(doc, "text").map(textOf).filter(Boolean);
  const problems: string[] = [];
  if (!title) problems.push("no non-empty <title>");
  if (labels.length < 3) problems.push(`only ${labels.length} non-empty <text> label(s), need at least 3`);
  return {
    id: "titleAndLabels",
    name: CHECK_NAMES.titleAndLabels,
    passed: problems.length === 0,
    detail: problems.length ? problems.join("; ") : `Title "${title}", ${labels.length} labels.`,
  };
}

function checkAnimated(doc: Document): CheckResult {
  const smil = ANIMATION_TAGS.reduce((sum, tag) => sum + descendants(doc, tag).length, 0);
  const css = [
    ...descendants(doc, "style").map((s) => s.textContent ?? ""),
    ...descendants(doc, "*").map((e) => e.getAttribute("style") ?? ""),
  ].join("\n");
  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  // CSS animation only counts if some rule actually uses one of the @keyframes names.
  const usedKeyframes = keyframes.filter((k) => new RegExp(`animation(-name)?\\s*:[^;}]*\\b${k}\\b`).test(css));
  const passed = smil > 0 || usedKeyframes.length > 0;
  return {
    id: "animated",
    name: CHECK_NAMES.animated,
    passed,
    detail: passed
      ? `${smil} SMIL animation element(s), ${usedKeyframes.length} CSS @keyframes in use.`
      : keyframes.length
        ? `@keyframes ${keyframes.join(", ")} defined but no element uses them via "animation".`
        : "No <animate>/<animateTransform>/<animateMotion>/<set> and no CSS @keyframes animation.",
  };
}

function checkRequiredLabels(doc: Document, concept: Concept): CheckResult {
  const allText = descendants(doc, "text").map(textOf).join(" | ");
  const missing = concept.requiredLabels.filter((r) => !r.pattern.test(allText)).map((r) => r.label);
  return {
    id: "requiredLabels",
    name: CHECK_NAMES.requiredLabels,
    passed: missing.length === 0,
    detail: missing.length
      ? `Missing label(s): ${missing.join(", ")}.`
      : `All ${concept.requiredLabels.length} key terms are labelled.`,
  };
}

export function runChecks(svg: string, concept: Concept): CheckResult[] {
  const { doc, error } = parseSvg(svg);
  const root = doc?.documentElement;
  const vb = root ? readViewBox(root) : null;

  let validDetail = "Parses as XML, root is <svg>, viewBox is set.";
  if (!doc || !root) validDetail = `XML parse error: ${error}`;
  else if (root.localName !== "svg") validDetail = `Root element is <${root.localName}>, expected <svg>.`;
  else if (!vb) validDetail = `Missing or invalid viewBox ("${root.getAttribute("viewBox") ?? ""}"). Use viewBox="0 0 W H".`;
  const valid = !!doc && root?.localName === "svg" && !!vb;

  const results: CheckResult[] = [{ id: "valid", name: CHECK_NAMES.valid, passed: valid, detail: validDetail }];
  if (!valid || !doc || !root || !vb) {
    const skipped = (["inViewBox", "titleAndLabels", "animated", "requiredLabels"] as CheckId[]).map((id) => ({
      id,
      name: CHECK_NAMES[id],
      passed: false,
      detail: "Skipped: the SVG is not valid.",
    }));
    return [...results, ...skipped];
  }
  results.push(checkInViewBox(root, vb), checkTitleAndLabels(doc), checkAnimated(doc), checkRequiredLabels(doc, concept));
  return results;
}

// ---------- safety ----------

/**
 * Remove anything that could run code or load outside content: <script>, <foreignObject>,
 * on* event handlers, javascript: links and external hrefs. We render SVGs through <img>,
 * which already blocks scripts, but we clean them anyway so results.json is safe everywhere.
 */
export function sanitizeSvg(svg: string): { svg: string; removed: string[] } {
  const { doc } = parseSvg(svg);
  if (!doc) return { svg, removed: [] };
  const removed: string[] = [];
  for (const tag of ["script", "foreignObject", "iframe"]) {
    for (const el of descendants(doc, tag)) {
      el.parentNode?.removeChild(el);
      removed.push(`<${tag}>`);
    }
  }
  for (const el of descendants(doc, "*")) {
    for (const a of Array.from(el.attributes)) {
      const isHandler = /^on/i.test(a.name);
      const isHref = a.name === "href" || a.name === "xlink:href";
      const badHref = isHref && !a.value.trim().startsWith("#");
      if (isHandler || badHref) {
        el.removeAttribute(a.name);
        removed.push(`${a.name} on <${el.localName}>`);
      }
    }
  }
  return { svg: new XMLSerializer().serializeToString(doc), removed };
}
