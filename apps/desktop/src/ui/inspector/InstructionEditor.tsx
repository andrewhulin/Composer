import { useState } from "react";
import styles from "./InstructionEditor.module.css";

type Tone = "inlet" | "hypothesis" | "option" | "plain";

/**
 * The instruction, editable in place. A highlighted mirror sits under a transparent textarea so
 * `{references}` are colored as you type; unknown ones are flagged in red.
 */
export function InstructionEditor({ value, onChange, known, tone }: { value: string; onChange: (v: string) => void; known: (name: string) => boolean; tone: (name: string) => Tone }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // The node changed underneath (another node selected, or an undo): show the new text.
    setSeen(value);
    setDraft(value);
  }
  const parts = draft.split(/(\{\{|\}\}|\{[A-Za-z][\w-]*\})/g);
  return (
    <div className={styles.editor}>
      <div className={styles.mirror} aria-hidden>
        {parts.map((p, i) => {
          const m = /^\{([A-Za-z][\w-]*)\}$/.exec(p);
          if (!m) return <span key={i}>{p}</span>;
          return (
            <span key={i} className={known(m[1]!) ? styles[tone(m[1]!)] : styles.unknown}>
              {p}
            </span>
          );
        })}
        {"\n"}
      </div>
      <textarea
        className={styles.input}
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
          e.stopPropagation();
        }}
      />
    </div>
  );
}
