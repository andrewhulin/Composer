import { useState, type PointerEvent } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { PHASES, PHASE_INFO, PHASE_SURFACE, type ClaudeNode } from "@composer/core";
import { FRAMES } from "@composer/engine";
import { useProject } from "../../store/project";
import { useUi, type CanvasTool } from "../../store/ui";
import { useSize } from "../primitives/useSize";
import { cx } from "../primitives/cx";
import { Button } from "../primitives/Button";
import { Rulers } from "./Rulers";
import { PhaseRails } from "./PhaseRails";
import { FlowCanvas } from "./FlowCanvas";
import { AddNodeMenu } from "./AddNodeMenu";
import { PlaybackBanner } from "./PlaybackBanner";
import { usePlayback } from "../../store/playback";
import { Workspace, SurfaceToggle } from "../workspace/Workspace";
import { KeyNode } from "../keynode/KeyNode";
import { VariantsBoard } from "../build/VariantsBoard";
import { PrototypeStudio } from "../build/PrototypeStudio";
import styles from "./Canvas.module.css";

const TOOLS: { id: CanvasTool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "V" },
  { id: "pan", label: "Pan", key: "H" },
  { id: "comment", label: "Comment", key: "C" },
];

const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, "0");

/** The define phase's output label follows the frame its Claude node drafts. */
export function useOutputLabel(phase: (typeof PHASES)[number]): string {
  return useProject((s) => {
    if (phase !== "define") return PHASE_INFO[phase].output;
    const claude = Object.values(s.graph.nodes).find((n): n is ClaudeNode => n.kind === "claude" && n.phase === "define" && n.loop === s.loop);
    const frame = claude?.options.frame as keyof typeof FRAMES | undefined;
    return frame ? FRAMES[frame] : PHASE_INFO[phase].output;
  });
}

/** The node canvas region with its technical overlay. */
export function Canvas() {
  const phase = useProject((s) => s.activePhase);
  const loop = useProject((s) => s.loop);
  const focus = useUi((s) => s.focus);
  const tool = useUi((s) => s.tool);
  const zoom = useUi((s) => s.zoom);
  const setTool = useUi((s) => s.setTool);
  const addMenuOpen = useUi((s) => s.addMenuOpen);
  const setAddMenuOpen = useUi((s) => s.setAddMenuOpen);
  const [ref, size] = useSize<HTMLDivElement>();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const info = PHASE_INFO[phase];
  const n = PHASES.indexOf(phase) + 1;
  const output = useOutputLabel(phase);
  const playing = usePlayback((s) => s.active);
  const showGraph = useUi((s) => s.showGraph);
  const variantsOpen = useUi((s) => s.variantsOpen);
  const setVariantsOpen = useUi((s) => s.setVariantsOpen);
  const studio = useUi((s) => s.studio);
  // Define and Validate are workspaces; the graph under them is a toggle away. Playback always shows the graph.
  const workspace = focus && !playing && PHASE_SURFACE[phase] !== "canvas" && !showGraph;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <main ref={ref} className={cx(styles.canvas, playing && styles.playback)} data-phase={phase} onPointerMove={workspace ? undefined : onMove} onPointerLeave={() => setCursor(null)}>
      <div className={styles.grid} aria-hidden />
      <span className={styles.focusLabel} aria-hidden>
        {`PHASE 0${n} / 05  ·  ${focus ? "FOCUS" : "ALL PHASES"}  ·  LOOP ${loop}`}
      </span>
      {size.width > 0 && <Rulers width={size.width} height={size.height} />}
      <span className={cx(styles.bracket, styles.tl)} />
      <span className={cx(styles.bracket, styles.tr)} />
      <span className={cx(styles.bracket, styles.bl)} />
      <span className={cx(styles.bracket, styles.br)} />
      {cursor && !workspace && (
        <>
          <span className={styles.crossV} style={{ left: cursor.x }} />
          <span className={styles.crossH} style={{ top: cursor.y }} />
          <span className={styles.readout} style={{ left: cursor.x + 15, top: cursor.y - 28 }}>
            {`X ${pad(cursor.x)}  Y ${pad(cursor.y)}`}
          </span>
        </>
      )}

      {workspace ? (
        <Workspace phase={phase} />
      ) : (
        <ReactFlowProvider>
          <FlowCanvas />
        </ReactFlowProvider>
      )}

      {focus && <PhaseRails phase={phase} />}
      {focus && !playing && <SurfaceToggle phase={phase} />}
      {focus && !playing && <KeyNode phase={phase} />}
      {variantsOpen && phase === "build" && !playing && <VariantsBoard />}
      {studio && !playing && <PrototypeStudio nodeId={studio.nodeId} />}
      {playing && <PlaybackBanner />}
      {focus && (
        <header className={styles.header}>
          <span className={styles.headerIndex}>{info.index}</span>
          <span className={styles.headerName}>{info.name}</span>
          <span className={styles.headerOutput}>{`ONE OUTPUT  →  ${output.toUpperCase()}`}</span>
        </header>
      )}

      <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools" hidden={playing}>
        {!workspace && TOOLS.map((t) => (
          <Button key={t.id} variant="ghost" size="sm" shortcut={t.key} pressed={tool === t.id} onClick={() => setTool(t.id)}>
            {t.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" shortcut="N" pressed={addMenuOpen} onClick={() => setAddMenuOpen(!addMenuOpen)}>
          Add node
        </Button>
        {phase === "build" && focus && (
          <Button variant="ghost" size="sm" shortcut="B" pressed={variantsOpen} onClick={() => setVariantsOpen(!variantsOpen)}>
            Variants
          </Button>
        )}
        {!workspace && <span className={styles.zoom}>{Math.round(zoom * 100)}%</span>}
        {addMenuOpen && <AddNodeMenu onClose={() => setAddMenuOpen(false)} />}
      </div>
    </main>
  );
}
