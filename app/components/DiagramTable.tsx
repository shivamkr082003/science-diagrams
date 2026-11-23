"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiagramResult } from "@/lib/pipeline";
import type { Review } from "@/lib/reviews";
import ReviewBox from "./ReviewBox";
import DiagramModal from "./DiagramModal";
import { CHECK_LABELS, svgSrc, formatCost, formatTokens } from "./format";
import { CheckIcon, XIcon, RefreshIcon, ExpandIcon } from "./icons";
import styles from "./board.module.css";

export type ConceptInfo = { id: string; name: string; subject: string; text: string };

type Toast = { id: number; text: string; tone: "ok" | "error" };

export default function DiagramTable({ concepts, saved }: { concepts: ConceptInfo[]; saved: DiagramResult[] }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);
  const [storage, setStorage] = useState("");
  const [live, setLive] = useState<Record<string, DiagramResult>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    fetch("/api/reviews")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setReviews(data.reviews);
        setStorage(data.storage);
      })
      .catch((err) => setReviewsError(`Saved reviews could not be loaded: ${err.message}`))
      .finally(() => setReviewsLoaded(true));
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // What each row shows: a live result (from "Generate live") wins over the saved one.
  const shown = concepts.map((c) => live[c.id] ?? saved.find((r) => r.conceptId === c.id));
  const withResult = shown.filter((r): r is DiagramResult => !!r);
  const passed = withResult.filter((r) => r.passed).length;
  const totalCost = withResult.reduce((s, r) => s + r.costUsd, 0);
  const retries = withResult.reduce((s, r) => s + r.retries, 0);
  const apiRetries = withResult.reduce((s, r) => s + r.apiRetries, 0);
  const approved = Object.values(reviews).filter((r) => r.status === "approved").length;
  const rejected = Object.values(reviews).filter((r) => r.status === "rejected").length;

  const openIndex = concepts.findIndex((c) => c.id === openId);

  return (
    <>
      <section className={styles.stats} aria-label="Summary">
        <Stat label="Passed all checks" value={`${passed} / ${concepts.length}`} tone={passed === concepts.length ? "ok" : "warn"} />
        <Stat label="Estimated cost" value={formatCost(totalCost)} hint="Paid-tier price · free tier is $0" />
        <Stat label="Retries" value={String(retries)} hint={`after failed checks · ${apiRetries} API retries`} />
        <Stat
          label="Reviewed"
          value={`${approved + rejected} / ${concepts.length}`}
          hint={reviewsLoaded ? `${approved} approved · ${rejected} rejected` : "Loading…"}
        />
      </section>

      {reviewsError && (
        <div className={styles.banner} role="alert">
          {reviewsError}
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Diagrams</h2>
          <span className={styles.cardHint}>Hover a check to see why it passed or failed. Click a diagram to enlarge it.</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Concept</th>
              <th scope="col">Diagram</th>
              <th scope="col">Checks</th>
              <th scope="col">Cost &amp; retries</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((c, i) => (
              <Row
                key={c.id}
                index={i}
                concept={c}
                result={shown[i]}
                isLive={!!live[c.id]}
                review={reviews[c.id]}
                reviewsLoaded={reviewsLoaded}
                onLive={(r) => setLive((all) => ({ ...all, [c.id]: r }))}
                onOpen={() => setOpenId(c.id)}
                onReviewSaved={(r) => {
                  setReviews((all) => ({ ...all, [c.id]: r }));
                  toast(`${c.name}: ${r.status === "approved" ? "approved" : "rejected"} and saved`);
                }}
                toast={toast}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        <strong>Cost</strong> is estimated from token counts at Gemini paid-tier prices. On the free tier the real cost
        is $0. <strong>Retries</strong> means re-asking the model after a failed check (at most 1).{" "}
        <strong>API retries</strong> means waiting and trying again after a 429 or 503 error (at most 3 per call).
        Reviews are saved in {storage || "…"}.
      </p>

      {openIndex >= 0 && shown[openIndex] && (
        <DiagramModal
          concept={concepts[openIndex]}
          result={shown[openIndex]!}
          isLive={!!live[concepts[openIndex].id]}
          onClose={() => setOpenId(null)}
        />
      )}

      <div className={styles.toasts} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`${styles.toast} ${t.tone === "error" ? styles.toastError : ""}`}>
            {t.tone === "ok" ? <CheckIcon /> : <XIcon />} {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${tone === "ok" ? styles.okText : tone === "warn" ? styles.warnText : ""}`}>
        {value}
      </div>
      {hint && <div className={styles.statHint}>{hint}</div>}
    </div>
  );
}

function Row({
  index,
  concept,
  result,
  isLive,
  review,
  reviewsLoaded,
  onLive,
  onOpen,
  onReviewSaved,
  toast,
}: {
  index: number;
  concept: ConceptInfo;
  result?: DiagramResult;
  isLive: boolean;
  review?: Review;
  reviewsLoaded: boolean;
  onLive: (r: DiagramResult) => void;
  onOpen: () => void;
  onReviewSaved: (r: Review) => void;
  toast: (text: string, tone?: "ok" | "error") => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

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
      const data = await res
        .json()
        .catch(() => ({ error: `The server returned ${res.status} without details. It may have timed out.` }));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onLive(data.result);
      toast(`${concept.name}: new diagram ${data.result.passed ? "passed all checks" : "generated with failed checks"}`);
    } catch (err) {
      const message = (err as Error).message || "Could not reach the server.";
      setGenError(message);
      toast(`${concept.name}: generation failed`, "error");
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  const failed = result?.checks.filter((c) => !c.passed) ?? [];
  const subjectClass = styles[`subject_${concept.subject.toLowerCase()}`] ?? "";

  return (
    <tr>
      <td data-label="Concept" className={styles.conceptCell}>
        <div className={styles.conceptTop}>
          <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
          <span className={`${styles.subject} ${subjectClass}`}>{concept.subject}</span>
        </div>
        <h3 className={styles.conceptName}>{concept.name}</h3>
        <p className={styles.conceptText}>{concept.text}</p>
        <button className={styles.btnSecondary} onClick={generate} disabled={generating}>
          <RefreshIcon size={14} />
          {generating ? "Generating…" : "Generate live"}
        </button>
      </td>

      <td data-label="Diagram" className={styles.diagramCell}>
        <div className={styles.frame}>
          {result?.svg ? (
            <button className={styles.frameButton} onClick={onOpen} aria-label={`Enlarge ${concept.name} diagram`}>
              {/* <img> plays SVG animation but never runs scripts inside it: a safe way to show AI output. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={svgSrc(result.svg)} alt={`${concept.name} diagram`} className={styles.diagram} />
              <span className={styles.expand}>
                <ExpandIcon size={14} /> Enlarge
              </span>
            </button>
          ) : (
            <div className={styles.empty}>
              <strong>No diagram</strong>
              <span>{result?.error ?? "Click “Generate live” to make one."}</span>
            </div>
          )}
          {isLive && <span className={styles.liveTag}>Live · not saved</span>}
          {generating && (
            <div className={styles.loading} role="status">
              <span className={styles.spinner} />
              <strong>Asking Gemini… {elapsed}s</strong>
              <span>Then checking the SVG. Usually 10–40 s, longer if the API asks us to wait.</span>
            </div>
          )}
        </div>
        {genError && (
          <div className={styles.errorBox} role="alert">
            <strong>Generation failed.</strong> {genError}
            {result?.svg && <div className={styles.errorSub}>Still showing the {isLive ? "previous live" : "saved"} diagram.</div>}
          </div>
        )}
      </td>

      <td data-label="Checks" className={styles.checksCell}>
        {result ? (
          <>
            <div className={`${styles.verdict} ${result.passed ? styles.verdictOk : styles.verdictFail}`}>
              {result.passed ? <CheckIcon size={14} /> : <XIcon size={14} />}
              {result.passed ? "All checks passed" : `${failed.length} check${failed.length === 1 ? "" : "s"} failed`}
            </div>
            <ul className={styles.checkList}>
              {CHECK_LABELS.map(({ id, label }) => {
                const c = result.checks.find((x) => x.id === id);
                const ok = !!c?.passed;
                return (
                  <li key={id} className={ok ? styles.checkOk : styles.checkFail} title={c?.detail}>
                    <span className={styles.checkIcon}>{ok ? <CheckIcon size={12} /> : <XIcon size={12} />}</span>
                    <span>{label}</span>
                    <span className={styles.srOnly}>{ok ? "passed" : "failed"}</span>
                  </li>
                );
              })}
            </ul>
            {failed[0] && <p className={styles.failReason}>{failed[0].detail}</p>}
          </>
        ) : (
          <span className={styles.muted}>Not generated</span>
        )}
      </td>

      <td data-label="Cost & retries" className={styles.usageCell}>
        {result ? (
          <dl className={styles.usage}>
            <div>
              <dt>Cost</dt>
              <dd className={styles.cost}>{formatCost(result.costUsd)}</dd>
            </div>
            <div>
              <dt>Retries</dt>
              <dd>{result.retries}</dd>
            </div>
            <div>
              <dt>API retries</dt>
              <dd>{result.apiRetries}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>
                {formatTokens(result.inputTokens)} in · {formatTokens(result.outputTokens)} out
              </dd>
            </div>
            <button className={styles.linkButton} onClick={onOpen}>
              View full log
            </button>
          </dl>
        ) : (
          <span className={styles.muted}>–</span>
        )}
      </td>

      <td data-label="Review" className={styles.reviewCell}>
        <ReviewBox
          conceptId={concept.id}
          review={review}
          loaded={reviewsLoaded}
          onSaved={onReviewSaved}
          onError={(m) => toast(`Could not save: ${m}`, "error")}
        />
      </td>
    </tr>
  );
}
