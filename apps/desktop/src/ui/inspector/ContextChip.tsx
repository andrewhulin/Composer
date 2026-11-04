import type { ContextChipData } from "../../fixtures/workspace";
import { Dot } from "../primitives/Dot";
import { Toggle } from "../primitives/Toggle";
import { cx } from "../primitives/cx";
import { formatTokens } from "../primitives/format";
import styles from "./ContextChip.module.css";

const DOT: Record<ContextChipData["dot"], string> = {
  inlet: "var(--phase-understand)",
  source: "var(--text-secondary)",
  dropping: "var(--phase)",
};

/** UI/Context chip: "One context item going into a Claude node. Toggle to include or exclude." */
export function ContextChip({ chip, enabled, onToggle }: { chip: ContextChipData; enabled: boolean; onToggle: () => void }) {
  return (
    <div className={cx(styles.chip, chip.dropping && styles.dropping, !enabled && !chip.dropping && styles.off)}>
      <Dot color={DOT[chip.dot]} />
      <span className={styles.label}>{chip.label}</span>
      <span className={styles.tokens}>{formatTokens(chip.tokens)}</span>
      <Toggle on={enabled} onChange={onToggle} label={`Include ${chip.label}`} />
    </div>
  );
}
