/** A reference video as ffmpeg read it: its size, length and where its shots change. */
export interface ReferenceInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  /** Seconds where a new shot starts. */
  cuts: number[];
  /** Stills pulled from it, for Claude to look at, each with a JPEG data URL. */
  frames: { file: string; t: number; image?: string }[];
}

export interface Shot {
  start: number;
  end: number;
  seconds: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** How much each frame changed from the one before, 0–1, from grayscale frames laid end to end. */
export function frameDiffs(gray: Uint8Array, frameSize: number): number[] {
  const n = Math.floor(gray.length / frameSize);
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) sum += Math.abs(gray[i * frameSize + j]! - gray[(i - 1) * frameSize + j]!);
    diffs.push(sum / frameSize / 255);
  }
  return diffs;
}

/** Below this much change a frame is the same shot, however it peaks. */
const CUT_FLOOR = 0.02;
/** A cut has to stand this far above the motion around it, so a scrolling shot isn't a string of cuts. */
const CUT_CONTRAST = 3;

/** Samples either side of a peak that belong to it: a slide or a push spreads over a few. */
const PEAK_REACH = 2;

/**
 * Where shots change, in seconds. `diffs[i]` is the change into sample i + 1. A cut is the biggest
 * change within a few samples that also stands out from the typical change in the second and a
 * half around it, so a slide counts once and steady motion never counts.
 */
export function sceneCuts(diffs: number[], sampleFps: number): number[] {
  const window = Math.round(1.5 * sampleFps);
  const cuts: number[] = [];
  diffs.forEach((d, i) => {
    if (d < CUT_FLOOR) return;
    const near = diffs.slice(Math.max(0, i - PEAK_REACH), i + PEAK_REACH + 1);
    if (near.some((x) => x > d)) return;
    const around = [...diffs.slice(Math.max(0, i - window), Math.max(0, i - PEAK_REACH)), ...diffs.slice(i + PEAK_REACH + 1, i + window + 1)].sort((a, b) => a - b);
    const typical = around.length ? around[Math.floor(around.length / 2)]! : 0;
    if (d < CUT_CONTRAST * typical + 0.005) return;
    const t = r2((i + 1) / sampleFps);
    if (!cuts.length || t - cuts[cuts.length - 1]! >= 0.3) cuts.push(t);
  });
  return cuts;
}

/** The shots between cuts. Cuts closer than a tenth of a second to the last one are flicker, not a new shot. */
export function shotsFrom(duration: number, cuts: number[]): Shot[] {
  const edges = [0];
  for (const c of cuts) if (c < duration - 0.1 && c - edges[edges.length - 1]! >= 0.1) edges.push(c);
  edges.push(duration);
  return edges.slice(1).map((end, i) => ({ start: edges[i]!, end, seconds: r2(end - edges[i]!) }));
}

/**
 * The moments worth a still, at most `max`: the middle of each shot first, then evenly spaced
 * times to fill gaps, so one long shot still gets several looks.
 */
export function frameTimes(duration: number, cuts: number[], max: number): number[] {
  if (duration <= 0 || max <= 0) return [];
  const shots = shotsFrom(duration, cuts);
  // One continuous shot has no middle worth favouring: evenly spaced looks cover it best.
  let times = shots.length > 1 ? shots.map((s) => (s.start + s.end) / 2) : [];
  if (times.length > max) times = Array.from({ length: max }, (_, i) => times[Math.floor((i * times.length) / max)]!);
  for (let i = 0; times.length < max && i < max; i++) {
    const t = (duration * (i + 0.5)) / max;
    if (times.every((x) => Math.abs(x - t) >= 0.5)) times.push(t);
  }
  return times.map(r2).sort((a, b) => a - b);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The reference's rhythm in words, for the release story to read alongside its stills. */
export function describeReference(info: ReferenceInfo): string[] {
  const shots = shotsFrom(info.duration, info.cuts);
  const lengths = shots.map((s) => s.seconds);
  const lines = [`Length ${info.duration.toFixed(1)} s · ${info.width}×${info.height} · ${Math.round(info.fps)} fps.`];
  if (shots.length > 1) {
    lines.push(`${shots.length} shots. Median shot ${median(lengths).toFixed(1)} s, shortest ${Math.min(...lengths).toFixed(1)} s, longest ${Math.max(...lengths).toFixed(1)} s.`);
    lines.push(`Cuts at ${info.cuts.map((c) => `${c.toFixed(1)} s`).join(", ")}.`);
  } else {
    lines.push("One continuous shot: no hard cuts, so changes happen by motion within the frame.");
  }
  return lines;
}
