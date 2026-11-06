import { WEIGHTS, type Id, type Weight } from "@composer/core";
import { actions } from "../../store/project";
import { Popover } from "../primitives/Popover";
import { Tabs } from "../primitives/Tabs";
import { Toggle } from "../primitives/Toggle";
import styles from "./WeightPopover.module.css";

const LABEL: Record<Weight, string> = { mute: "Mute", light: "Light", normal: "Normal", heavy: "Heavy" };

/** The Weigh control from Figma 07: weight, pin into every phase, and why. */
export function WeightPopover({ id, weight, pinned, why }: { id: Id; weight: Weight; pinned: boolean; why?: string }) {
  return (
    <Popover onCanvas className={styles.popover} onPointerDown={(e) => e.stopPropagation()}>
      <span className={styles.label}>Weight</span>
      <Tabs
        label="Weight"
        variant="segmented"
        block
        value={weight}
        onChange={(w) => actions.setWeight(id, w)}
        items={WEIGHTS.map((w) => ({ value: w, label: LABEL[w] }))}
      />
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
    </Popover>
  );
}
