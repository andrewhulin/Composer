import { useEffect, useMemo, useRef, useState } from "react";
import { PHASES, PHASE_INFO, type Phase } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { playback } from "../../store/playback";
import { openFoundations, reflect } from "../../store/craft";
import { tutorial, useTutorial } from "../../tutorial/store";
import { cx } from "../primitives/cx";
import styles from "./CommandPalette.module.css";

interface Item {
  id: string;
  group: "Actions" | "Nodes" | "Memory" | "Snapshots";
  label: string;
  hint?: string;
  keys?: string;
  phase?: Phase;
  run: () => void;
}

const KIND = { source: "source", claude: "Claude", hypothesis: "hypothesis", output: "output" } as const;

function useItems(open: boolean): Item[] {
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const selection = useProject((s) => s.selection);
  const hypotheses = useProject((s) => s.hypotheses);
  const versions = useProject((s) => s.versions);
  const snapshots = useProject((s) => s.snapshots);
  const bookmarks = useProject((s) => s.bookmarks);
  return useMemo(() => {
    if (!open) return [];
    const ui = useUi.getState();
    const selected = selection ? graph.nodes[selection] : undefined;
    const go = (phase: Phase, id?: string) => {
      void actions.setActivePhase(phase).then(() => id && actions.select(id));
    };
    const items: Item[] = [
      ...PHASES.map((p, i) => ({ id: `phase:${p}`, group: "Actions" as const, label: `Go to ${PHASE_INFO[p].name}`, keys: `⌘${i + 1}`, phase: p, run: () => go(p) })),
      ...(selected?.kind === "claude" ? [{ id: "run", group: "Actions" as const, label: `Run ${selected.title}`, keys: "⌘↵", run: () => actions.run(selected.id) }] : []),
      { id: "add", group: "Actions", label: "Add node", keys: "N", run: () => ui.setAddMenuOpen(true) },
      { id: "comment", group: "Actions", label: "Add a comment", keys: "C", run: () => ui.setTool("comment") },
      { id: "snapshot", group: "Actions", label: "Bookmark this snapshot", keys: "⌘B", run: () => ui.setBookmarkOpen(true) },
      { id: "panel-left", group: "Actions", label: `${ui.panels.left ? "Hide" : "Show"} sidebar`, keys: "⌥⌘←", run: () => ui.togglePanel("left") },
      { id: "panel-right", group: "Actions", label: `${ui.panels.right ? "Hide" : "Show"} inspector`, keys: "⌥⌘→", run: () => ui.togglePanel("right") },
      { id: "panel-bottom", group: "Actions", label: `${ui.panels.bottom ? "Hide" : "Show"} history`, keys: "⌥⌘↓", run: () => ui.togglePanel("bottom") },
      { id: "panel-all", group: "Actions", label: ui.panels.left || ui.panels.right || ui.panels.bottom ? "Hide all panels" : "Show all panels", keys: "⌘\\", run: () => ui.toggleAllPanels() },
      { id: "focus", group: "Actions", label: ui.focus ? "Show all phases" : "Focus the active phase", run: () => ui.toggleFocus() },
      { id: "playback", group: "Actions", label: "Play back the process", run: () => void playback.open() },
      { id: "compare", group: "Actions", label: "Compare snapshots", run: () => ui.setCompareOpen(true) },
      { id: "foundations", group: "Actions", label: "Open Foundations", hint: "design system, philosophy, learned rules", run: () => openFoundations() },
      { id: "reflect", group: "Actions", label: "Reflect now", hint: "draft rules from scored runs", run: () => void reflect() },
      { id: "settings", group: "Actions", label: "Settings", keys: "⌘,", run: () => ui.setSettingsOpen(true) },
      { id: "keys", group: "Actions", label: "Keyboard shortcuts", keys: "?", run: () => ui.setKeysOpen(true) },
      ...(useTutorial.getState().state?.status === "paused" ? [{ id: "guide-resume", group: "Actions" as const, label: "Tutorial: resume the guide", hint: "pick up where you left off", run: () => tutorial.resume() }] : []),
      { id: "guide-restart", group: "Actions", label: "Tutorial: start from the beginning", hint: "setup and your first loop", run: () => tutorial.restart() },
    ];
    for (const n of Object.values(graph.nodes)) {
      if (n.loop !== loop) continue;
      const title = n.kind === "hypothesis" ? `${n.alias} · hypothesis` : n.kind === "output" && n.mode === "inlet" ? `${n.title} inlet` : n.title;
      items.push({ id: `node:${n.id}`, group: "Nodes", label: title, hint: `${PHASE_INFO[n.phase].name} · ${KIND[n.kind]}${n.kind === "source" ? ` · ${n.platform}` : ""}`, phase: n.phase, run: () => go(n.phase, n.id) });
    }
    for (const h of Object.values(hypotheses)) {
      items.push({ id: `hyp:${h.id}`, group: "Memory", label: `${h.label} · ${h.statement}`, hint: h.status, run: () => actions.placeHypothesis(h.id) });
    }
    const latest = new Map<string, (typeof versions)[string]>();
    for (const v of Object.values(versions)) if (v.loop === loop && (!latest.get(v.phase) || latest.get(v.phase)!.version < v.version)) latest.set(v.phase, v);
    for (const v of latest.values()) {
      const out = Object.values(graph.nodes).find((n) => n.kind === "output" && n.mode === "output" && n.familyId === v.familyId);
      items.push({ id: `ver:${v.id}`, group: "Memory", label: `${PHASE_INFO[v.phase].output} v${v.version}`, hint: `${PHASE_INFO[v.phase].name} · locked`, phase: v.phase, run: () => go(v.phase, out?.id) });
    }
    const marked = new Map(bookmarks.map((b) => [b.snapshotId, b.label]));
    for (const s of [...snapshots].reverse()) {
      const label = marked.get(s.id) ?? s.label;
      if (!label) continue;
      items.push({ id: `snap:${s.id}`, group: "Snapshots", label, hint: `${marked.has(s.id) ? "bookmark · " : ""}snapshot ${s.seq}`, phase: s.phase, run: () => void playback.open(s.id) });
    }
    return items;
  }, [open, graph, loop, selection, hypotheses, versions, snapshots, bookmarks]);
}

