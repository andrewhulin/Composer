import type { Phase } from "@composer/core";

/**
 * The "Recap after a session" project exactly as drawn in Figma 01 · Workspace.
 * M1 renders the shell from this; M3+ replace each slice with live store data.
 */

export type PhaseStatus = "done" | "active" | "pending";

export interface SourceRowData {
  id: string;
  glyph: string;
  name: string;
  count: string;
  /** Wired into the phase in focus: tile takes the phase tint. */
  wired?: boolean;
  state?: "dragging";
}

export interface MemoryRowData {
  id: string;
  label: string;
  meta: string;
  dot: "hypothesis" | "retired" | "rules" | "understand";
  active?: boolean;
  retired?: boolean;
}

export interface ContextChipData {
  id: string;
  label: string;
  tokens: number;
  dot: "inlet" | "source" | "dropping";
  enabled: boolean;
  dropping?: boolean;
}

export interface TimelineData {
  segments: { phase: Phase; start: number; end: number }[];
  ticks: number[];
  bookmarks: { label: string; at: number }[];
  branches: { label: string; from: number; to: number; retired: boolean }[];
  playhead: { at: number; time: string };
}

export const workspace = {
  project: "Recap after a session",
  snapshot: { current: 14, total: 22, when: "Nov 4 · 11:42", time: "11:42" },
  loop: 1,
  phaseStatus: {
    understand: "done",
    define: "active",
    build: "pending",
    validate: "pending",
    share: "pending",
  } satisfies Record<Phase, PhaseStatus>,
  /** Define is drafting the "Problem statement" frame of its testable statement. */
  activeFrame: "Problem statement",
  sources: [
    { id: "linear", glyph: "L", name: "Linear", count: "1", wired: true },
    { id: "interviews", glyph: "G", name: "Interview transcripts", count: "12", wired: true },
    { id: "pinterest", glyph: "P", name: "Pinterest · Nov board", count: "64", wired: true },
    { id: "arena", glyph: "A", name: "Are.na · interface motion", count: "40" },
    { id: "mobbin", glyph: "M", name: "Mobbin", count: "", state: "dragging" },
    { id: "60fps", glyph: "6", name: "60fps", count: "8" },
    { id: "requests", glyph: "R", name: "Customer requests", count: "21" },
  ] satisfies SourceRowData[],
  memory: [
    { id: "h2", label: "H2 · proof of progress", meta: "active", dot: "hypothesis", active: true },
    { id: "h1", label: "H1 · show the transcript", meta: "retired", dot: "retired", retired: true },
    { id: "rules", label: "Learned rules", meta: "4", dot: "rules" },
    { id: "wc", label: "Weighted context · Understand", meta: "v2", dot: "understand" },
  ] satisfies MemoryRowData[],
  foundations: {
    designSystem: { title: "Design system", meta: "v3.2 · 412 tokens", badge: "2 to review" },
    philosophy: { title: "Design philosophy", meta: "rev 14 · sharpened today", badge: "+1 rule" },
  },
  memoryHealth: {
    title: "Learned a rule 3 runs ago",
    body: "“For Define, raw quotes beat summaries.” Applied to every Claude node in this phase.",
  },
  preview: {
    source: "Output · Problem statement v3",
    label: "Problem statement · v3",
    headline: "Returning users can’t see what changed since their last session.",
    body: [
      "Who: people on their third session or later.",
      "Evidence: P04, P07 and P11 asked what was covered last time.",
      "Constraint: the recap can’t add a screen before chat.",
    ],
    footer: "Rendered 14s after the last run",
  },
  budget: 200_000,
  alwaysOn: { designSystem: "Design system v3.2", philosophy: "Philosophy rev 14", tokens: 1900 },
  chips: [
    { id: "wc", label: "Weighted context · Understand v2", tokens: 3100, dot: "inlet", enabled: true },
    { id: "linear", label: "Linear · Recap after a session", tokens: 1400, dot: "source", enabled: true },
    { id: "interviews", label: "Interviews · P04, P07, P11", tokens: 6200, dot: "source", enabled: true },
    { id: "pinterest", label: "Pinterest · Nov board · 12 pins", tokens: 2900, dot: "source", enabled: true },
    {
      id: "mobbin",
      label: "Mobbin · recap screens · dropping",
      tokens: 4800,
      dot: "dropping",
      enabled: false,
      dropping: true,
    },
  ] satisfies ContextChipData[],
  instruction:
    "Synthesize {insights} and {interviews} into one problem statement. Hold it against {H2}. Quote people directly. Use {pins} only for tone.",
  history: {
    bookmarks: 3,
    branches: 2,
  },
  timeline: {
    segments: [
      { phase: "understand", start: 0, end: 0.34 },
      { phase: "define", start: 0.34, end: 0.62 },
      { phase: "build", start: 0.62, end: 0.76 },
      { phase: "validate", start: 0.76, end: 0.88 },
      { phase: "share", start: 0.88, end: 1 },
    ],
    ticks: Array.from({ length: 22 }, (_, i) => (32.92 + i * 48.457) / 1696),
    bookmarks: [
      { label: "Interviews synthesized", at: 0.18 },
      { label: "Swapped H1 → H2", at: 0.41 },
      { label: "Problem statement v3 locked", at: 0.58 },
    ],
    branches: [{ label: "H1 branch · retired", from: 0.37, to: 0.46, retired: true }],
    playhead: { at: 0.55, time: "11:42" },
  } satisfies TimelineData,
};
