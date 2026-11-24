// Estimated cost in USD. We use the free tier, so the real bill is $0.
// This is what the same call would cost on the paid tier, so we can reason about
// cost at scale. Prices are USD per 1 million tokens. Output price includes
// "thinking" tokens, which Google bills as output.
// Source: Gemini API pricing page (checked Nov 2026). Update if Google changes it.

type Price = { inputPerM: number; outputPerM: number };

export const PRICES: Record<string, Price> = {
  "gemini-3.5-flash-lite": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-3.5-flash": { inputPerM: 1.5, outputPerM: 9.0 },
};

// Unknown model? Fall back to the flash-lite price and say so in the log.
const FALLBACK: Price = PRICES["gemini-3.5-flash-lite"];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model] ?? FALLBACK;
  const cost = (inputTokens / 1_000_000) * price.inputPerM + (outputTokens / 1_000_000) * price.outputPerM;
  return Number(cost.toFixed(6));
}

export function hasKnownPrice(model: string): boolean {
  return model in PRICES;
}
