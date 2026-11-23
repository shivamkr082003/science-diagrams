// Small Gemini client using plain fetch (no SDK) so every step is visible.
// API docs: https://ai.google.dev/api/generate-content

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_API_RETRIES = 3; // retries on 429/503, as the brief asks
const RETRYABLE_STATUS = new Set([429, 503]);
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_WAIT_MS = 30_000; // if Google asks us to wait longer, give up (daily quota is gone)

export type GeminiResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number; // includes thinking tokens (billed as output)
  apiRetries: number;
};

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public apiRetries: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export function getModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Google puts a suggested wait in the error body, e.g. { "retryDelay": "17s" }.
function retryDelayFromBody(body: unknown): number | null {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details;
  const delay = details?.find((d) => d.retryDelay)?.retryDelay;
  if (!delay) return null;
  const seconds = parseFloat(delay);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export async function callGemini(prompt: string, systemInstruction: string): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set on the server.", null, 0);

  const model = getModelName();
  const url = `${API_BASE}/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 16384 },
  };

  let apiRetries = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        // Key goes in a header, not the URL, so it never shows up in logs.
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new GeminiError(`Network error calling Gemini: ${(err as Error).message}`, null, apiRetries);
    }

    const data = await res.json().catch(() => null);

    if (res.ok) {
      const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "unknown";
        throw new GeminiError(`Gemini returned no text (reason: ${reason}).`, res.status, apiRetries);
      }
      const usage = data?.usageMetadata ?? {};
      return {
        text,
        model,
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        apiRetries,
      };
    }

    const message = data?.error?.message ?? res.statusText;
    if (!RETRYABLE_STATUS.has(res.status) || apiRetries >= MAX_API_RETRIES) {
      const hint = RETRYABLE_STATUS.has(res.status) ? ` (gave up after ${apiRetries} retries)` : "";
      throw new GeminiError(`Gemini API error ${res.status}: ${message}${hint}`, res.status, apiRetries);
    }

    // Exponential backoff: 2s, 4s, 8s, unless Google tells us how long to wait.
    const suggested = retryDelayFromBody(data);
    const wait = suggested ?? 2000 * 2 ** apiRetries;
    if (wait > MAX_WAIT_MS) {
      throw new GeminiError(
        `Gemini rate limit: asked to wait ${Math.round(wait / 1000)}s, which usually means the free quota is used up. Try again later.`,
        res.status,
        apiRetries,
      );
    }
    apiRetries++;
    console.warn(`[gemini] ${res.status} ${message.slice(0, 80)} -> retry ${apiRetries}/${MAX_API_RETRIES} in ${wait}ms`);
    await sleep(wait + Math.random() * 500); // small jitter
  }
}
