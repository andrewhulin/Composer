import type { InsightsData } from "@composer/engine";
import styles from "./InsightsCard.module.css";

/** Weighted context as a paper card: summary, then insights with the raw words behind them. */
export function InsightsCard({ data, label }: { data: InsightsData; label: string }) {
  return (
    <article className={styles.paper}>
      <span className={styles.label}>{label.toUpperCase()}</span>
      <h2 className={styles.summary}>{data.summary}</h2>
      <ol className={styles.list}>
        {data.insights.map((i, n) => (
          <li key={n}>
            <p className={styles.title}>
              {i.title} <span className={styles[i.strength]}>{i.strength}</span>
            </p>
            {i.evidence.slice(0, 2).map((e, k) => (
              <p key={k} className={styles.quote}>
                “{e.quote}” <span>· {e.source}</span>
              </p>
            ))}
          </li>
        ))}
      </ol>
      {data.open_questions.length > 0 && (
        <p className={styles.open}>Open: {data.open_questions.join(" · ")}</p>
      )}
    </article>
  );
}
