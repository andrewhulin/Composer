import { createStore, type StoreApi } from "zustand/vanilla";
import type { FoundUpdate, Updater } from "../platform/updater";

export type UpdateState =
  | { status: "unsupported" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "current" }
  | { status: "error"; message: string }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; progress: number | null }
  | { status: "waiting"; version: string; reason: string }
  | { status: "restarting"; version: string }
  | { status: "failed"; version: string; message: string };

export interface UpdatesSnapshot {
  /** The running version, once known. */
  current: string | null;
  checkedAt: number | null;
  state: UpdateState;
}

export interface UpdateDeps {
  updater: Updater | null;
  /** What's in flight that a restart would cut off ("a Claude run"), or null when it's safe. */
  busy: () => string | null;
  /** Calls back whenever anything `busy` reads changes. Returns an unsubscribe. */
  watchBusy: (changed: () => void) => () => void;
  /** Flushes pending saves before the app goes away. */
  beforeRestart: () => Promise<void>;
  notify: (text: string, tone: "info" | "error" | "success") => void;
}

export interface Updates {
  store: StoreApi<UpdatesSnapshot>;
  /** Checks quietly after `delayMs`, then every `everyMs`. Returns a stop function. */
  start: (delayMs: number, everyMs: number) => () => void;
  /** A quiet check stays silent; a manual one always says what it found. */
  check: (opts: { manual: boolean }) => Promise<void>;
  /** Downloads, installs and relaunches, waiting first for anything `busy` reports. */
  restart: () => Promise<void>;
  /** Stops waiting for a run to finish. The download is kept. */
  cancelRestart: () => void;
}

const PENDING = new Set<UpdateState["status"]>(["available", "downloading", "waiting", "restarting", "failed"]);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The update lifecycle: check, offer, download, wait for idle, install, relaunch. */
export function createUpdates(deps: UpdateDeps): Updates {
  const { updater } = deps;
  const store = createStore<UpdatesSnapshot>(() => ({ current: null, checkedAt: null, state: updater ? { status: "idle" } : { status: "unsupported" } }));
  const state = () => store.getState().state;
  const put = (next: UpdateState) => store.setState({ state: next });
  let found: FoundUpdate | null = null;
  let downloaded = false;
  let installed = false;
  let unwatch: (() => void) | null = null;

  void updater
    ?.currentVersion()
    .then((current) => store.setState({ current }))
    .catch(() => {});

  const check = async ({ manual }: { manual: boolean }) => {
    const s = state();
    if (!updater) {
      if (manual) deps.notify("Updates install in the Mac app. The browser preview can't update itself.", "info");
      return;
    }
    if (s.status === "checking") return;
    if (PENDING.has(s.status)) {
      if (manual && "version" in s) deps.notify(`v${s.version} is ready. Restart from the title bar to update.`, "info");
      return;
    }
    put({ status: "checking" });
    try {
      found = await updater.check();
      downloaded = installed = false;
      store.setState({ checkedAt: Date.now() });
      if (!found) {
        put({ status: "current" });
        const { current } = store.getState();
        if (manual) deps.notify(`Design Composer is up to date${current ? ` · v${current}` : ""}`, "success");
        return;
      }
      put({ status: "available", version: found.version });
      if (manual) deps.notify(`v${found.version} is ready. Restart from the title bar to update.`, "success");
    } catch (e) {
      put({ status: "error", message: message(e) });
      if (manual) deps.notify(`Couldn't check for updates · ${message(e)}`, "error");
    }
  };

  const fail = (version: string, e: unknown) => {
    put({ status: "failed", version, message: message(e) });
    deps.notify(`Couldn't update to v${version} · ${message(e)}`, "error");
  };

  // Installs and relaunches once nothing is running; otherwise waits for `busy` to clear.
  const finish = async (version: string): Promise<void> => {
    const reason = deps.busy();
    if (reason) {
      if (state().status !== "waiting") deps.notify(`Composer will restart for v${version} when ${reason} finishes.`, "info");
      put({ status: "waiting", version, reason });
      unwatch ??= deps.watchBusy(() => {
        if (state().status !== "waiting" || deps.busy()) return;
        unwatch?.();
        unwatch = null;
        void finish(version);
      });
      return;
    }
    put({ status: "restarting", version });
    try {
      await deps.beforeRestart();
      if (deps.busy()) return finish(version);
      if (!installed) await found!.install();
      installed = true;
      await updater!.relaunch();
    } catch (e) {
      fail(version, e);
    }
  };

  const restart = async () => {
    const s = state();
    if (!found || !(s.status === "available" || s.status === "failed")) return;
    const { version } = s;
    if (!downloaded) {
      put({ status: "downloading", version, progress: 0 });
      try {
        await found.download((progress) => put({ status: "downloading", version, progress }));
        downloaded = true;
      } catch (e) {
        return fail(version, e);
      }
    }
    await finish(version);
  };

  const cancelRestart = () => {
    const s = state();
    if (s.status !== "waiting") return;
    unwatch?.();
    unwatch = null;
    put({ status: "available", version: s.version });
  };

  const start = (delayMs: number, everyMs: number) => {
    if (!updater) return () => {};
    const quiet = () => void check({ manual: false });
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      quiet();
      every = setInterval(quiet, everyMs);
    }, delayMs);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  };

  return { store, start, check, restart, cancelRestart };
}
