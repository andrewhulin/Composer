import { Dot } from "../primitives/Dot";
import { Toggle } from "../primitives/Toggle";
import { cx } from "../primitives/cx";
import { formatTokens } from "../primitives/format";
import styles from "./ContextChip.module.css";

export interface Chip {
  id: string;
  label: string;
  tokens: number;
  dot: string;
  enabled: boolean;
  weight?: string;
}

/** UI/Context chip: "One context item going into a Claude node. Toggle to include or exclude." */
export function ContextChip({ chip, onToggle, onSelect }: { chip: Chip; onToggle: () => void; onSelect?: () => void }) {
  return (
    <div className={cx(styles.chip, !chip.enabled && styles.off)}>
      <Dot color={chip.dot} />
      <button type="button" className={styles.label} onClick={onSelect}>
        {chip.label}
      </button>
      {chip.weight && chip.weight !== "normal" && <span className={styles.weight}>{chip.weight}</span>}
      <span className={styles.tokens}>{formatTokens(chip.tokens)}</span>
      <Toggle on={chip.enabled} onChange={onToggle} label={`Include ${chip.label}`} />
    </div>
  );
}
