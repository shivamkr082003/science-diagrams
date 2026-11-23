// Browser side of review saving.
// Normal path: the server (/api/reviews -> Upstash Redis), so every reviewer sees the same decisions.
// Fallback: if the server has no storage configured or a save fails, keep the decision in this
// browser's localStorage, so it still survives a refresh, and tell the reviewer where it went.

import type { Review, ReviewStatus } from "@/lib/reviews";

const LOCAL_KEY = "science-diagram-reviews";

export type Where = "server" | "browser";

function readLocal(): Record<string, Review> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeLocal(conceptId: string, review: Review) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), [conceptId]: review }));
}

export async function loadReviews(): Promise<{ reviews: Record<string, Review>; where: Where; storage: string; warning?: string }> {
  try {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (!data.serverCanSave) {
      return { reviews: readLocal(), where: "browser", storage: "this browser (localStorage)" };
    }
    // Decisions saved locally while the server was down are kept until the server has one too.
    return { reviews: { ...readLocal(), ...data.reviews }, where: "server", storage: data.storage };
  } catch (err) {
    return {
      reviews: readLocal(),
      where: "browser",
      storage: "this browser (localStorage)",
      warning: `Server reviews could not be loaded (${(err as Error).message}). Showing decisions saved in this browser.`,
    };
  }
}

export async function saveReview(
  conceptId: string,
  status: ReviewStatus,
  note: string,
  where: Where,
): Promise<{ review: Review; where: Where }> {
  if (where === "server") {
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId, status, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return { review: data.review, where: "server" };
    } catch (err) {
      console.warn("Server save failed, saving in this browser instead:", err);
    }
  }
  const review: Review = { status, note, updatedAt: new Date().toISOString() };
  writeLocal(conceptId, review);
  return { review, where: "browser" };
}
