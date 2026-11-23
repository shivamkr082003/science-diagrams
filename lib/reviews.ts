// Where approve/reject decisions are saved.
//  - Deployed: Upstash Redis (free tier), via its REST API. One Redis hash "reviews":
//    field = concept id, value = JSON { status, note, updatedAt }.
//  - Local dev without Redis credentials: a JSON file at data/reviews.json.
// Why not a file on the server in production? Vercel's filesystem is read-only and
// resets on every deploy, so the decision would be lost. Why not localStorage? It only
// lives in one browser, so a second reviewer would not see the first one's decision.

import { promises as fs } from "node:fs";
import path from "node:path";

export type ReviewStatus = "approved" | "rejected";
export type Review = { status: ReviewStatus; note: string; updatedAt: string };

const HASH_KEY = "reviews";
const LOCAL_FILE = path.join(process.cwd(), "data", "reviews.json");

// Vercel's Upstash integration names the variables KV_REST_API_*, Upstash itself uses UPSTASH_REDIS_REST_*.
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function storageName(): string {
  return redisConfig() ? "Upstash Redis" : "local file data/reviews.json";
}

/** False on Vercel without Redis: the browser then falls back to localStorage. */
export function serverCanSave(): boolean {
  return !!redisConfig() || !process.env.VERCEL;
}

async function redis(command: string[]): Promise<unknown> {
  const cfg = redisConfig()!;
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error ?? res.status}`);
  return data.result;
}

async function readLocal(): Promise<Record<string, Review>> {
  try {
    return JSON.parse(await fs.readFile(LOCAL_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function getReviews(): Promise<Record<string, Review>> {
  if (!redisConfig()) return readLocal();
  const flat = (await redis(["HGETALL", HASH_KEY])) as string[] | null;
  const reviews: Record<string, Review> = {};
  for (let i = 0; flat && i + 1 < flat.length; i += 2) {
    try {
      reviews[flat[i]] = JSON.parse(flat[i + 1]);
    } catch {
      /* skip a corrupted entry */
    }
  }
  return reviews;
}

export async function saveReview(conceptId: string, status: ReviewStatus, note: string): Promise<Review> {
  const review: Review = { status, note, updatedAt: new Date().toISOString() };
  if (redisConfig()) {
    await redis(["HSET", HASH_KEY, conceptId, JSON.stringify(review)]);
    return review;
  }
  if (process.env.VERCEL) {
    throw new Error("Review storage is not configured on the server (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).");
  }
  const all = await readLocal();
  all[conceptId] = review;
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(all, null, 2) + "\n");
  return review;
}
