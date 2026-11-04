import { useUi } from "../../store/ui";
import { TitleBar } from "./TitleBar";
import { PhaseRail } from "./PhaseRail";
import { Sidebar } from "../sidebar/Sidebar";
import { Canvas } from "../canvas/Canvas";
import { Inspector } from "../inspector/Inspector";
import { HistoryBar } from "../history/HistoryBar";
import styles from "./AppShell.module.css";

/** The 01 · Workspace window: title bar, phase rail, sidebar, canvas, inspector, history. */
export function AppShell() {
  const phase = useUi((s) => s.activePhase);
  return (
    <div className={styles.shell} data-phase={phase}>
      <TitleBar />
      <PhaseRail />
      <Sidebar />
      <Canvas />
      <Inspector />
      <HistoryBar />
    </div>
  );
}
