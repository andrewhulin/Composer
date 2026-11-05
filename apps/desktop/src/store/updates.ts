import { useStore } from "zustand";
import { createUpdates, type UpdatesSnapshot } from "../app/updates";
import { platformUpdater } from "../platform/updater";
import { toast, useProject } from "./project";
import { useCraft } from "./craft";
import { useShare } from "../share/story";

const HOUR = 60 * 60 * 1000;
const OUTLAST_SAVE_DEBOUNCE_MS = 400;

const RESTART_WAITS_FOR: { label: string; active: () => boolean; subscribe: (cb: () => void) => () => void }[] = [
  { label: "the Claude run", active: () => Object.values(useProject.getState().live).some((r) => r.status === "running"), subscribe: useProject.subscribe },
  { label: "Reflect", active: () => useCraft.getState().reflecting, subscribe: useCraft.subscribe },
  { label: "the video render", active: () => Object.values(useShare.getState().renders).some((r) => r.running), subscribe: useShare.subscribe },
];

export const updates = createUpdates({
  updater: platformUpdater(),
  busy: () => RESTART_WAITS_FOR.find((b) => b.active())?.label ?? null,
  watchBusy: (changed) => {
    const offs = RESTART_WAITS_FOR.map((b) => b.subscribe(changed));
    return () => offs.forEach((off) => off());
  },
  beforeRestart: async () => {
    const { repo, project, graph } = useProject.getState();
    if (repo && project) await repo.saveWorking(project.id, graph);
    await new Promise((done) => setTimeout(done, OUTLAST_SAVE_DEBOUNCE_MS));
  },
  notify: toast,
});

/** Checks quietly a few seconds after launch, then every four hours. Dev builds only check when asked. */
export function startUpdateChecks(): () => void {
  if (import.meta.env.DEV && !new URLSearchParams(location.search).has("update")) return () => {};
  return updates.start(5000, 4 * HOUR);
}

export function useUpdates<T>(select: (s: UpdatesSnapshot) => T): T {
  return useStore(updates.store, select);
}

/** The ⌘K entry: check, or restart into an update that's already found. */
export function updateCommand(): { label: string; hint: string; run: () => void } {
  const s = updates.store.getState().state;
  if (s.status === "available" || s.status === "failed") return { label: `Restart to update to v${s.version}`, hint: "download, install and relaunch", run: () => void updates.restart() };
  return { label: "Check for updates", hint: "install the latest Design Composer", run: () => void updates.check({ manual: true }) };
}
