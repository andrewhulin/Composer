import { useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import styles from "./Toasts.module.css";

/** Transient messages: bounced wires, locks, errors. */
export function Toasts() {
  const toasts = useProject((s) => s.toasts);
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(styles.toast, styles[t.tone])}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Shown until an Anthropic key is in Keychain. */
export function KeyBanner({ onAdd }: { onAdd: () => void }) {
  return (
    <div className={styles.banner}>
      <span>Add your Anthropic API key to run Claude nodes.</span>
      <button type="button" onClick={onAdd}>
        Add key <span>⌘,</span>
      </button>
    </div>
  );
}
