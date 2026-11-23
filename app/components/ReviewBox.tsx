"use client";

import { useState } from "react";
import type { Review, ReviewStatus } from "@/lib/reviews";
import { CheckIcon, XIcon } from "./icons";
import styles from "./board.module.css";

export default function ReviewBox({
  conceptId,
  review,
  loaded,
  onSave,
}: {
  conceptId: string;
  review?: Review;
  loaded: boolean;
  onSave: (status: ReviewStatus, note: string) => Promise<void>;
}) {
  // draft = what the reviewer is typing; null means "show the saved note".
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<ReviewStatus | null>(null);
  const note = draft ?? review?.note ?? "";
  const unsaved = draft !== null && draft !== (review?.note ?? "");

  async function save(status: ReviewStatus) {
    setSaving(status);
    try {
      await onSave(status, note); // never throws: falls back to this browser if the server fails
      setDraft(null);
    } finally {
      setSaving(null);
    }
  }

  const status = review?.status;

  return (
    <div className={styles.review}>
      <div className={styles.reviewHead}>
        {!loaded ? (
          <span className={`${styles.pill} ${styles.pillPending}`}>Loading…</span>
        ) : status === "approved" ? (
          <span className={`${styles.pill} ${styles.pillOk}`}>
            <CheckIcon size={12} /> Approved
          </span>
        ) : status === "rejected" ? (
          <span className={`${styles.pill} ${styles.pillFail}`}>
            <XIcon size={12} /> Rejected
          </span>
        ) : (
          <span className={`${styles.pill} ${styles.pillPending}`}>Pending review</span>
        )}
        {review && !unsaved && (
          <span className={styles.savedAt}>
            {new Date(review.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <textarea
        className={styles.note}
        value={note}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note (optional)…"
        rows={3}
        maxLength={2000}
        aria-label={`Review note for ${conceptId}`}
      />

      <div className={styles.reviewButtons}>
        <button
          className={`${styles.btnApprove} ${status === "approved" ? styles.btnActive : ""}`}
          disabled={!!saving || !loaded}
          onClick={() => save("approved")}
          aria-pressed={status === "approved"}
        >
          <CheckIcon size={14} /> {saving === "approved" ? "Saving…" : "Approve"}
        </button>
        <button
          className={`${styles.btnReject} ${status === "rejected" ? styles.btnActive : ""}`}
          disabled={!!saving || !loaded}
          onClick={() => save("rejected")}
          aria-pressed={status === "rejected"}
        >
          <XIcon size={14} /> {saving === "rejected" ? "Saving…" : "Reject"}
        </button>
      </div>
      {unsaved && <div className={styles.unsaved}>Note changed. Click Approve or Reject to save it.</div>}
    </div>
  );
}