/** Every word must appear; earlier and word-start matches rank first. */
function rank(items: Item[], query: string): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.filter((i) => i.group === "Actions").concat(items.filter((i) => i.group === "Nodes").slice(0, 8));
  return items
    .map((item) => {
      const hay = `${item.label} ${item.hint ?? ""}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        const at = hay.indexOf(w);
        if (at < 0) return null;
        score += at === 0 ? 0 : /\W/.test(hay[at - 1] ?? "") ? 5 : 20 + at;
      }
      return { item, score: score + (item.group === "Actions" ? 0 : 2) };
    })
    .filter((x): x is { item: Item; score: number } => !!x)
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map((x) => x.item);
}

/** ⌘K: jump to any node, hypothesis, locked output or bookmark, or run an action. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const items = useItems(open);
  const shown = useMemo(() => rank(items, query), [items, query]);
  const list = useRef<HTMLDivElement>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setQuery("");
    setIndex(0);
  }
  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);
  if (!open) return null;
  const choose = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };
  return (
    <div className={styles.scrim} onPointerDown={() => setOpen(false)}>
      <div className={styles.palette} role="dialog" aria-label="Search" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className={styles.input}
          placeholder="Search nodes, memory, snapshots, actions…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(shown.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") choose(shown[index]);
          }}
        />
        <div className={styles.list} ref={list}>
          {shown.length === 0 && <p className={styles.empty}>Nothing matches “{query}”.</p>}
          {shown.map((item, i) => {
            const head = i === 0 || shown[i - 1]!.group !== item.group ? item.group : null;
            return (
              <div key={item.id}>
                {head && <span className={styles.group}>{head}</span>}
                <button type="button" data-index={i} className={cx(styles.item, i === index && styles.active)} onPointerEnter={() => setIndex(i)} onClick={() => choose(item)}>
                  {item.phase && <span className={styles.dot} style={{ background: `var(--phase-${item.phase})` }} />}
                  <span className={styles.label}>{item.label}</span>
                  {item.hint && <span className={styles.hint}>{item.hint}</span>}
                  {item.keys && <span className={styles.keys}>{item.keys}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const MAP: { group: string; keys: [string, string][] }[] = [
  { group: "Run and lock", keys: [["⌘↵", "Run the selected Claude node (and anything stale above it)"], ["⌘.", "Cancel the run"], ["⌘L", "Lock the selected output"], ["⌘B", "Bookmark this snapshot"]] },
  { group: "Canvas", keys: [["V", "Select"], ["H", "Pan"], ["C", "Comment"], ["N", "Add node"], ["W", "Cycle weight: mute, light, normal, heavy"], ["P", "Pin or unpin"], ["⌥ drag", "Drop without snapping"], ["⌘1–5", "Go to a phase"]] },
  { group: "History", keys: [["⌘Z / ⇧⌘Z", "Undo and redo (never deletes runs)"], ["⇧← / ⇧→", "Previous or next bookmark"], ["← / →", "Step through playback"], ["Space", "Play or pause playback"], ["Esc", "Leave playback"]] },
  { group: "Panels", keys: [["⌥⌘←", "Show or hide the sidebar"], ["⌥⌘→", "Show or hide the inspector"], ["⌥⌘↓", "Show or hide the history bar"], ["⌘\\", "Hide every panel, or bring them all back"]] },
  { group: "App", keys: [["⌘K", "Search everything"], ["⌘,", "Settings"], ["?", "This list"]] },
];

export function KeyboardMap() {
  const open = useUi((s) => s.keysOpen);
  const setOpen = useUi((s) => s.setKeysOpen);
  if (!open) return null;
  return (
    <div className={styles.scrim} onPointerDown={() => setOpen(false)}>
      <div className={cx(styles.palette, styles.keymap)} role="dialog" aria-label="Keyboard shortcuts" onPointerDown={(e) => e.stopPropagation()}>
        <div className={styles.mapHead}>
          <span>Keyboard shortcuts</span>
          <button type="button" className={styles.esc} onClick={() => setOpen(false)}>
            esc
          </button>
        </div>
        <div className={styles.map}>
          {MAP.map((g) => (
            <div key={g.group} className={styles.mapGroup}>
              <span className={styles.group}>{g.group}</span>
              {g.keys.map(([k, what]) => (
                <div key={k} className={styles.mapRow}>
                  <span className={styles.keys}>{k}</span>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
