// A tiny CSS reader for the <style> blocks the model writes inside SVGs.
// The model usually styles text with classes (".label { font-size: 16px; text-anchor: middle }")
// and animates with @keyframes, so the checks must read CSS, not only attributes.
//
// Supported (enough for model output, not a full CSS engine):
//   selectors: tag, .class, #id, tag.class, "a, b" lists; for "a b" only the last part is matched
//   specificity: id > class > tag, then source order
//   @keyframes name { 0% { ... } 50% { ... } }

import type { Element } from "@xmldom/xmldom";

type Simple = { tag?: string; id?: string; classes: string[] };
type Rule = { selector: Simple; specificity: number; order: number; decls: Record<string, string> };
export type Stylesheet = { rules: Rule[]; keyframes: Record<string, Record<string, string>[]> };

export const EMPTY_SHEET: Stylesheet = { rules: [], keyframes: {} };

export function parseDecls(text: string): Record<string, string> {
  const decls: Record<string, string> = {};
  for (const part of text.split(";")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).replace(/!important/, "").trim();
    if (prop && value) decls[prop] = value;
  }
  return decls;
}

/** Find the matching "}" for the "{" at `open`. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return i;
  }
  return css.length;
}

function parseSimple(selector: string): Simple | null {
  const last = selector.trim().split(/\s+|>|\+|~/).filter(Boolean).pop();
  if (!last || last.includes(":") || last.includes("[")) return null; // skip :hover, [attr] etc.
  const tag = last.match(/^[a-zA-Z][\w-]*/)?.[0];
  const id = last.match(/#([\w-]+)/)?.[1];
  const classes = [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (last === "*") return { classes: [] };
  if (!tag && !id && !classes.length) return null;
  return { tag, id, classes };
}

export function parseStylesheet(cssText: string): Stylesheet {
  const sheet: Stylesheet = { rules: [], keyframes: {} };
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, ""); // drop comments
  let i = 0;
  let order = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const head = css.slice(i, open).trim();
    const end = blockEnd(css, open);
    const body = css.slice(open + 1, end);

    const kf = head.match(/@(?:-webkit-)?keyframes\s+([\w-]+)/);
    if (kf) {
      // Each step: "0%, 100% { opacity: 0 }" -> one declaration map per step.
      sheet.keyframes[kf[1]] = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => parseDecls(m[2]));
    } else if (!head.startsWith("@")) {
      const decls = parseDecls(body);
      for (const sel of head.split(",")) {
        const selector = parseSimple(sel);
        if (!selector) continue;
        const specificity = (selector.id ? 100 : 0) + selector.classes.length * 10 + (selector.tag ? 1 : 0);
        sheet.rules.push({ selector, specificity, order: order++, decls });
      }
    }
    i = end + 1;
  }
  return sheet;
}

function matches(el: Element, s: Simple): boolean {
  if (s.tag && s.tag !== el.localName) return false;
  if (s.id && s.id !== el.getAttribute("id")) return false;
  const classes = (el.getAttribute("class") ?? "").split(/\s+/);
  return s.classes.every((c) => classes.includes(c));
}

/** The value a stylesheet gives `prop` on `el` (highest specificity, then last rule wins). */
export function cssValue(sheet: Stylesheet, el: Element, prop: string): string | null {
  let best: Rule | null = null;
  for (const rule of sheet.rules) {
    if (!(prop in rule.decls) || !matches(el, rule.selector)) continue;
    if (!best || rule.specificity > best.specificity || (rule.specificity === best.specificity && rule.order > best.order)) {
      best = rule;
    }
  }
  return best ? best.decls[prop] : null;
}

/** Names of the @keyframes an element uses, from `animation-name` or the `animation` shorthand. */
export function animationNames(sheet: Stylesheet, animationName: string | null, animation: string | null): string[] {
  const words = `${animationName ?? ""} ${animation ?? ""}`.split(/[\s,]+/);
  return [...new Set(words.filter((w) => w in sheet.keyframes))];
}

/** CSS transform syntax -> SVG transform syntax (translateX(5px) -> translate(5 0), etc.). */
export function cssTransformToSvg(value: string): string {
  if (value.trim() === "none") return "";
  return value
    .replace(/translateX\(([^)]*)\)/g, "translate($1, 0)")
    .replace(/translateY\(([^)]*)\)/g, "translate(0, $1)")
    .replace(/scaleX\(([^)]*)\)/g, "scale($1, 1)")
    .replace(/scaleY\(([^)]*)\)/g, "scale(1, $1)")
    .replace(/translate3d\(([^,]*),([^,]*),[^)]*\)/g, "translate($1, $2)")
    .replace(/rotateZ?\(/g, "rotate(");
}
