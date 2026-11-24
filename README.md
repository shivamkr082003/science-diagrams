# Science Diagram Maker

A small web app that asks Gemini to draw 5 animated GCSE science diagrams as SVG, checks each one with code, retries once with the reasons if a check fails, and lets a reviewer approve or reject each diagram.

- **Live app:** _TODO: Vercel link_
- **Stack:** Next.js 16 (App Router, TypeScript) on Vercel, Gemini API over plain `fetch`, Upstash Redis for reviews.
- **Model:** `gemini-3.5-flash-lite` (free tier) for 4 concepts. The series circuit uses `gemini-3.5-flash`, because Flash-Lite drew a broken circuit 5 times in a row (see "What failed").

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
| 2 | **Nothing outside the viewBox** | Computes a bounding box for every `rect`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `path` (via `svg-path-bbox`) and `text`, applies all transforms, and compares with the viewBox (small tolerance). Text width comes from Helvetica/Arial character widths, which match Chrome's measured width to about 1%. It also checks shapes **while they animate**: every keyframe of `animateTransform`, `animate` on x/y/cx/cy, the extremes of `animateMotion` paths, and every step of CSS `@keyframes` transforms (with `transform-origin` / `transform-box`). |
| 3 | **Title + at least 3 labels** | A non-empty `<title>` and 3+ non-empty `<text>` elements. |
| 4 | **Has animation** | SMIL (`animate`, `animateTransform`, `animateMotion`, `set`) or a CSS `@keyframes` that an `animation` rule actually uses. It also fails a shape whose only colour comes from a *delayed* fill animation, because the shape shows solid black until the animation starts. |
| 5 | **Subject content** (my own) | Each concept lists the terms a GCSE student must see (e.g. hypotenuse and a² + b² = c²; centre, radius, diameter, circumference). Each must appear in a `<text>` label. For the series circuit it also checks the science: **the loop must be closed**, so no thick wire may end without touching another wire or a component. A diagram can pass checks 1–4 and still be wrong for the lesson; this catches that. |
| 6 | **Readable labels** (my own) | A label fails if it: is smaller than 12 units; overlaps another label; is drawn across a small round symbol (lamp, ammeter); has a solid line running through it (tested in the text's own coordinates, so rotated labels work); or is partly hidden under a filled shape drawn after it. Thin dashed grid lines, and labels that fade in and out, are skipped. |

The checks read the SVG's `<style>` block ([lib/css.ts](lib/css.ts)), because the model styles most text with CSS classes (`.label { text-anchor: middle }`), not attributes.

**Safety:** before the checks, `<script>`, `<foreignObject>`, `on*` handlers and external links are removed from the SVG. The page also shows SVGs through `<img>`, which never runs scripts.

The retry prompt contains the original prompt, the exact failure details (for example `<text> "cell" at rest spans x 790..830`) and the previous SVG, so the model can fix it rather than start again.

Tests: `npm test` runs 36 tests. They cover each check and use a fake `fetch` to test the validation retry and the 429/503 backoff, so no real API calls are made.

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
- `npm run recheck` re-runs the current checks on the saved SVGs (no API calls).

### Environment variables

| Name | Needed | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Free key from aistudio.google.com. Set on the host only, never committed (`.env*` is git-ignored). |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | for shared reviews | Vercel's Upstash integration sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`; both names work. |

## Results

The latest saved result for each concept (`results.json`, made with `npm run table`):

| Concept | Checks | Est. cost (USD) | Retries | API retries | Model | Tokens in / out |
|---|---|---|---|---|---|---|
| Pythagoras' theorem | Pass (all 6) | $0.01289 | 1 | 0 | gemini-3.5-flash-lite | 4220 / 4648 |
| Parts of a circle | Pass (all 6) | $0.00551 | 0 | 0 | gemini-3.5-flash-lite | 707 / 2120 |
| Series circuit | Pass (all 6) | $0.27837 | 1 | 0 | gemini-3.5-flash | 1969 / 30602 |
| Photosynthesis | Pass (all 6) | $0.00716 | 0 | 0 | gemini-3.5-flash-lite | 619 / 2791 |
| States of matter | Pass (all 6) | $0.00843 | 0 | 0 | gemini-3.5-flash-lite | 616 / 3297 |
| **Total** | | **$0.31236** | | | | |

- **These are the best results after several runs, not a single first try.**
  - `npm run generate -- <id>` regenerates one concept and keeps the others.
  - Each row is a real, unedited model output.
  - After I fixed bugs in the checks, I re-ran the final checks on all 5 saved SVGs with `npm run recheck` (no API calls). So every row is judged by the same version of the checks, and the popup on the page says when this happened.
- **Logs:** across all runs I logged **33 generations** in [logs/runs.jsonl](logs/runs.jsonl). 21 passed every check. The total estimated cost was $1.17. There was 1 real 503 ("model is experiencing high demand"), which the backoff handled.
- **Retries:**
  - Pythagoras first had "a² (9)" overlapping "a = 3", and the retry fixed it.
  - The circuit's first reply was cut off at the output token limit (see "What failed"), and the retry produced the diagram.
- **Cost** is an estimate at paid-tier prices: Flash-Lite $0.30 in / $2.50 out, Flash $1.50 in / $9.00 out per 1M tokens, including thinking tokens.
  - I took these from third-party pricing pages in Nov 2026 and could not confirm them on Google's own page.
  - On the free tier the real cost is $0.
  - The circuit is expensive because Flash used about 30k output tokens, most of them thinking.

## What failed, and how I fixed it

I rendered every model output in headless Chrome and compared what I saw with what the checks said. Most fixes came from the two disagreeing.

**Problems with the checks (they passed things that looked wrong, or failed things that looked fine):**
- **False fail: text-anchor set by CSS.** States of matter failed "inside viewBox" after its retry, but the render was fine. The model centred captions with `.caption { text-anchor: middle }`, and my check only read attributes. Fix: a small CSS reader ([lib/css.ts](lib/css.ts)) for class, tag and id rules and `@keyframes`.
- **False pass: overlap check switched off.** A CSS `fill-opacity` pulse made the check think every classed label could fade out, so it skipped them all, and two real Pythagoras overlaps passed. Fix: only `opacity` / `visibility` / `display` count as hiding.
- **False fail: text width.** `0.55 × font-size` per character made a 107-character subtitle 824 units wide; Chrome measures it at 667. Fix: real Helvetica/Arial character widths, now within about 1% of Chrome.
- **False pass: overlap limit too loose.** "b² = 16" touching "b = 4" passed at 6% overlap with a 30% limit. Lowered to 3%.
- **New checks the renders showed I needed:**
  - Squares rendered **black** for 1–3 seconds because their only fill came from a delayed CSS animation.
  - "Lamp 1" was drawn across the lamp symbol.
  - A wire ran through the word "current".
  - "circumference" was hidden under an info card drawn on top of it.
  - Each of these is now caught by check 4 or check 6. I tested each against every earlier output, which showed no false positives on the good diagrams.
- **A second review pass found 3 more check bugs:**
  - "voltage = 3 V" ran 10 units into a lamp symbol but passed, because I compared it with the circle's square box (11.8% under a 15% limit). Now it is tested against the real circle.
  - A wire touching a thin (2-unit) cell plate was reported as a loose end, because thin strokes were ignored completely. Now thin strokes count as contacts, and only thick strokes are checked as wires.
  - A 12-unit font measured 11.999 and failed "at least 12". Rounding fixed.
- **A real animation bug the check caught:** a circle diagram's moving point used `A 130,130 0 1,1 129.9,0` as a "full circle". That arc's centre is (130, 130), not (0, 0), so the point travelled on the wrong circle and left the frame. I would not have spotted it by eye.

**Problems with the model's output:**
- **The series circuit kept coming out open.** Flash-Lite drew wires with gaps (an open circuit, which is wrong science) and wires running through the cell, and every check passed. I added the closed-loop rule to check 5, gave the circuit an explicit layout in its visual brief (loop corners, where each component goes, labels outside the loop), and gave coordinates in the retry feedback. Flash-Lite still failed 5 runs in a row, so I generated this one concept with `gemini-3.5-flash`. It passed after one retry and looks right.
- **Retries that did not fix anything.** Early retry feedback said *what* was wrong ("a line runs through circumference") but not *where*. Now every message has coordinates, e.g. `the line from (535, 460) to (535, 80) runs through "current" (x 510..557, y 274..288)`. The prompt also has fixed layout zones (drawing in x 20–520, info panel in x 540–780).
- **Looked fine to the checks, wrong to a person:**
  - The circuit's arrows showed electron flow (− to +), but GCSE draws conventional current (+ to −).
  - The Pythagoras equation box was empty for 75% of the animation loop.
  - Both were fixed in the prompt: the circuit brief now asks for conventional current and marked terminals, and the system prompt says key information must stay visible ("no empty boxes"). There is no code check for either. That is what the human review step is for.
- **Flash cut off its own answer.** `maxOutputTokens` was 16384, and Flash's thinking tokens count towards it. Its first circuit reply stopped at 16380 tokens with no closing `</svg>`, and the check only said "no SVG". The limit is now 32768, a cut-off reply is reported as "cut off at the output token limit", and the retry prompt says so.

**Problems with the app:**
- **A rotating circle failed the viewBox check.** Transforming the 4 corners of a circle's box under rotation makes the box about 41% too big, so a spinning circle near the edge was flagged. Fix: the exact bounding box of a transformed ellipse. There is a test for it.
- **The diagram popup closed itself.** React runs effects twice in development. My cleanup called `dialog.close()`, which fired `onClose`, so the popup closed straight after opening. I found this from a headless-Chrome screenshot. Fix: only call `showModal()` if the dialog isn't open, and no `close()` in cleanup.
- **Build error on Next.js 16:** `export const dynamic = "force-dynamic"` is not allowed when `cacheComponents` is on. Removed it; the route is dynamic anyway because it reads from Redis.
- **Lint error:** `setState` inside `useEffect` to copy the saved note into the textarea. Replaced it with a `draft ?? savedNote` pattern, with no effect.
- **A worse retry threw away a good diagram.** If the retry reply had no SVG, the first attempt's diagram (which failed only one check) was lost. Now the retry is kept only if it passes at least as many checks.
- **The live Generate button could be cut off by the host.** Two model calls plus 429/503 waits could pass Vercel's 120 s limit, and the browser would get a broken response. The pipeline now has a deadline 10 s before the limit, so it always answers with JSON: a result, or a clear error.

## What I would do with one more day

- **Render-based checks:** render each SVG in a headless browser at a few animation times, and check real text sizes and overlaps with `getBBox()` instead of estimates. My own manual render step found most of the bugs, so it should be automated.
- **Model fallback in code:** if Flash-Lite fails after its retry, try once with Flash. I did this by hand for the circuit.
- **A science check by a second model:** ask a model to grade the diagram against the lesson text (for example "is the hypotenuse label on the longest side?"). Today that is left to the human reviewer.
- **Rate-limit the public Generate button** (per IP, in Redis), so one visitor cannot use up the free quota.
- **Save live generations** as new versions in Redis, with the review linked to a version, so a reviewer can compare and approve a new one.
- **Review history:** who changed a decision and when, instead of only the latest decision.

## AI tools I used

- **Claude Code (Claude Opus):** planning, writing most of the code with me (checks, pipeline, UI), writing tests, and taking headless-Chrome screenshots to check the UI. I reviewed and ran everything, and I can explain every file.
- **Gemini 3.5 Flash-Lite and Flash:** the models that draw the diagrams (the subject of the assignment).
