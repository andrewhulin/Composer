import type { SourceRowData } from "../../fixtures/workspace";
import { cx } from "../primitives/cx";
import styles from "./SourceRow.module.css";

/** UI/Source row: "Sidebar source. Drag onto the canvas to create a Source node." */
export function SourceRow({ source }: { source: SourceRowData }) {
  const dragging = source.state === "dragging";
  return (
    <div
      className={cx(styles.row, dragging && styles.dragging)}
      draggable
      data-source-id={source.id}
    >
      <span className={cx(styles.tile, source.wired && styles.wired)}>{source.glyph}</span>
      <span className={styles.name}>{source.name}</span>
      <span className={cx(styles.count, source.wired && styles.countWired, dragging && styles.countDragging)}>
        {dragging ? "dragging" : source.count}
      </span>
    </div>
  );
}
