import { PHASES, type Phase } from "@composer/core";
import type { SnapshotRow } from "@composer/data";

export interface TimelineData {
  segments: { phase: Phase; start: number; end: number }[];
  ticks: { at: number; kind: SnapshotRow["kind"]; id: string }[];
  bookmarks: { label: string; at: number }[];
  playhead: { at: number; time: string } | null;
}

/**
 * Lays snapshots along the track in order. Phases with history take the space their snapshots
 * need; phases still ahead share what's left, so the whole loop is always visible.
 */
export function timelineFrom(snapshots: SnapshotRow[], bookmarks: { snapshotId: string; label: string }[], activePhase: Phase): TimelineData {
  const slots = Math.max(snapshots.length + 4, 20);
  const pos = (i: number) => (i + 0.5) / slots;
  const used = snapshots.length / slots;
  const seen = PHASES.filter((p) => snapshots.some((s) => s.phase === p));
  const lastSeen = Math.max(PHASES.indexOf(activePhase), ...seen.map((p) => PHASES.indexOf(p)));
  const segments: TimelineData["segments"] = [];
  let cursor = 0;
  PHASES.forEach((p, i) => {
    if (i > lastSeen) return;
    const idx = snapshots.map((s, k) => (s.phase === p ? k : -1)).filter((k) => k >= 0);
    const end = i === lastSeen ? Math.max(used, cursor + 0.14) : idx.length ? pos(idx[idx.length - 1]!) + 0.5 / slots : cursor + 0.06;
    segments.push({ phase: p, start: cursor, end: Math.min(1, end) });
    cursor = Math.min(1, end);
  });
  const ahead = PHASES.slice(lastSeen + 1);
  const each = ahead.length ? (1 - cursor) / ahead.length : 0;
  ahead.forEach((p, i) => segments.push({ phase: p, start: cursor + i * each, end: cursor + (i + 1) * each }));
  const byId = new Map(snapshots.map((s, i) => [s.id, i]));
  const last = snapshots[snapshots.length - 1];
  return {
    segments,
    ticks: snapshots.map((s, i) => ({ at: pos(i), kind: s.kind, id: s.id })),
    bookmarks: bookmarks.filter((b) => byId.has(b.snapshotId)).map((b) => ({ label: b.label, at: pos(byId.get(b.snapshotId)!) })),
    playhead: last ? { at: pos(snapshots.length - 1), time: new Date(last.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) } : null,
  };
}

/** The snapshots on the path from the first one to `headId`, following parent links. */
export function lineage(snapshots: SnapshotRow[], headId: string | null | undefined): SnapshotRow[] {
  if (!headId) return snapshots;
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  const out: SnapshotRow[] = [];
  let cur = byId.get(headId);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out.length ? out : snapshots;
}
