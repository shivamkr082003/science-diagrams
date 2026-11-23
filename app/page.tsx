// The page is a server component: results.json is bundled at build time, so the
// 5 saved diagrams show immediately, with no API call.
import saved from "@/results.json";
import { CONCEPTS } from "@/lib/concepts";
import type { DiagramResult } from "@/lib/pipeline";
import DiagramTable from "./DiagramTable";
import styles from "./page.module.css";

export default function Home() {
  const results = (saved.results ?? []) as DiagramResult[];
  const concepts = CONCEPTS.map((c) => ({ id: c.id, name: c.name, subject: c.subject }));
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const passed = results.filter((r) => r.passed).length;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>Science Diagram Maker</h1>
        <p>
          Gemini draws an animated SVG for each GCSE concept. Code checks every SVG, and if a check fails the
          model gets one retry with the reasons. A reviewer then approves or rejects it.
        </p>
        <p className={styles.summary}>
          {passed}/{results.length} passed all checks · total estimated cost ${totalCost.toFixed(4)} · model{" "}
          {results[0]?.model ?? "–"}
          {saved.updatedAt && <> · generated {new Date(saved.updatedAt).toISOString().slice(0, 10)}</>}
        </p>
      </header>
      <DiagramTable concepts={concepts} saved={results} />
    </main>
  );
}
