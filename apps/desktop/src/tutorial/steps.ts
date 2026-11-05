import type { Phase } from "@composer/core";

/** What the guide can see of the app. Every step's "done" is a pure read of this. */
export interface TutorialContext {
  hasKey: boolean;
  connectorTokens: number;
  dsSlotted: boolean;
  philosophySlotted: boolean;
  projectRenamed: boolean;
  activePhase: Phase;
  understandSources: number;
  weighed: boolean;
  synthesized: boolean;
  scored: boolean;
  understandLocked: boolean;
  defineLocked: boolean;
}

export type StepId = "welcome" | "key" | "foundations" | "connect" | "name" | "context" | "weigh" | "run" | "score" | "lock" | "define" | "tour" | "done";
export type Part = "Set up" | "Your first loop" | "Finish";

export interface StepDef {
  id: StepId;
  part: Part;
  title: string;
  body: string;
  /** Optional steps say so and can be skipped without a second thought. */
  optional?: boolean;
  /** Steps without a check are read-and-continue. */
  done?: (c: TutorialContext) => boolean;
}

export const STEPS: StepDef[] = [
  {
    id: "welcome",
    part: "Set up",
    title: "Welcome to Design Composer",
    body: "Composer runs your design process as a graph, with Claude inside every node. Five phases: Understand, Define, Build, Validate and Share. Validate loops back to Understand until the idea holds; Share is the only way out.\n\nThis guide takes about ten minutes: a few minutes of setup, then your first real loop. It ticks steps off as you do them.",
  },
  {
    id: "key",
    part: "Set up",
    title: "Connect Claude",
    body: "Every Claude node runs on Claude Opus 5.5 with your Anthropic API key. Open Settings, paste the key and press Check connection. The key goes in your macOS Keychain, never in a file.",
    done: (c) => c.hasKey,
  },
  {
    id: "foundations",
    part: "Set up",
    title: "Slot your foundations",
    body: "Give Composer your design system and your design philosophy once, as markdown. They ride along in every prompt, and Composer proposes updates when your work keeps drifting from them. Skip this if you don't have them written down yet.",
    optional: true,
    done: (c) => c.dsSlotted || c.philosophySlotted,
  },
  {
    id: "connect",
    part: "Set up",
    title: "Connect your sources",
    body: "Paste a Linear, Figma, Are.na, Pinterest or Slack link on the canvas and Composer pulls it in. Linear, Figma, Slack and Statsig need a personal token: add the ones you use in Settings. Files, links and pasted text work without any.",
    optional: true,
    done: (c) => c.connectorTokens > 0,
  },
  {
    id: "name",
    part: "Your first loop",
    title: "Name the problem",
    body: "A project is one problem you're working on. Double-click its name in the title bar and give it a real one, like “Recap after a break”.",
    done: (c) => c.projectRenamed,
  },
  {
    id: "context",
    part: "Your first loop",
    title: "Bring in context",
    body: "Understand starts from what you already know. Drop interview transcripts, notes or screenshots on the canvas, paste a link, or paste text with ⌘V. No material handy? Use a sample interview.",
    done: (c) => c.understandSources > 0,
  },
  {
    id: "weigh",
    part: "Your first loop",
    title: "Weigh it",
    body: "Not everything matters equally. Select a source and press W to cycle Mute, Light, Normal and Heavy, or P to pin it. Heavier sources get more of Claude's attention; nothing is summarized away.",
    done: (c) => c.weighed,
  },
  {
    id: "run",
    part: "Your first loop",
    title: "Run Claude",
    body: "Select Synthesize insights and press ⌘↵, or Run node in the inspector. Claude reads your weighted context and streams the insights back, quoting people as they said it.",
    done: (c) => c.synthesized,
  },
  {
    id: "score",
    part: "Your first loop",
    title: "Score the run",
    body: "How close is this to what you'd ship? Score it 1 to 5 under the preview. Scores teach Composer: once a phase has enough of them, it drafts craft rules for you to approve.",
    done: (c) => c.scored,
  },
  {
    id: "lock",
    part: "Your first loop",
    title: "Lock it",
    body: "Locking turns this output into the input for the next phase. Every phase ends in one key node, pinned top right: its prompt preview shows exactly what the next phase will read. Press Lock there, or select the output and press ⌘L. Define lays itself out from it.",
    done: (c) => c.understandLocked,
  },
  {
    id: "define",
    part: "Your first loop",
    title: "Draft a testable statement",
    body: "Define is a writing workspace, not a graph. Press Draft with Claude, cite evidence from the rail on the left, and shape the three lines: we believe, for whom, we'll know when. Try a variant beside it, then lock the one you'd defend.",
    done: (c) => c.defineLocked,
  },
  {
    id: "tour",
    part: "Finish",
    title: "The rest of the loop",
    body: "Build starts as three variants side by side: fork the one you like into the next round, tweak spacing, color and copy without a rerun, and pin notes on the screen for the next run. Validate is a scorecard: metrics with targets, a lane per source, then your verdict. A miss loops back to Understand with what you learned. Share renders a release video and opens the PR.\n\nPicks between variants and scores feed the improvement loop; a proposed rule replays past briefs side by side before you keep it. Every run is a snapshot down here. Play the process back, branch from any point, or compare two.",
  },
  {
    id: "done",
    part: "Finish",
    title: "You're set up",
    body: "Press ⌘K to find anything and ? for every shortcut. Reopen this guide any time from ⌘K → Tutorial.",
  },
];

