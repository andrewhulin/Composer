import { useState, type PointerEvent } from "react";
import { PHASES, PHASE_INFO } from "@composer/core";
import { useUi, type CanvasTool } from "../../store/ui";
import { workspace } from "../../fixtures/workspace";
import { useSize } from "../primitives/useSize";
import { cx } from "../primitives/cx";
import { Rulers } from "./Rulers";
import { PhaseRails } from "./PhaseRails";
import { Minimap } from "./Minimap";
import styles from "./Canvas.module.css";

const TOOLS: { id: CanvasTool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "pan", label: "Pan", key: "H" },
  { id: "add", label: "Add node", key: "N" },
  { id: "comment", label: "Comment", key: "C" },
];

/** 190px as in Figma, shrunk so long names ("UNDERSTAND") stay inside the canvas. */
function watermarkSize(name: string, canvasWidth: number): number {
  if (!canvasWidth) return 190;
  return Math.min(190, Math.floor((canvasWidth - 120) / (name.length * 0.68)));
}

const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, "0");

/** The node canvas region with its technical overlay. React Flow mounts inside in M3. */
export function Canvas() {
  const phase = useUi((s) => s.activePhase);
  const focus = useUi((s) => s.focus);
  const tool = useUi((s) => s.tool);
  const setTool = useUi((s) => s.setTool);
  const [ref, size] = useSize<HTMLDivElement>();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const info = PHASE_INFO[phase];
  const n = PHASES.indexOf(phase) + 1;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <main
      ref={ref}
      className={styles.canvas}
      data-phase={phase}
      onPointerMove={onMove}
      onPointerLeave={() => setCursor(null)}
    >
      <div className={styles.grid} aria-hidden />
      <span
        className={styles.watermark}
        style={{ fontSize: watermarkSize(info.name, size.width) }}
        aria-hidden
      >
        {info.name.toUpperCase()}
      </span>
      <span className={styles.focusLabel} aria-hidden>
        {`PHASE 0${n} / 05  ·  ${focus ? "FOCUS" : "ALL PHASES"}  ·  LOOP ${workspace.loop}`}
      </span>
      {size.width > 0 && <Rulers width={size.width} height={size.height} />}
      <span className={cx(styles.bracket, styles.tl)} />
      <span className={cx(styles.bracket, styles.tr)} />
      <span className={cx(styles.bracket, styles.bl)} />
      <span className={cx(styles.bracket, styles.br)} />
      {cursor && (
        <>
          <span className={styles.crossV} style={{ left: cursor.x }} />
          <span className={styles.crossH} style={{ top: cursor.y }} />
          <span className={styles.readout} style={{ left: cursor.x + 12, top: cursor.y - 22 }}>
            {`X ${pad(cursor.x)}  Y ${pad(cursor.y)}`}
          </span>
        </>
      )}
      {focus && <PhaseRails phase={phase} />}

      <header className={styles.header}>
        <span className={styles.headerIndex}>{info.index}</span>
        <span className={styles.headerName}>{info.name}</span>
        <span className={styles.headerOutput}>
          {`ONE OUTPUT  →  ${(phase === "define" ? workspace.activeFrame : info.output).toUpperCase()}`}
        </span>
      </header>

      <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cx(styles.tool, tool === t.id && styles.toolActive)}
            onClick={() => setTool(t.id)}
          >
            <span>{t.label}</span>
            <span className={styles.toolKey}>{t.key}</span>
          </button>
        ))}
        <span className={styles.zoom}>88%</span>
      </div>
      <Minimap />
    </main>
  );
}
