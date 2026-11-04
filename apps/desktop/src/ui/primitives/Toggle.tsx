import { cx } from "./cx";
import styles from "./Toggle.module.css";

interface ToggleProps {
  on: boolean;
  onChange: () => void;
  /** "sm" is the 22×12 context-chip switch; "md" is the 24×14 Focus switch. */
  size?: "sm" | "md";
  /** "live" uses the green signal; "phase" uses the current phase accent. */
  tone?: "live" | "phase";
  label: string;
}

export function Toggle({ on, onChange, size = "sm", tone = "live", label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cx(styles.toggle, styles[size], styles[tone], on && styles.on)}
      onClick={onChange}
    >
      <span className={styles.knob} />
    </button>
  );
}