export interface TutorialState {
  status: "active" | "paused" | "done";
  step: StepId;
  completed: StepId[];
  skipped: StepId[];
}

export const initialTutorial = (): TutorialState => ({ status: "active", step: "welcome", completed: [], skipped: [] });

const indexOf = (id: StepId) => STEPS.findIndex((s) => s.id === id);
export const stepDef = (id: StepId): StepDef => STEPS[indexOf(id)] ?? STEPS[0]!;

/** Moves past the current step, and past any later step that's already done, ticking those off. */
function moveOn(state: TutorialState, ctx: TutorialContext, mark: "completed" | "skipped"): TutorialState {
  const completed = new Set(state.completed);
  const skipped = new Set(state.skipped);
  if (mark === "completed") completed.add(state.step);
  else skipped.add(state.step);
  let i = indexOf(state.step) + 1;
  while (i < STEPS.length - 1) {
    const s = STEPS[i]!;
    if (!s.done || !s.done(ctx)) break;
    completed.add(s.id);
    skipped.delete(s.id);
    i++;
  }
  const next = STEPS[Math.min(i, STEPS.length - 1)]!;
  return { ...state, step: next.id, completed: [...completed], skipped: [...skipped].filter((id) => !completed.has(id)) };
}

/** Called whenever the app changes: a step whose check now passes completes itself. */
export function evaluate(state: TutorialState, ctx: TutorialContext): TutorialState {
  // A step you went back to stays put until you press Next.
  if (state.status !== "active" || state.completed.includes(state.step)) return state;
  const def = stepDef(state.step);
  return def.done?.(ctx) ? moveOn(state, ctx, "completed") : state;
}

/** "Next" on a read-and-continue step, or on one that's done. */
export function next(state: TutorialState, ctx: TutorialContext): TutorialState {
  const def = stepDef(state.step);
  if (def.id === "done") return { ...state, status: "done", completed: [...new Set([...state.completed, "done" as const])] };
  if (def.done && !def.done(ctx)) return state;
  return moveOn(state, ctx, "completed");
}

export function skip(state: TutorialState, ctx: TutorialContext): TutorialState {
  return stepDef(state.step).id === "done" ? next(state, ctx) : moveOn(state, ctx, "skipped");
}

export function back(state: TutorialState): TutorialState {
  const i = indexOf(state.step);
  return i > 0 ? { ...state, step: STEPS[i - 1]!.id } : state;
}

/** Where the guide is, for "Set up · 2 of 4". */
export function progress(state: TutorialState): { part: Part; index: number; total: number; overall: number; overallTotal: number } {
  const def = stepDef(state.step);
  const inPart = STEPS.filter((s) => s.part === def.part);
  return { part: def.part, index: inPart.findIndex((s) => s.id === def.id) + 1, total: inPart.length, overall: indexOf(def.id) + 1, overallTotal: STEPS.length };
}
