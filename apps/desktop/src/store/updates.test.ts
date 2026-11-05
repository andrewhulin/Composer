// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { tallyReplay } from "@composer/engine";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

async function freshAppAt(path: string) {
  vi.resetModules();
  history.replaceState(null, "", path);
  const updates = await import("./updates");
  const { useProject } = await import("./project");
  const { useCraft } = await import("./craft");
  const { useShare } = await import("../share/story");
  const { useEvals } = await import("./evals");
  const relaunched = vi.spyOn(location, "replace").mockImplementation(() => {});
  const status = () => updates.updates.store.getState().state;
  const toasts = () => useProject.getState().toasts.map((t) => t.text);
  return { ...updates, useProject, useCraft, useShare, useEvals, relaunched, status, toasts };
}

const running = { r1: { runId: "r1", status: "running" as const, text: "", thinking: "", startedAt: 0 } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("restarting into an update", () => {
  const busyWith: [string, (a: Awaited<ReturnType<typeof freshAppAt>>, on: boolean) => void][] = [
    ["the Claude run", (a, on) => a.useProject.setState({ live: on ? running : {} })],
    ["Reflect", (a, on) => a.useCraft.setState({ reflecting: on })],
    ["the replay", (a, on) => a.useEvals.setState({ byProposal: { p1: { rows: [], running: on, done: 0, total: 4, tally: tallyReplay([]) } } })],
    ["the video render", (a, on) => a.useShare.setState({ renders: { story: { line: null, running: on } } })],
  ];

  it.each(busyWith)("waits for %s to finish before relaunching", async (reason, busy) => {
    const a = await freshAppAt("/?fake&update=0.1.1");
    void a.updates.check({ manual: false });
    await vi.advanceTimersByTimeAsync(1000);
    busy(a, true);
    void a.updates.restart();
    await vi.advanceTimersByTimeAsync(2000);
    expect(a.status()).toEqual({ status: "waiting", version: "0.1.1", reason });
    expect(a.toasts()).toContain(`Composer will restart for v0.1.1 when ${reason} finishes.`);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.relaunched).not.toHaveBeenCalled();
    busy(a, false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(a.relaunched).toHaveBeenCalledOnce();
  });

  it("saves the working graph before relaunching", async () => {
    const a = await freshAppAt("/?fake&update=0.1.1");
    const saveWorking = vi.fn(async () => {});
    const graph = a.useProject.getState().graph;
    a.useProject.setState({ repo: { saveWorking } as never, project: { id: "p1" } as never });
    void a.updates.check({ manual: false });
    await vi.advanceTimersByTimeAsync(1000);
    void a.updates.restart();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saveWorking).toHaveBeenCalledWith("p1", graph);
    expect(saveWorking.mock.invocationCallOrder[0]).toBeLessThan(a.relaunched.mock.invocationCallOrder[0]!);
  });
});

describe("the ⌘K entry", () => {
  it("checks, and says so when Composer is up to date", async () => {
    const a = await freshAppAt("/?fake&update=latest");
    const command = a.updateCommand();
    expect(command.label).toBe("Check for updates");
    command.run();
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.toasts()).toContain("Design Composer is up to date · v0.1.0");
  });

  it("offers the restart once an update is found, and starts it", async () => {
    const a = await freshAppAt("/?fake&update=0.1.1");
    void a.updates.check({ manual: false });
    await vi.advanceTimersByTimeAsync(1000);
    const command = a.updateCommand();
    expect(command.label).toBe("Restart to update to v0.1.1");
    command.run();
    expect(a.status()).toMatchObject({ status: "downloading", version: "0.1.1" });
  });
});

describe("checking on launch", () => {
  it("checks five seconds after launch in a scripted preview", async () => {
    const a = await freshAppAt("/?fake&update=0.1.1");
    a.startUpdateChecks();
    await vi.advanceTimersByTimeAsync(4900);
    expect(a.status()).toEqual({ status: "idle" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.status()).toEqual({ status: "available", version: "0.1.1" });
  });

  it("leaves a development copy of the app alone until asked", async () => {
    Object.assign(window, { __TAURI_INTERNALS__: {} });
    const a = await freshAppAt("/");
    a.startUpdateChecks();
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(check).not.toHaveBeenCalled();
    a.updateCommand().run();
    await vi.advanceTimersByTimeAsync(0);
    expect(check).toHaveBeenCalledOnce();
  });
});
