import type { CheckId } from "@/lib/checks";

export const CHECK_LABELS: { id: CheckId; label: string }[] = [
  { id: "valid", label: "Valid SVG" },
  { id: "inViewBox", label: "Inside the frame" },
  { id: "titleAndLabels", label: "Title + 3 labels" },
  { id: "animated", label: "Animated" },
  { id: "requiredLabels", label: "Key terms labelled" },
  { id: "readableLabels", label: "Labels readable" },
];

export const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
