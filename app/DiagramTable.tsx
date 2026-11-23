"use client";

import { useEffect, useState } from "react";
import type { DiagramResult } from "@/lib/pipeline";
import type { CheckId } from "@/lib/checks";
import type { Review, ReviewStatus } from "@/lib/reviews";
import styles from "./page.module.css";

type ConceptInfo = { id: string; name: string; subject: string };

const CHECK_COLUMNS: { id: CheckId; label: string }[] = [
  { id: "valid", label: "Valid SVG" },
  { id: "inViewBox", label: "In viewBox" },
  { id: "titleAndLabels", label: "Title + 3 labels" },
  { id: "animated", label: "Animated" },
  { id: "requiredLabels", label: "Key terms" },
];

// <img> runs SVG animations but never runs scripts inside the SVG: safe way to show AI output.
const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function DiagramTable({ concepts, saved }: { concepts: ConceptInfo[]; saved: DiagramResult[] }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [storage, setStorage] = useState("");

  useEffect(() => {
    fetch("/api/reviews")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setReviews(data.reviews);
        setStorage(data.storage);
      })
      .catch((err) => setReviewsError(`Could not load saved reviews: ${err.message}`));
  }, []);

  return (
    <>
      {reviewsError && <p className={styles.errorBox}>{reviewsError}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Concept</th>
              <th>Diagram</th>
              {CHECK_COLUMNS.map((c) => (
                <th key={c.id} className={styles.checkCol}>
                  {c.label}
                </th>
              ))}
              <th>Cost (USD)</th>
              <th>Retries</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((c) => (
              <Row
                key={c.id}
                concept={c}
                saved={saved.find((r) => r.conceptId === c.id)}
                review={reviews[c.id]}
                onReviewSaved={(r) => setReviews((all) => ({ ...all, [c.id]: r }))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        Cost is estimated from token counts at Gemini paid-tier prices; on the free tier the real cost is $0.
        &ldquo;Retries&rdquo; = re-prompts after a failed check (max 1); API retries = waits after 429/503 errors
        (max 3 per call). Reviews are saved in {storage || "…"}.
      </p>
    </>
  );
}

function Row({
  concept,
  saved,
  review,
  onReviewSaved,
}: {
  concept: ConceptInfo;
  saved?: DiagramResult;
  review?: Review;
  onReviewSaved: (r: Review) => void;
}) {
  const [live, setLive] = useState<DiagramResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const result = live ?? saved;

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: concept.id }),
      });
      const data = await res.json().catch(() => ({ error: `Server returned ${res.status} with no JSON (it may have timed out).` }));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLive(data.result);
    } catch (err) {
      setGenError((err as Error).message || "Network error: could not reach the server.");
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  return (
    <tr>
      <td className={styles.conceptCell}>
        <strong>{concept.name}</strong>
        <div className={styles.muted}>{concept.subject}</div>
        <button className={styles.genButton} onClick={generate} disabled={generating}>
          {generating ? `Generating… ${elapsed}s` : "Generate live"}
        </button>
        {genError && (
          <p className={styles.errorBox} role="alert">
            Generation failed: {genError}
            {result && <> Showing the {live ? "previous live" : "saved"} result instead.</>}
          </p>
        )}
      </td>

      <td className={styles.diagramCell}>
        {live && <span className={styles.liveTag}>Live result (not saved)</span>}
        {result?.svg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.diagram} src={svgSrc(result.svg)} alt={`${concept.name} diagram`} />
        ) : (
          <div className={styles.noDiagram}>{result?.error ?? "No diagram yet. Click Generate live."}</div>
        )}
        {result && <Details result={result} />}
      </td>

      {CHECK_COLUMNS.map((col) => {
        const check = result?.checks.find((c) => c.id === col.id);
        return (
          <td key={col.id} className={styles.checkCol}>
            {check ? (
              <span className={check.passed ? styles.pass : styles.fail} title={check.detail}>
                {check.passed ? "Pass" : "Fail"}
              </span>
            ) : (
              "–"
            )}
          </td>
        );
      })}

      <td>{result ? `$${result.costUsd.toFixed(5)}` : "–"}</td>
      <td>
        {result ? (
          <>
            {result.retries}
            {result.apiRetries > 0 && <div className={styles.muted}>+{result.apiRetries} API</div>}
          </>
        ) : (
          "–"
        )}
      </td>
      <td>
        <ReviewBox conceptId={concept.id} review={review} onSaved={onReviewSaved} />
      </td>
    </tr>
  );
}

function Details({ result }: { result: DiagramResult }) {
  return (
    <details className={styles.details}>
      <summary>Log</summary>
      <ul>
        <li>Model: {result.model}</li>
        <li>
          Tokens: {result.inputTokens.toLocaleString()} in / {result.outputTokens.toLocaleString()} out
        </li>
        <li>Time: {(result.durationMs / 1000).toFixed(1)}s</li>
        {result.sanitized.length > 0 && <li>Removed unsafe: {result.sanitized.join(", ")}</li>}
      </ul>
      {result.attempts.map((a) => (
        <div key={a.attempt} className={styles.attempt}>
          <strong>Attempt {a.attempt}</strong> · {a.inputTokens}/{a.outputTokens} tokens · ${a.costUsd.toFixed(5)}
          {a.apiRetries > 0 && <> · {a.apiRetries} API retries</>}
          {a.error && <div className={styles.failText}>{a.error}</div>}
          <ul>
            {a.checks.map((c) => (
              <li key={c.id} className={c.passed ? undefined : styles.failText}>
                {c.passed ? "✓" : "✗"} {c.name}: {c.detail}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}

function ReviewBox({
  conceptId,
  review,
  onSaved,
}: {
  conceptId: string;
  review?: Review;
  onSaved: (r: Review) => void;
}) {
  // draft = what the reviewer is typing; null means "show the saved note".
  const [draft, setDraft] = useState<string | null>(null);
  const note = draft ?? review?.note ?? "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(status: ReviewStatus) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId, status, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSaved(data.review);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const unsaved = review ? note !== review.note : note !== "";

  return (
    <div className={styles.review}>
      {review && (
        <div className={review.status === "approved" ? styles.pass : styles.fail}>
          {review.status === "approved" ? "Approved" : "Rejected"}
        </div>
      )}
      <textarea
        value={note}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Note for this diagram"
        rows={3}
        maxLength={2000}
        aria-label="Review note"
      />
      <div className={styles.reviewButtons}>
        <button className={styles.approve} disabled={saving} onClick={() => save("approved")}>
          Approve
        </button>
        <button className={styles.reject} disabled={saving} onClick={() => save("rejected")}>
          Reject
        </button>
      </div>
      {unsaved && <div className={styles.muted}>Note not saved yet: click Approve or Reject.</div>}
      {review && !unsaved && (
        <div className={styles.muted}>Saved {new Date(review.updatedAt).toLocaleString()}</div>
      )}
      {error && <div className={styles.failText}>Could not save: {error}</div>}
    </div>
  );
}
