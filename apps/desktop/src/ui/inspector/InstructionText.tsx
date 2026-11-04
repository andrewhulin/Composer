import styles from "./InstructionText.module.css";

/** Colors for template references, as in the Figma inspector. */
export type RefTone = "inlet" | "hypothesis" | "plain";

/** Renders an instruction template with its {references} highlighted. */
export function InstructionText({ text, toneOf }: { text: string; toneOf: (name: string) => RefTone }) {
  const parts = text.split(/(\{[^{}]+\})/g);
  return (
    <p className={styles.text}>
      {parts.map((part, i) => {
        const m = /^\{([^{}]+)\}$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span key={i} className={styles[toneOf(m[1] ?? "")]}>
            {part}
          </span>
        );
      })}
    </p>
  );
}
