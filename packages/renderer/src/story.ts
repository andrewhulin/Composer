/** Everything the release video needs, as plain data so it can cross from the app to a render process. */
export type Phase = "understand" | "define" | "build" | "validate" | "share";
export type Part = "who" | "behavior" | "because" | "metric";
export type Met = "yes" | "no" | "unknown";
export type Transition = "fade" | "slide" | "wipe" | "cut";

/** A metric as numbers, so the proof can be charted: the observed change, its confidence range and the target. */
export interface MetricChart {
  /** How values read: "%" for percent change, otherwise a unit word like "s" or "pts". */
  unit: string;
  observed: number;
  low: number | null;
  high: number | null;
  target: number | null;
}

export interface Metric {
  label: string;
  value: string;
  target: string;
  met: Met;
  chart?: MetricChart | null;
}

/** How the video moves: the cut between chapters, and seconds per segment (null keeps the defaults). */
export interface Motion {
  transition: Transition;
  pacing: Record<SegmentId, number> | null;
}

export interface Story {
  title: string;
  logline: string;
  problem: { quote: string; who: string; context: string };
  process: { caption: string };
  ui: { caption: string; beats: { part: Part; note: string }[] };
  proof: { caption: string; metrics: Metric[] };
  /** One spoken line per chapter: problem, process, UI, proof. */
  voiceover: string[];
  /** Stories scripted before motion existed have none, and get fades at the default pacing. */
  motion?: Motion | null;
}

export interface ProcessNode {
  id: string;
  kind: "source" | "claude" | "hypothesis" | "output";
  phase: Phase;
  loop: number;
  title: string;
  x: number;
  y: number;
  /** Creation order: the graph rebuilds in the order it was actually made. */
  seq: number;
}

export interface ProcessGraph {
  nodes: ProcessNode[];
  edges: { from: string; to: string }[];
}

export interface StoryProps extends Record<string, unknown> {
  story: Story;
  process: ProcessGraph;
  /** `src` plays the prototype from a URL (the app's player); otherwise the HTML is embedded. */
  prototype: { html: string; src?: string } | null;
  project: { name: string; loops: number };
  /** Voiceover per chapter, as paths under the render's public folder. */
  voice?: ({ src: string; seconds: number } | null)[];
  /** Load Geist from the public folder (renders); the app already has it. */
  staticFonts?: boolean;
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const PHASES: Phase[] = ["understand", "define", "build", "validate", "share"];

export const COLORS = {
  app: "#0a0a0b",
  canvas: "#0d0d0f",
  panel: "#121214",
  raised: "#19191c",
  borderSubtle: "#202024",
  borderStrong: "#34343a",
  text: "#eeedea",
  secondary: "#a29e94",
  muted: "#69665e",
  live: "#55c98e",
  hypothesis: "#e3c25a",
  warn: "#e09a45",
  phase: { understand: "#de8a45", define: "#e05a4e", build: "#9887e3", validate: "#52acd9", share: "#55c98e" } satisfies Record<Phase, string>,
} as const;

export type SegmentId = "title" | "problem" | "process" | "ui" | "proof" | "end";
export interface Segment {
  id: SegmentId;
  from: number;
  frames: number;
  /** Index into the voiceover lines, for the four chapters. */
  chapter: number | null;
}

export const BASE_SECONDS: Record<SegmentId, number> = { title: 2.5, problem: 6, process: 7, ui: 8, proof: 6, end: 2.5 };
const CHAPTERS: SegmentId[] = ["problem", "process", "ui", "proof"];
/** Paced seconds are kept between these, whatever a reference video suggests. */
const PACE_MIN = 1.5;
const PACE_MAX = 15;

export const transitionOf = (story: Story): Transition => story.motion?.transition ?? "fade";

/** Frames two neighbouring segments share while one gives way to the next. A cut shares none. */
export const transitionFrames = (story: Story, fps = FPS): number => (transitionOf(story) === "cut" ? 0 : Math.round(0.5 * fps));

/**
 * Segment lengths: the story's pacing (or the defaults), stretched to fit each chapter's voiceover
 * and content. Transitions overlap neighbours, so each segment starts before the last one ends.
 */
export function timeline(props: Pick<StoryProps, "story" | "voice">, fps = FPS): { segments: Segment[]; total: number } {
  const order: SegmentId[] = ["title", ...CHAPTERS, "end"];
  const pacing = props.story.motion?.pacing;
  const overlap = transitionFrames(props.story, fps);
  let from = 0;
  const segments = order.map((id) => {
    const chapter = CHAPTERS.indexOf(id);
    const paced = pacing?.[id];
    let seconds = typeof paced === "number" && Number.isFinite(paced) ? Math.min(PACE_MAX, Math.max(PACE_MIN, paced)) : BASE_SECONDS[id];
    if (id === "ui") seconds = Math.max(seconds, 1.5 + props.story.ui.beats.length * 2.2);
    if (id === "proof") seconds = Math.max(seconds, 2 + props.story.proof.metrics.length * 1.2);
    const voice = chapter >= 0 ? props.voice?.[chapter] : null;
    if (voice) seconds = Math.max(seconds, voice.seconds + 1);
    const frames = Math.round(seconds * fps);
    const seg: Segment = { id, from, frames, chapter: chapter >= 0 ? chapter : null };
    from += frames - overlap;
    return seg;
  });
  const last = segments[segments.length - 1]!;
  return { segments, total: last.from + last.frames };
}
