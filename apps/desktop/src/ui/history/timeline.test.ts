import { describe, expect, it } from "vitest";
import type { SnapshotRow } from "@composer/data";
import { timelineFrom } from "./timeline";

const snap = (i: number, phase: SnapshotRow["phase"], kind: SnapshotRow["kind"] = "run"): SnapshotRow => ({
  id: `s${i}`, projectId: "p", branchId: "b", parentId: i ? `s${i - 1}` : null, seq: i + 1, manifestHash: "m", kind, causeId: null, label: null, phase, createdAt: new Date(Date.UTC(2026, 10, 4, 11, i)).toISOString(),
});

describe("timelineFrom", () => {
  it("covers the whole loop, in phase order, without overlaps", () => {
    const t = timelineFrom([snap(0, "understand"), snap(1, "understand", "lock"), snap(2, "define")], [{ snapshotId: "s1", label: "Interviews synthesized" }], "define");
    expect(t.segments.map((s) => s.phase)).toEqual(["understand", "define", "build", "validate", "share"]);
    for (let i = 1; i < t.segments.length; i++) expect(t.segments[i]!.start).toBeCloseTo(t.segments[i - 1]!.end, 6);
    expect(t.segments.at(-1)!.end).toBeCloseTo(1, 6);
    expect(t.ticks).toHaveLength(3);
    expect(t.bookmarks).toEqual([{ label: "Interviews synthesized", at: t.ticks[1]!.at }]);
    expect(t.playhead?.at).toBe(t.ticks[2]!.at);
  });

  it("still shows every phase before anything has run", () => {
    const t = timelineFrom([], [], "understand");
    expect(t.segments).toHaveLength(5);
    expect(t.playhead).toBeNull();
  });
});
