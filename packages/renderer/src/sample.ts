import type { StoryProps } from "./story";

/** Studio and smoke-render props; the app always passes real ones. */
export const SAMPLE: StoryProps = {
  story: {
    title: "Recap after a session",
    logline: "A short recap so returning users pick up where they left off.",
    problem: { quote: "What changed since last time? I never know where we left off.", who: "P04 · returning user", context: "Returning users spend their first minutes rebuilding context." },
    process: { caption: "Two loops: the first recap was skimmed, the second was opened." },
    ui: {
      caption: "The recap waits at the top of the next session.",
      beats: [
        { part: "who", note: "Returning users see it on their second session" },
        { part: "behavior", note: "They open the recap before chatting" },
        { part: "metric", note: "Opens are tracked within 24 hours" },
      ],
    },
    proof: { caption: "Opens rose without shortening sessions.", metrics: [
        { label: "Recap opened within 24h", value: "+44%", target: "+40%", met: "yes", chart: { unit: "%", observed: 44, low: 31, high: 57, target: 40 } },
        { label: "Session length", value: "+1.2%", target: "no drop", met: "yes", chart: { unit: "%", observed: 1.2, low: -2.1, high: 4.5, target: 0 } },
      ],
    },
    voiceover: ["Returning users kept asking what changed since last time.", "We ran it twice: the first recap got skimmed, the second got opened.", "Now a short recap waits at the top of the next session.", "Opens rose forty-four percent, and sessions didn't get shorter."],

    motion: { transition: "fade", pacing: null },
  },
  process: {
    nodes: [
      { id: "1", kind: "source", phase: "understand", loop: 1, title: "Interviews", x: 72, y: 96, seq: 1 },
      { id: "2", kind: "claude", phase: "understand", loop: 1, title: "Synthesize insights", x: 600, y: 248, seq: 2 },
      { id: "3", kind: "output", phase: "understand", loop: 1, title: "Weighted context", x: 920, y: 264, seq: 3 },
      { id: "4", kind: "claude", phase: "define", loop: 1, title: "Draft statement", x: 600, y: 248, seq: 4 },
      { id: "5", kind: "hypothesis", phase: "define", loop: 1, title: "H1", x: 72, y: 420, seq: 5 },
      { id: "6", kind: "claude", phase: "build", loop: 1, title: "Prototype", x: 600, y: 248, seq: 6 },
      { id: "7", kind: "claude", phase: "validate", loop: 1, title: "Verdict", x: 920, y: 248, seq: 7 },
    ],
    edges: [{ from: "1", to: "2" }, { from: "2", to: "3" }, { from: "5", to: "4" }],
  },
  prototype: { html: "<!doctype html><body style='margin:0;font-family:system-ui;padding:48px 24px'><h1 data-part='who'>Welcome back</h1><div data-part='behavior' style='padding:16px;border-radius:12px;background:#f2efe8'>Last time: sleep, and the walk you planned.</div><p data-part='metric'>Open recap</p></body>" },
  project: { name: "Recap after a session", loops: 2 },
};
