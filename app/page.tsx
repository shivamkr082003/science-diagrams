// Server component: results.json is bundled at build time, so the 5 saved diagrams
// show immediately when the page opens, with no API call.
import saved from "@/results.json";
import { CONCEPTS } from "@/lib/concepts";
import type { DiagramResult } from "@/lib/pipeline";
import DiagramTable from "./components/DiagramTable";
import { LogoMark, SparkIcon, ShieldIcon, RetryIcon, UserCheckIcon } from "./components/icons";
import styles from "./page.module.css";

const STEPS = [
  { icon: <SparkIcon size={18} />, title: "Generate", text: "Gemini draws an animated SVG from the lesson text." },
  { icon: <ShieldIcon size={18} />, title: "Check", text: "Code runs 5 checks: valid, in frame, labels, animation, key terms." },
  { icon: <RetryIcon size={18} />, title: "Retry once", text: "If a check fails, the model gets one retry with the exact reasons." },
  { icon: <UserCheckIcon size={18} />, title: "Review", text: "A person approves or rejects each diagram, with a note." },
];

export default function Home() {
  const results = (saved.results ?? []) as DiagramResult[];
  // Only plain data goes to the client component (no RegExp objects).
  const concepts = CONCEPTS.map((c) => ({ id: c.id, name: c.name, subject: c.subject, text: c.text }));
  const model = results[0]?.model ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

  return (
    <>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <LogoMark />
            <div>
              <div className={styles.brandName}>Science Diagram Maker</div>
              <div className={styles.brandSub}>GCSE diagram review</div>
            </div>
          </div>
          <div className={styles.meta}>
            <span className={styles.metaChip}>
              <span className={styles.dot} /> {model}
            </span>
            {saved.updatedAt && (
              <span className={styles.metaText}>
                Results from {new Date(saved.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <h1>Review AI-made science diagrams</h1>
          <p>
            Each row is one GCSE concept. You see the animated diagram the AI drew, which automatic checks it passed,
            what it cost, and how many retries it needed. Approve it or reject it with a note.
          </p>
        </section>

        <ol className={styles.steps} aria-label="How it works">
          {STEPS.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepIcon}>{s.icon}</span>
              <div>
                <div className={styles.stepTitle}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  {s.title}
                </div>
                <div className={styles.stepText}>{s.text}</div>
              </div>
            </li>
          ))}
        </ol>

        <DiagramTable concepts={concepts} saved={results} />
      </main>
    </>
  );
}
