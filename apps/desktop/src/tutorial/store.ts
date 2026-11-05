import { create } from "zustand";
import { getSecret, SECRET } from "../platform/secrets";
import { useCraft } from "../store/craft";
import { useProject } from "../store/project";
import { useUi } from "../store/ui";
import { back, evaluate, initialTutorial, next, skip, type StepId, type TutorialContext, type TutorialState } from "./steps";

const DEFAULT_NAME = "Untitled problem";

interface Store {
  state: TutorialState | null;
  ctx: TutorialContext;
  /** The step that just completed itself, shown with a check for a moment before moving on. */
  justDone: StepId | null;
}

const blank: TutorialContext = { hasKey: false, connectorTokens: 0, dsSlotted: false, philosophySlotted: false, projectRenamed: false, activePhase: "understand", understandSources: 0, weighed: false, synthesized: false, scored: false, understandLocked: false, defineLocked: false };

export const useTutorial = create<Store>(() => ({ state: null, ctx: blank, justDone: null }));
const get = useTutorial.getState;
const set = useTutorial.setState;

let secrets = { hasKey: false, connectorTokens: 0 };

/** The guide's view of the app, read fresh from the stores. */
export function readContext(): TutorialContext {
  const p = useProject.getState();
  const c = useCraft.getState();
  const nodes = Object.values(p.graph.nodes).filter((n) => n.loop === p.loop);
  const sources = nodes.filter((n) => n.kind === "source" && n.phase === "understand");
  const lockedIn = (phase: string) => Object.values(p.versions).some((v) => v.phase === phase && v.loop === p.loop);
  return {
    ...secrets,
    dsSlotted: !!c.ds,
    philosophySlotted: !!c.philosophy,
    projectRenamed: !!p.project && p.project.name.trim() !== DEFAULT_NAME,
    activePhase: p.activePhase,
    understandSources: sources.length,
    weighed: sources.some((n) => n.kind === "source" && (n.weight !== "normal" || n.pinned)),
    synthesized: nodes.some((n) => n.kind === "claude" && n.phase === "understand" && p.lastRuns[n.id]?.status === "succeeded"),
    scored: c.scoredCount > 0,
    understandLocked: lockedIn("understand"),
    defineLocked: lockedIn("define"),
  };
}

async function refreshSecrets() {
  const [key, ...tokens] = await Promise.all([SECRET.anthropic, SECRET.linear, SECRET.figma, SECRET.slack, SECRET.statsig, SECRET.arena].map((k) => getSecret(k).catch(() => null)));
  secrets = { hasKey: !!key, connectorTokens: tokens.filter(Boolean).length };
  update();
}

function save(state: TutorialState) {
  void useProject.getState().repo?.setSetting("tutorial", state);
}

let doneTimer: ReturnType<typeof setTimeout> | undefined;

/** Re-reads the app and lets the current step complete itself, with a beat to show the check. */
function update() {
  const ctx = readContext();
  const { state, justDone } = get();
  set({ ctx });
  if (!state || state.status !== "active" || justDone) return;
  const after = evaluate(state, ctx);
  if (after === state) return;
  set({ justDone: state.step });
  clearTimeout(doneTimer);
  doneTimer = setTimeout(() => {
    set({ state: after, justDone: null });
    save(after);
    update();
  }, 900);
}

function apply(fn: (s: TutorialState, c: TutorialContext) => TutorialState) {
  const { state } = get();
  if (!state) return;
  clearTimeout(doneTimer);
  const after = fn(state, readContext());
  set({ state: after, justDone: null });
  save(after);
  update();
}

let started = false;
let poll: ReturnType<typeof setInterval> | undefined;

/** Loads saved progress. People who've never seen the guide get it on first launch. */
export async function initTutorial() {
  const saved = await useProject.getState().repo?.getSetting<TutorialState>("tutorial");
  set({ state: saved ?? initialTutorial() });
  if (!saved) save(get().state!);
  if (!started) {
    started = true;
    useProject.subscribe(update);
    useCraft.subscribe(update);
    // Keys are saved inside Settings; look again when it closes, and every so often while a key step is up.
    let settingsWasOpen = useUi.getState().settingsOpen;
    useUi.subscribe((ui) => {
      if (settingsWasOpen && !ui.settingsOpen) void refreshSecrets();
      settingsWasOpen = ui.settingsOpen;
    });
    poll = setInterval(() => {
      const s = get().state;
      if (s?.status === "active" && (s.step === "key" || s.step === "connect")) void refreshSecrets();
    }, 1500);
  }
  await refreshSecrets();
}

export const tutorial = {
  next: () => apply(next),
  skip: () => apply(skip),
  back: () => apply((s) => back(s)),
  pause: () => apply((s) => ({ ...s, status: "paused" })),
  resume: () => apply((s) => ({ ...s, status: "active" })),
  restart: () => apply(() => initialTutorial()),
  finish: () => apply((s) => ({ ...s, status: "done" })),
};

export const stopTutorialPolling = () => clearInterval(poll);
