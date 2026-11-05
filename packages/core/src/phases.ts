/** The five phases, in loop order. Understand → Validate loops; Share is the only exit. */
export const PHASES = ["understand", "define", "build", "validate", "share"] as const;
export type Phase = (typeof PHASES)[number];

export interface PhaseInfo {
  id: Phase;
  /** Two-digit index shown in mono, e.g. "02". */
  index: string;
  name: string;
  /** The single output this phase ships. */
  output: string;
  /** One-line purpose, from Figma 07 · Phases. */
  purpose: string;
}

export const PHASE_INFO: Record<Phase, PhaseInfo> = {
  understand: {
    id: "understand",
    index: "01",
    name: "Understand",
    output: "Weighted context",
    purpose: "Collect everything. Then weigh it.",
  },
  define: {
    id: "define",
    index: "02",
    name: "Define",
    output: "Testable statement",
    purpose: "Align on something testable.",
  },
  build: {
    id: "build",
    index: "03",
    name: "Build",
    output: "Prototype",
    purpose: "Reach a prototype, at any fidelity.",
  },
  validate: {
    id: "validate",
    index: "04",
    name: "Validate",
    output: "Verdict",
    purpose: "Craft the test strategy.",
  },
  share: {
    id: "share",
    index: "05",
    name: "Share",
    output: "Release story",
    purpose: "Leave Composer, loudly.",
  },
};

/**
 * How a phase is worked. Understand, Build and Share gather and combine many things, so they stay
 * node canvases. Define is one statement written well, and Validate is metrics against evidence,
 * so they get purpose-built workspaces over the same graph.
 */
export type PhaseSurface = "canvas" | "writing" | "scorecard";
export const PHASE_SURFACE: Record<Phase, PhaseSurface> = {
  understand: "canvas",
  define: "writing",
  build: "canvas",
  validate: "scorecard",
  share: "canvas",
};

export function phaseIndex(phase: Phase): number {
  return PHASES.indexOf(phase);
}

/** The phase before this one in the loop, or undefined for Understand. */
export function previousPhase(phase: Phase): Phase | undefined {
  return PHASES[phaseIndex(phase) - 1];
}

/** The phase after this one, or undefined for Share. */
export function nextPhase(phase: Phase): Phase | undefined {
  return PHASES[phaseIndex(phase) + 1];
}
