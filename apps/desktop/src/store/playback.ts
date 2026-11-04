import { create } from "zustand";
import type { Graph, Id } from "@composer/core";
import { frameDelay, playbackFrames, revealOrder } from "@composer/engine";
import type { SnapshotRow } from "@composer/data";
import { actions, ensureBlobs, toast, useProject } from "./project";
import { lineage } from "../ui/history/timeline";

export type Speed = 0.5 | 1 | 2;

interface PlaybackState {
  active: boolean;
  index: number;
  graph: Graph | null;
  /** Nodes and wires still to appear in this frame's rebuild; everything else is shown. */
  pending: { nodes: Set<Id>; edges: Set<Id> };
  playing: boolean;
  speed: Speed;
  runsOnly: boolean;
}

export const usePlayback = create<PlaybackState>(() => ({
  active: false,
  index: 0,
  graph: null,
  pending: { nodes: new Set(), edges: new Set() },
  playing: false,
  speed: 1,
  runsOnly: false,
}));

const get = usePlayback.getState;
const set = usePlayback.setState;
const graphs = new Map<string, Graph>();
let timer: ReturnType<typeof setTimeout> | undefined;
let revealTimers: ReturnType<typeof setTimeout>[] = [];
/** Bumped on every navigation and on close, so a slow frame load can't reopen playback. */
let nav = 0;

/** The current branch's snapshots, root to head: what the timeline draws and playback steps through. */
export function branchLine(): SnapshotRow[] {
  const { snapshots, branches, project } = useProject.getState();
  const head = branches.find((b) => b.id === project?.branchId)?.headSnapshotId;
  return lineage(snapshots, head ?? snapshots[snapshots.length - 1]?.id);
}

/** The snapshots playback steps through, in order. */
export function frames(): SnapshotRow[] {
  return playbackFrames(branchLine(), get().runsOnly);
}

/** Loads (and caches) the graph a snapshot recorded. */
export async function graphAt(snap: SnapshotRow): Promise<Graph> {
  const hit = graphs.get(snap.manifestHash);
  if (hit) return hit;
  const repo = useProject.getState().repo!;
  const g = await repo.loadGraph(snap.manifestHash);
  graphs.set(snap.manifestHash, g);
  return g;
}

function clearReveal() {
  revealTimers.forEach(clearTimeout);
  revealTimers = [];
}

/**
 * Shows frame `index`. Stepping forward rebuilds the canvas node by node in the order things
 * were made (Figma 05 · Scrub playback); jumping shows the frame whole.
 */
async function goto(index: number, animate: boolean) {
  const token = ++nav;
  const list = frames();
  const snap = list[index];
  if (!snap) return;
  const g = await graphAt(snap);
  await ensureBlobs(g);
  const prevSnap = list[index - 1];
  const prev = animate && prevSnap ? await graphAt(prevSnap) : undefined;
  if (token !== nav) return;
  clearReveal();
  const order = prev ? revealOrder(prev, g) : { nodes: [], edges: [] };
  set({ active: true, index, graph: g, pending: { nodes: new Set(order.nodes), edges: new Set(order.edges) } });
  const step = 90 / get().speed;
  order.nodes.forEach((id, i) =>
    revealTimers.push(setTimeout(() => set((s) => ({ pending: { ...s.pending, nodes: new Set([...s.pending.nodes].filter((x) => x !== id)) } })), step * (i + 1))),
  );
  revealTimers.push(setTimeout(() => set((s) => ({ pending: { ...s.pending, edges: new Set() } })), step * (order.nodes.length + 1)));
  const phase = snap.phase;
  if (useProject.getState().activePhase !== phase) useProject.setState({ activePhase: phase });
}

function schedule() {
  clearTimeout(timer);
  const { playing, index, speed } = get();
  const list = frames();
  if (!playing) return;
  if (index >= list.length - 1) {
    set({ playing: false });
    return;
  }
  timer = setTimeout(async () => {
    await goto(get().index + 1, true);
    schedule();
  }, frameDelay(list[index]!, list[index + 1]!, speed));
}

export const playback = {
  /** Enters playback at a snapshot (by id), or at the latest one. */
  async open(snapshotId?: Id) {
    const list = frames();
    if (!list.length) return toast("Nothing recorded yet. Every run makes a snapshot.");
    const i = snapshotId ? list.findIndex((f) => f.id === snapshotId) : list.length - 1;
    await goto(i < 0 ? list.length - 1 : i, false);
  },

  close() {
    nav++;
    clearTimeout(timer);
    clearReveal();
    set({ active: false, playing: false, graph: null, pending: { nodes: new Set(), edges: new Set() } });
    const project = useProject.getState().project;
    if (project) useProject.setState({ activePhase: project.activePhase });
  },

  async step(delta: number) {
    const list = frames();
    if (!get().active) {
      // From the live canvas, stepping back starts one before the latest snapshot.
      if (delta >= 0 || list.length < 2) return;
      return goto(list.length - 2, false);
    }
    const i = Math.max(0, Math.min(list.length - 1, get().index + delta));
    await goto(i, delta > 0);
  },

  async seek(index: number) {
    set({ playing: false });
    clearTimeout(timer);
    await goto(index, false);
  },

  async play() {
    if (!get().active) await goto(0, false);
    else if (get().index >= frames().length - 1) await goto(0, false);
    set({ playing: true });
    schedule();
  },

  pause() {
    clearTimeout(timer);
    set({ playing: false });
  },

  setSpeed(speed: Speed) {
    set({ speed });
    schedule();
  },

  toggleRunsOnly() {
    const current = frames()[get().index]?.id;
    set((s) => ({ runsOnly: !s.runsOnly }));
    const list = frames();
    const i = Math.max(0, list.findIndex((f) => f.id === current));
    if (get().active) void goto(i, false);
  },

  /** Jumps to the previous or next bookmark (⇧← / ⇧→). */
  async jumpBookmark(direction: -1 | 1) {
    const { bookmarks } = useProject.getState();
    const list = frames();
    const here = get().active ? (list[get().index]?.seq ?? Infinity) : Infinity;
    const sorted = [...bookmarks].sort((a, b) => a.seq - b.seq);
    const target = direction < 0 ? [...sorted].reverse().find((b) => b.seq < here) : sorted.find((b) => b.seq > here);
    if (!target) return toast(direction < 0 ? "No earlier bookmark" : "No later bookmark");
    await playback.open(target.snapshotId);
  },

  /** Starts a branch at the frame on screen and returns to editing it. */
  async branchFromHere() {
    const snap = frames()[get().index];
    const { repo, project } = useProject.getState();
    if (!snap || !repo || !project) return;
    const name = `from #${snap.seq}`;
    await repo.branchFrom(project.id, snap.id, name);
    playback.close();
    await actions.reloadFromRepo();
    toast(`Branched from snapshot ${snap.seq}. Edits go on “${name}”; the old line is kept.`, "success");
  },
};
