import { useEffect, useState } from "react";
import { PHASES, type ClaudeNode, type OutputNode } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { getSecret, SECRET } from "../../platform/secrets";
import { TitleBar } from "./TitleBar";
import { PhaseRail } from "./PhaseRail";
import { Sidebar } from "../sidebar/Sidebar";
import { Canvas } from "../canvas/Canvas";
import { Inspector } from "../inspector/Inspector";
import { HistoryBar } from "../history/HistoryBar";
import { SettingsDialog } from "../settings/SettingsDialog";
import { KeyBanner, Toasts } from "../feedback/Toasts";
import styles from "./AppShell.module.css";

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** The keyboard map. Shortcuts follow Figma: ⌘↵ run, ⌘B snapshot, W weight, V/H tools, N add. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selection, graph } = useProject.getState();
      const node = selection ? graph.nodes[selection] : undefined;
      const ui = useUi.getState();
      if (e.key === "Escape" && ui.settingsOpen) {
        ui.setSettingsOpen(false);
        return;
      }
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        ui.setSettingsOpen(true);
        return;
      }
      if (e.metaKey && e.key === "Enter" && node?.kind === "claude") {
        e.preventDefault();
        actions.run(node.id);
        return;
      }
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        if (node) actions.cancel(node.id);
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        void actions.snapshot();
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "l" && node?.kind === "output") {
        e.preventDefault();
        void actions.lock(node.id);
        return;
      }
      if (e.metaKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        void actions.setActivePhase(PHASES[Number(e.key) - 1]!);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "w" && node) actions.cycleWeight(node.id);
      else if (k === "p" && node) actions.togglePin(node.id);
      else if (k === "v") ui.setTool("select");
      else if (k === "h") ui.setTool("pan");
      else if (k === "n") ui.setAddMenuOpen(!ui.addMenuOpen);
      else if (k === "escape") {
        ui.setAddMenuOpen(false);
        actions.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The 01 · Workspace window: title bar, phase rail, sidebar, canvas, inspector, history. */
export function AppShell() {
  const phase = useProject((s) => s.activePhase);
  const ready = useProject((s) => s.ready);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const [hasKey, setHasKey] = useState(true);
  useShortcuts();
  useEffect(() => {
    if (!settingsOpen) void getSecret(SECRET.anthropic).then((k) => setHasKey(!!k));
  }, [settingsOpen]);

  return (
    <div className={styles.shell} data-phase={phase}>
      <TitleBar />
      <PhaseRail />
      <Sidebar />
      {ready ? <Canvas /> : <main className={styles.loading} />}
      <Inspector />
      <HistoryBar />
      <SettingsDialog />
      <Toasts />
      {ready && !hasKey && !settingsOpen && !(import.meta.env.DEV && location.search.includes("fake")) && <KeyBanner onAdd={() => setSettingsOpen(true)} />}
    </div>
  );
}

export type { ClaudeNode, OutputNode };
