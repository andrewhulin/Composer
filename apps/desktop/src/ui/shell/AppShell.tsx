import { useEffect, useState, type CSSProperties } from "react";
import { PHASES, PHASE_SURFACE, type ClaudeNode, type OutputNode } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { useSession } from "../../store/session";
import { getSecret, SECRET } from "../../platform/secrets";
import { TitleBar } from "./TitleBar";
import { PhaseRail } from "./PhaseRail";
import { Sidebar } from "../sidebar/Sidebar";
import { Canvas } from "../canvas/Canvas";
import { Inspector } from "../inspector/Inspector";
import { HistoryBar } from "../history/HistoryBar";
import { SettingsDialog } from "../settings/SettingsDialog";
import { RequestSheet } from "../requests/RequestSheet";
import { FoundationsSheet } from "../foundations/FoundationsSheet";
import { CommandPalette, KeyboardMap } from "../command/CommandPalette";
import { Coach } from "../tutorial/Coach";
import { useTutorial } from "../../tutorial/store";
import { KeyBanner, Toasts } from "../feedback/Toasts";
import { CompareView } from "../history/CompareView";
import { playback, usePlayback } from "../../store/playback";
import { Button } from "../primitives/Button";
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
      if (e.key === "Escape" && ui.requestOpen) {
        ui.setRequestOpen(false);
        return;
      }
      if (e.key === "Escape" && ui.compareOpen) {
        ui.setCompareOpen(false);
        return;
      }
      const inPlayback = usePlayback.getState().active;
      if (e.key === "Escape" && inPlayback && !typing(e.target)) {
        playback.close();
        return;
      }
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing(e.target)) {
        e.preventDefault();
        void playback.jumpBookmark(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (inPlayback && !typing(e.target) && !e.metaKey) {
        if (e.key === "ArrowLeft") return void playback.step(-1);
        if (e.key === "ArrowRight") return void playback.step(1);
        if (e.key === " ") {
          e.preventDefault();
          if (usePlayback.getState().playing) playback.pause();
          else {
            playback.setSpeed(2);
            void playback.play();
          }
          return;
        }
      }
      if (e.metaKey && e.key.toLowerCase() === "z" && !typing(e.target)) {
        e.preventDefault();
        if (inPlayback) return;
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      // Panels: ⌥⌘← sidebar, ⌥⌘→ inspector, ⌥⌘↓ history, ⌘\ all of them.
      if (e.metaKey && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowDown")) {
        e.preventDefault();
        ui.togglePanel(e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : "bottom");
        return;
      }
      if (e.metaKey && e.key === "\\") {
        e.preventDefault();
        ui.toggleAllPanels();
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
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
        if (!usePlayback.getState().active) ui.setBookmarkOpen(true);
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === "l" && node?.kind === "output") {
        e.preventDefault();
        if (node.phase === "define") void actions.lockStatement(node.id);
        else void actions.lock(node.id);
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
      else if (k === "c") ui.setTool("comment");
      else if (e.key === "?") ui.setKeysOpen(!ui.keysOpen);
      else if (k === "n") ui.setAddMenuOpen(!ui.addMenuOpen);
      else if (k === "b" && useProject.getState().activePhase === "build") ui.setVariantsOpen(!ui.variantsOpen);
      else if (k === "g" && PHASE_SURFACE[useProject.getState().activePhase] !== "canvas") ui.setShowGraph(!ui.showGraph);
      else if (k === "escape" && (ui.studio || ui.variantsOpen)) {
        if (ui.studio) ui.setStudio(null);
        else ui.setVariantsOpen(false);
      } else if (k === "escape") {
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
  const session = useSession();
  const guiding = useTutorial((s) => s.state?.status === "active");
  const panels = useUi((s) => s.panels);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const [hasKey, setHasKey] = useState(true);
  useShortcuts();
  useEffect(() => {
    if (!settingsOpen) void getSecret(SECRET.anthropic).then((k) => setHasKey(!!k));
  }, [settingsOpen]);

  return (
    <div
      className={styles.shell}
      data-phase={phase}
      style={{ ...(panels.left ? {} : { "--sidebar-w": "0px" }), ...(panels.right ? {} : { "--inspector-w": "0px" }), ...(panels.bottom ? {} : { "--history-h": "0px" }) } as CSSProperties}
    >
      <TitleBar />
      <PhaseRail />
      {panels.left && <Sidebar />}
      {ready ? <Canvas /> : session.status === "error" ? <BootError message={session.message} /> : <main className={styles.loading} />}
      {panels.right && <Inspector />}
      {panels.bottom && <HistoryBar />}
      <SettingsDialog />
      <RequestSheet />
      <FoundationsSheet />
      <CommandPalette />
      <Coach />
      <KeyboardMap />
      <CompareView />
      <Toasts />
      {ready && !hasKey && !settingsOpen && !guiding && !(import.meta.env.DEV && location.search.includes("fake")) && <KeyBanner onAdd={() => setSettingsOpen(true)} />}
    </div>
  );
}

export type { ClaudeNode, OutputNode };

/** The database couldn't open. Nothing was changed; say so, and offer the one thing that helps. */
function BootError({ message }: { message: string }) {
  return (
    <main className={styles.loading}>
      <div className={styles.bootError}>
        <span>Composer couldn't open its project database</span>
        <p>{message}</p>
        <p>Nothing was changed. Your projects live in ~/Library/Application Support/com.andrewhulin.composer/composer.db.</p>
        <Button variant="primary" size="sm" className={styles.retry} onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    </main>
  );
}
