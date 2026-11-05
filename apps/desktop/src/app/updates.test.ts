import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdates, type UpdateDeps } from "./updates";
import type { FoundUpdate, Updater } from "../platform/updater";

function harness(opts: { found?: string | null; checkError?: string; downloadError?: string; installError?: string; relaunchError?: string } = {}) {
  const log: string[] = [];
  const notes: { text: string; tone: string }[] = [];
  let busy: string | null = null;
  const watchers = new Set<() => void>();
  const failNext = { download: opts.downloadError, install: opts.installError, relaunch: opts.relaunchError };
  const hooks: { onSave?: () => void } = {};
  const update = (version: string): FoundUpdate => ({
    version,
    download: async (progress) => {
      log.push("download");
      progress(0.5);
      if (failNext.download) throw new Error(failNext.download);
      progress(1);
    },
    install: async () => {
      log.push("install");
      if (failNext.install) throw new Error(failNext.install);
    },
  });
  const updater: Updater = {
    currentVersion: async () => "0.1.0",
    check: async () => {
      log.push("check");
      if (opts.checkError) throw new Error(opts.checkError);
      return opts.found ? update(opts.found) : null;
    },
    relaunch: async () => {
      log.push("relaunch");
      if (failNext.relaunch) throw new Error(failNext.relaunch);
    },
  };
  const deps: UpdateDeps = {
    updater,
    busy: () => busy,
    watchBusy: (changed) => {
      watchers.add(changed);
      return () => watchers.delete(changed);
    },
    beforeRestart: async () => {
      log.push("save");
      hooks.onSave?.();
    },
    notify: (text, tone) => void notes.push({ text, tone }),
  };
  const updates = createUpdates(deps);
  return {
    updates,
    log,
    notes,
    failNext,
    hooks,
    state: () => updates.store.getState().state,
    setBusy: async (reason: string | null) => {
      busy = reason;
      for (const w of [...watchers]) w();
      await settle();
    },
  };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe("checking", () => {
  it("reports the running version", async () => {
    const h = harness();
    await settle();
    expect(h.updates.store.getState().current).toBe("0.1.0");
  });

  it("stays silent on a quiet check that finds nothing or fails", async () => {
    const none = harness();
    await none.updates.check({ manual: false });
    expect(none.state()).toEqual({ status: "current" });
    const broken = harness({ checkError: "offline" });
    await broken.updates.check({ manual: false });
    expect(broken.state()).toEqual({ status: "error", message: "offline" });
    expect([...none.notes, ...broken.notes]).toEqual([]);
  });

  it("says what a manual check found", async () => {
    const none = harness();
    await none.updates.check({ manual: true });
    expect(none.notes).toEqual([{ text: "Design Composer is up to date · v0.1.0", tone: "success" }]);
    const broken = harness({ checkError: "offline" });
    await broken.updates.check({ manual: true });
    expect(broken.notes).toEqual([{ text: "Couldn't check for updates · offline", tone: "error" }]);
    const found = harness({ found: "0.1.1" });
    await found.updates.check({ manual: true });
    expect(found.state()).toEqual({ status: "available", version: "0.1.1" });
    expect(found.notes[0]?.tone).toBe("success");
  });

  it("records when it last checked", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z") });
    const h = harness();
    expect(h.updates.store.getState().checkedAt).toBeNull();
    await h.updates.check({ manual: false });
    expect(h.updates.store.getState().checkedAt).toBe(Date.parse("2026-11-05T12:00:00Z"));
  });

  it("ignores a second check while one is running", async () => {
    const h = harness({ found: "0.1.1" });
    await Promise.all([h.updates.check({ manual: false }), h.updates.check({ manual: true })]);
    expect(h.log).toEqual(["check"]);
    expect(h.state()).toEqual({ status: "available", version: "0.1.1" });
  });

  it("checks after the launch delay, then on every interval", async () => {
    vi.useFakeTimers();
    const h = harness();
    const stop = h.updates.start(5000, 60_000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(h.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.log).toEqual(["check"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.log).toEqual(["check", "check", "check"]);
    stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.log).toHaveLength(3);
  });

  it("doesn't check again once an update is found", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    await h.updates.check({ manual: false });
    await h.updates.check({ manual: true });
    expect(h.log).toEqual(["check"]);
    expect(h.notes).toEqual([{ text: "v0.1.1 is ready. Restart from the title bar to update.", tone: "info" }]);
  });
});

