import { describe, expect, it } from "vitest";
import { back, evaluate, initialTutorial, next, progress, skip, STEPS, type TutorialContext } from "./steps";

const blank: TutorialContext = {
  hasKey: false,
  connectorTokens: 0,
  dsSlotted: false,
  philosophySlotted: false,
  projectRenamed: false,
  activePhase: "understand",
  understandSources: 0,
  weighed: false,
  synthesized: false,
  scored: false,
  understandLocked: false,
  defineLocked: false,
};

describe("tutorial", () => {
  it("covers setup, the first loop and the finish, with copy for every step", () => {
    expect(STEPS[0]!.id).toBe("welcome");
    expect(STEPS.at(-1)!.id).toBe("done");
    for (const s of STEPS) expect(s.body.length).toBeGreaterThan(40);
    expect(STEPS.filter((s) => s.optional).map((s) => s.id)).toEqual(["foundations", "connect"]);
  });

  it("waits on an action step until its check passes, then ticks itself off", () => {
    let s = next(initialTutorial(), blank);
    expect(s.step).toBe("key");
    expect(next(s, blank).step).toBe("key");
    expect(evaluate(s, blank)).toBe(s);
    s = evaluate(s, { ...blank, hasKey: true });
    expect(s.step).toBe("foundations");
    expect(s.completed).toEqual(["welcome", "key"]);
  });

  it("skips past steps that are already done, so returning people aren't asked twice", () => {
    const ready = { ...blank, hasKey: true, dsSlotted: true, projectRenamed: true };
    const s = next(initialTutorial(), ready);
    expect(s.step).toBe("connect");
    expect(s.completed).toEqual(["welcome", "key", "foundations"]);
    const after = skip(s, ready);
    expect(after.step).toBe("context");
    expect(after.skipped).toEqual(["connect"]);
    expect(after.completed).toContain("name");
  });

  it("goes back one step at a time, and finishes from the last", () => {
    let s = next(initialTutorial(), blank);
    expect(back(s).step).toBe("welcome");
    expect(back(initialTutorial()).step).toBe("welcome");
    s = { ...s, step: "tour" };
    s = next(s, blank);
    expect(s.step).toBe("done");
    expect(next(s, blank).status).toBe("done");
  });

  it("lets you go back to a finished step without bouncing forward again", () => {
    const done = { ...blank, hasKey: true };
    const s = evaluate(next(initialTutorial(), blank), done);
    const backAt = back(s);
    expect(backAt.step).toBe("key");
    expect(evaluate(backAt, done)).toBe(backAt);
    expect(next(backAt, done).step).toBe("foundations");
  });

  it("does nothing while paused", () => {
    const paused = { ...next(initialTutorial(), blank), status: "paused" as const };
    expect(evaluate(paused, { ...blank, hasKey: true })).toBe(paused);
  });

  it("reports progress within the part and overall", () => {
    expect(progress({ ...initialTutorial(), step: "weigh" })).toEqual({ part: "Your first loop", index: 3, total: 7, overall: 7, overallTotal: STEPS.length });
  });
});
