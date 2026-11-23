"use client";

import { useEffect, useRef } from "react";
import type { DiagramResult } from "@/lib/pipeline";
import type { ConceptInfo } from "./DiagramTable";
import { svgSrc, formatCost, formatTokens, CHECK_LABELS } from "./format";
import { CheckIcon, XIcon } from "./icons";
import styles from "./board.module.css";

const label = (id: string, fallback: string) => CHECK_LABELS.find((c) => c.id === id)?.label ?? fallback;

// Uses the native <dialog>: focus trapping and Esc-to-close come for free.
export default function DiagramModal({
  concept,
  result,
  isLive,
  onClose,
}: {
  concept: ConceptInfo;
  result: DiagramResult;
  isLive: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Open once mounted. No close() in cleanup: unmounting removes the dialog anyway, and
  // calling close() would fire onClose (React runs effects twice in dev).
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop closes it
      aria-labelledby="modal-title"
    >
      <div className={styles.modalHead}>
        <div>
          <div className={styles.modalSub}>
            {concept.subject} · {result.model} {isLive && "· live result, not saved"}
          </div>
          <h2 id="modal-title">{concept.name}</h2>
        </div>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close">
          <XIcon size={18} />
        </button>
      </div>

      <div className={styles.modalBody}>
        <div className={styles.modalDiagram}>
          {result.svg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={svgSrc(result.svg)} alt={`${concept.name} diagram`} />
          ) : (
            <div className={styles.empty}>{result.error ?? "No diagram"}</div>
          )}
          <p className={styles.modalText}>
            <strong>Lesson text given to the model:</strong> {concept.text}
          </p>
        </div>

        <aside className={styles.modalSide}>
          <h3>Checks (final attempt)</h3>
          <ul className={styles.detailList}>
            {result.checks.map((c) => (
              <li key={c.id} className={c.passed ? styles.checkOk : styles.checkFail}>
                <span className={styles.checkIcon}>{c.passed ? <CheckIcon size={12} /> : <XIcon size={12} />}</span>
                <div>
                  <strong>{label(c.id, c.name)}</strong>
                  <div className={styles.detailText}>{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>

          <h3>Usage</h3>
          <dl className={styles.kv}>
            <dt>Estimated cost</dt>
            <dd>{formatCost(result.costUsd)}</dd>
            <dt>Input tokens</dt>
            <dd>{result.inputTokens.toLocaleString()}</dd>
            <dt>Output tokens</dt>
            <dd>{result.outputTokens.toLocaleString()}</dd>
            <dt>Retries / API retries</dt>
            <dd>
              {result.retries} / {result.apiRetries}
            </dd>
            <dt>Total time</dt>
            <dd>{(result.durationMs / 1000).toFixed(1)} s</dd>
            {result.sanitized.length > 0 && (
              <>
                <dt>Removed for safety</dt>
                <dd>{result.sanitized.join(", ")}</dd>
              </>
            )}
          </dl>

          <h3>Attempts</h3>
          <ol className={styles.attempts}>
            {result.attempts.map((a) => {
              const failed = a.checks.filter((c) => !c.passed);
              return (
                <li key={a.attempt}>
                  <div className={styles.attemptHead}>
                    <strong>Attempt {a.attempt}</strong>
                    <span>
                      {formatTokens(a.inputTokens)} in · {formatTokens(a.outputTokens)} out · {formatCost(a.costUsd)} ·{" "}
                      {(a.durationMs / 1000).toFixed(1)} s{a.apiRetries > 0 && ` · ${a.apiRetries} API retries`}
                    </span>
                  </div>
                  {a.error ? (
                    <div className={styles.detailFail}>API error: {a.error}</div>
                  ) : failed.length ? (
                    <ul className={styles.attemptFails}>
                      {failed.map((c) => (
                        <li key={c.id}>
                          <strong>{label(c.id, c.name)}:</strong> {c.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.detailOk}>All checks passed.</div>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </dialog>
  );
}