describe("restarting", () => {
  it("downloads, saves, installs and relaunches in that order", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "save", "install", "relaunch"]);
    expect(h.state()).toEqual({ status: "restarting", version: "0.1.1" });
  });

  it("downloads once when Restart is clicked twice", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    await Promise.all([h.updates.restart(), h.updates.restart()]);
    expect(h.log).toEqual(["check", "download", "save", "install", "relaunch"]);
  });

  it("retries a failed relaunch without installing again", async () => {
    const h = harness({ found: "0.1.1", relaunchError: "couldn't spawn" });
    await h.updates.check({ manual: false });
    await h.updates.restart();
    expect(h.state()).toEqual({ status: "failed", version: "0.1.1", message: "couldn't spawn" });
    h.failNext.relaunch = undefined;
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "save", "install", "relaunch", "save", "relaunch"]);
  });

  it("does nothing before an update is found", async () => {
    const h = harness();
    await h.updates.check({ manual: false });
    await h.updates.restart();
    expect(h.log).toEqual(["check"]);
  });

  it("waits for a running Claude call before installing", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    await h.setBusy("the Claude run");
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download"]);
    expect(h.state()).toEqual({ status: "waiting", version: "0.1.1", reason: "the Claude run" });
    expect(h.notes.at(-1)?.text).toBe("Composer will restart for v0.1.1 when the Claude run finishes.");
    await h.setBusy("Reflect");
    expect(h.log).toEqual(["check", "download"]);
    await h.setBusy(null);
    await vi.waitFor(() => expect(h.log).toEqual(["check", "download", "save", "install", "relaunch"]));
  });

  it("goes back to waiting if a run starts while it saves", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    h.hooks.onSave = () => void h.setBusy("the Claude run");
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "save"]);
    expect(h.state().status).toBe("waiting");
    h.hooks.onSave = undefined;
    await h.setBusy(null);
    await vi.waitFor(() => expect(h.log.slice(-2)).toEqual(["install", "relaunch"]));
  });

  it("keeps the download when waiting is cancelled", async () => {
    const h = harness({ found: "0.1.1" });
    await h.updates.check({ manual: false });
    await h.setBusy("the Claude run");
    await h.updates.restart();
    h.updates.cancelRestart();
    expect(h.state()).toEqual({ status: "available", version: "0.1.1" });
    await h.setBusy(null);
    expect(h.log).toEqual(["check", "download"]);
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "save", "install", "relaunch"]);
  });

  it("reports a failed download and retries it", async () => {
    const h = harness({ found: "0.1.1", downloadError: "connection reset" });
    await h.updates.check({ manual: false });
    await h.updates.restart();
    expect(h.state()).toEqual({ status: "failed", version: "0.1.1", message: "connection reset" });
    expect(h.notes.at(-1)).toEqual({ text: "Couldn't update to v0.1.1 · connection reset", tone: "error" });
    h.failNext.download = undefined;
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "download", "save", "install", "relaunch"]);
  });

  it("retries a failed install without downloading again", async () => {
    const h = harness({ found: "0.1.1", installError: "bad signature" });
    await h.updates.check({ manual: false });
    await h.updates.restart();
    expect(h.state()).toEqual({ status: "failed", version: "0.1.1", message: "bad signature" });
    h.failNext.install = undefined;
    await h.updates.restart();
    expect(h.log).toEqual(["check", "download", "save", "install", "save", "install", "relaunch"]);
  });
});

describe("without an updater (the browser preview)", () => {
  const preview = () => createUpdates({ updater: null, busy: () => null, watchBusy: () => () => {}, beforeRestart: async () => {}, notify: (text, tone) => notes.push({ text, tone }) });
  const notes: { text: string; tone: string }[] = [];

  it("never checks on its own and explains a manual check", async () => {
    vi.useFakeTimers();
    const updates = preview();
    expect(updates.store.getState().state).toEqual({ status: "unsupported" });
    updates.start(0, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    await updates.check({ manual: true });
    await updates.restart();
    expect(updates.store.getState().state).toEqual({ status: "unsupported" });
    expect(notes).toEqual([{ text: "Updates install in the Mac app. The browser preview can't update itself.", tone: "info" }]);
  });
});
