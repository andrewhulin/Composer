import { describe, expect, it } from "vitest";
import { describeReference, frameDiffs, frameTimes, sceneCuts, shotsFrom } from "./pacing";

describe("reference pacing", () => {
  it("measures how much each frame changed from the last", () => {
    const gray = new Uint8Array([0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255]);
    expect(frameDiffs(gray, 4)).toEqual([0.5, 0.5]);
  });

  it("marks a hard cut, and a slide once at its peak", () => {
    const diffs = Array<number>(60).fill(0.003);
    diffs[19] = 0.4; // hard cut into sample 20: 2.0 s at 10 fps
    diffs.splice(39, 4, 0.06, 0.15, 0.18, 0.07); // a slide peaking into sample 42
    expect(sceneCuts(diffs, 10)).toEqual([2, 4.2]);
  });

  it("ignores small changes, and steady motion that never stands out", () => {
    expect(sceneCuts(Array<number>(50).fill(0.015), 10)).toEqual([]);
    const scrolling: number[] = Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.05 : 0.06));
    expect(sceneCuts(scrolling, 10)).toEqual([]);
    scrolling[30] = 0.4;
    expect(sceneCuts(scrolling, 10)).toEqual([3.1]);
  });

  it("splits the video into shots, ignoring flicker", () => {
    expect(shotsFrom(10, [2.4, 2.45, 5, 9.95])).toEqual([
      { start: 0, end: 2.4, seconds: 2.4 },
      { start: 2.4, end: 5, seconds: 2.6 },
      { start: 5, end: 10, seconds: 5 },
    ]);
  });

  it("looks at the middle of every shot, then fills gaps evenly", () => {
    const times = frameTimes(10, [2.4, 5, 7.5], 6);
    expect(times).toHaveLength(6);
    for (const mid of [1.2, 3.7, 6.25, 8.75]) expect(times).toContain(mid);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("gives one long shot several looks, and never more than asked for", () => {
    expect(frameTimes(20, [], 4)).toEqual([2.5, 7.5, 12.5, 17.5]);
    expect(frameTimes(60, Array.from({ length: 40 }, (_, i) => i + 1), 10)).toHaveLength(10);
    expect(frameTimes(0, [], 4)).toEqual([]);
  });

  it("describes the rhythm in words for the story to follow", () => {
    const lines = describeReference({ duration: 10, width: 1080, height: 1350, fps: 30, cuts: [2.4, 5, 7.5], frames: [] });
    expect(lines).toEqual(["Length 10.0 s · 1080×1350 · 30 fps.", "4 shots. Median shot 2.5 s, shortest 2.4 s, longest 2.6 s.", "Cuts at 2.4 s, 5.0 s, 7.5 s."]);
    expect(describeReference({ duration: 8, width: 1920, height: 1080, fps: 60, cuts: [], frames: [] })[1]).toMatch(/One continuous shot/);
  });
});
