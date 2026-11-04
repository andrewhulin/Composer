import { WEIGHTS, type Id, type Weight } from "@composer/core";
import { actions } from "../../store/project";
import { Toggle } from "../primitives/Toggle";
import { cx } from "../primitives/cx";
import styles from "./WeightPopover.module.css";

const LABEL: Record<Weight, string> = { mute: "Mute", light: "Light", normal: "Normal", heavy: "Heavy" };

/** The Weigh control from Figma 07: weight, pin into every phase, and why. */
export function WeightPopover({ id, weight, pinned, why }: { id: Id; weight: Weight; pinned: boolean; why?: string }) {
  return (
    <div className={cx(styles.popover, "nodrag", "nopan")} onPointerDown={(e) => e.stopPropagation()}>
      <span className={styles.label}>Weight</span>
      <div className={styles.segmented} role="radiogroup" aria-label="Weight">
        {WEIGHTS.map((w) => (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={weight === w}
            className={cx(styles.segment, weight === w && styles.on)}
            onClick={() => actions.setWeight(id, w)}
          >
            {LABEL[w]}
          </button>
        ))}
      </div>
      <label className={styles.pin}>
        <Toggle on={pinned} onChange={() => actions.togglePin(id)} size="md" label="Pin into every phase" />
        Pin into every phase
      </label>
      <label className={styles.why}>
        <span>Why {LABEL[weight].toLowerCase()}?</span>
        <input
          defaultValue={why ?? ""}
          placeholder="Say why, so the next prompt knows"
          onBlur={(e) => actions.update(id, { why: e.currentTarget.value.trim() || undefined })}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            e.stopPropagation();
          }}
        />
      </label>
    </div>
  );
}
