# Science Diagram Maker

A small web app that asks Gemini to draw 5 animated GCSE science diagrams as SVG, checks each one with code, retries once with the reasons if a check fails, and lets a reviewer approve or reject each diagram.

- **Live app:** _TODO: Vercel link_
- **Stack:** Next.js 16 (App Router, TypeScript) on Vercel, Gemini API over plain `fetch`, Upstash Redis for reviews.
- **Model:** `gemini-3.5-flash-lite` (free tier).

## How it works

```
concept text ──► Gemini ──► extract <svg> ──► sanitize ──► 6 checks ──► all pass? ──► save
                   ▲                                          │ no
                   └──── retry once, with the failed checks ◄─┘
   429 / 503 from the API: wait (2s, 4s, 8s, or Google's retryDelay) and try again, max 3 times
```

| File | What it does |
|---|---|
| [lib/concepts.ts](lib/concepts.ts) | The 5 concepts, the text given to the model, the key terms each diagram must label, and a short visual brief per concept |
| [lib/gemini.ts](lib/gemini.ts) | Gemini call with `fetch`, token counts, 429/503 backoff (max 3 retries) |
| [lib/checks.ts](lib/checks.ts) | The 6 code checks and the SVG sanitizer |
| [lib/pipeline.ts](lib/pipeline.ts) | Prompt, generate, check, retry once, cost/retry log |
| [lib/cost.ts](lib/cost.ts) | Token to USD estimate |
| [scripts/generate-all.ts](scripts/generate-all.ts) | Runs the 5 concepts and writes `results.json` and `logs/runs.jsonl` |
| [app/api/generate/route.ts](app/api/generate/route.ts) | The live **Generate** button (one concept) |
| [app/api/reviews/route.ts](app/api/reviews/route.ts) + [lib/reviews.ts](lib/reviews.ts) | Save and load approve/reject decisions |
| [app/page.tsx](app/page.tsx), [app/components/](app/components/) | The review page |

## The checks

| # | Check | How |
|---|---|---|
| 1 | **Valid SVG** | Parsed with `@xmldom/xmldom`. Root must be `<svg>` with a usable `viewBox`. |
| 2 | **Nothing outside the viewBox** | Computes a bounding box for every `rect`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `path` (via `svg-path-bbox`) and `text` (estimated from font size and characters), applies all `transform`s, and compares with the viewBox (small tolerance). It also checks shapes **while they animate**: every keyframe of `animateTransform`, `animate` on x/y/cx/cy etc., and the extremes of `animateMotion` paths. |
| 3 | **Title + at least 3 labels** | A non-empty `<title>` and 3+ non-empty `<text>` elements. |
| 4 | **Has animation** | SMIL (`animate`, `animateTransform`, `animateMotion`, `set`) or a CSS `@keyframes` that is actually used by an `animation` rule. |
| 5 | **Key terms labelled** (my own) | Each concept lists the terms a GCSE student must see (e.g. hypotenuse and a² + b² = c²; centre, radius, diameter, circumference). Each must appear in a `<text>` label. A diagram can pass checks 1–4 and still be useless for the lesson; this catches that. |
| 6 | **Readable labels** (my own) | No label smaller than 12 units, and no two labels overlap (more than 3% of the smaller label, to allow for estimate error). Labels that fade in and out are skipped, because step-by-step reveals put text in the same spot on purpose. |

**Safety:** before the checks, `<script>`, `<foreignObject>`, `on*` handlers and external links are removed from the SVG. The page also shows SVGs through `<img>`, which never runs scripts.

The retry prompt contains the original prompt, the exact failure details (for example `<text> "cell" at rest spans x 790..830`) and the previous SVG, so the model can fix it rather than start again.

Tests: `npm test` runs 24 tests. They cover each check and use a fake `fetch` to test the validation retry and the 429/503 backoff, so no real API calls are made.

## Where approve/reject is saved, and why

**Upstash Redis (free tier), through the server.**
- Vercel's filesystem is read-only and resets on every deploy, so a file on the server would lose decisions.
- `localStorage` alone would keep each decision in one browser only, so a second reviewer would not see it.
- Redis is shared, survives refreshes and redeploys, and is one HTTP call (the REST API, no SDK).

**Fallback:** if the server has no Redis configured, or a save fails, the page saves the decision in the browser's `localStorage` and says so in a message and in the footnote. The decision still survives a refresh. Locally, without Redis variables, reviews go to `data/reviews.json`.

## Run it on your computer

Needs Node.js 20+.

```bash
git clone <this repo>
cd science-diagrams
npm install
cp .env.example .env.local      # then put your key in GEMINI_API_KEY
npm run generate                # calls Gemini for all 5 concepts -> results.json
npm run dev                     # http://localhost:3000
npm test                        # unit tests, no API calls
```

- `npm run generate -- circle` regenerates one concept and keeps the others.
- `npm run table` prints the results table below.

### Environment variables

| Name | Needed | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Free key from aistudio.google.com. Set on the host only, never committed (`.env*` is git-ignored). |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | for shared reviews | Vercel's Upstash integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; both names work. |

## Results

_TODO: filled from `npm run table` after the final run._

Cost is an **estimate** at Gemini 3.5 Flash-Lite paid-tier prices ($0.30 per 1M input tokens, $2.50 per 1M output tokens, which includes thinking tokens). I took these prices from third-party pricing pages in Nov 2026 and could not confirm them on Google's own page, so check them before relying on the figure. On the free tier the real cost is $0.

## What failed, and how I fixed it

_TODO: add what went wrong with the real model output._

- **A rotating circle failed the viewBox check.** Transforming the 4 corners of a circle's box under rotation makes the box about 41% too big, so a spinning circle near the edge was flagged. Fix: the exact bounding box of a transformed ellipse. There is a test for it.
- **The diagram popup closed itself.** React runs effects twice in development. My cleanup called `dialog.close()`, which fired `onClose`, so the popup closed straight after opening. I found this from a headless-Chrome screenshot. Fix: only call `showModal()` if the dialog isn't open, and no `close()` in cleanup.
- **Build error on Next.js 16:** `export const dynamic = "force-dynamic"` is not allowed when `cacheComponents` is on. Removed it; the route is dynamic anyway because it reads from Redis.
- **Lint error:** `setState` inside `useEffect` to copy the saved note into the textarea. Replaced it with a `draft ?? savedNote` pattern, with no effect.

## What I would do with one more day

- **Render-based checks:** render each SVG in a headless browser at a few animation times, and check real text sizes and overlaps with `getBBox()` instead of estimates.
- **A science check by a second model:** ask a model to grade the diagram against the lesson text (for example "is the hypotenuse label on the longest side?"). Today that is left to the human reviewer.
- **Rate-limit the public Generate button** (per IP, in Redis), so one visitor cannot use up the free quota.
- **Save live generations** as new versions in Redis, with the review linked to a version, so a reviewer can compare and approve a new one.
- **Review history:** who changed a decision and when, instead of only the latest decision.

## AI tools I used

- **Claude Code (Claude Opus):** planning, writing most of the code with me (checks, pipeline, UI), writing tests, and taking headless-Chrome screenshots to check the UI. I reviewed and ran everything, and I can explain every file.
- **Gemini 3.5 Flash-Lite:** the model that draws the diagrams (the subject of the assignment).
