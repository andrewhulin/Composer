import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import tauriConf from "../../src-tauri/tauri.conf.json";
import { inTauri } from "./env";

/** A newer release the update endpoint announced. */
export interface FoundUpdate {
  version: string;
  /** Downloads the signed bundle. `progress` gets 0–1, or null when the size is unknown. */
  download: (progress: (fraction: number | null) => void) => Promise<void>;
  /** Swaps the app bundle on disk. The running app keeps going until it relaunches. */
  install: () => Promise<void>;
}

/** Where updates come from: the Tauri updater in the app, a scripted fake in the browser preview. */
export interface Updater {
  currentVersion: () => Promise<string>;
  check: () => Promise<FoundUpdate | null>;
  relaunch: () => Promise<void>;
}

/**
 * The updater for this build, or null where nothing can update. In the browser preview,
 * `?update=0.1.1` scripts a found update; `?update=latest`, `error` and `&install=error` the rest.
 */
export function platformUpdater(): Updater | null {
  if (inTauri()) return tauriUpdater;
  if (import.meta.env.DEV) {
    const scripted = new URLSearchParams(location.search).get("update");
    if (scripted) return fakeUpdater(scripted);
  }
  return null;
}

const tauriUpdater: Updater = {
  currentVersion: getVersion,
  check: async () => {
    const update = await check({ timeout: 30_000 });
    if (!update) return null;
    return {
      version: update.version,
      download: async (progress) => {
        let total: number | undefined;
        let got = 0;
        await update.download((e) => {
          if (e.event === "Started") total = e.data.contentLength;
          if (e.event === "Progress") got += e.data.chunkLength;
          progress(e.event === "Finished" ? 1 : total ? Math.min(1, got / total) : null);
        });
      },
      install: () => update.install(),
    };
  },
  relaunch,
};

function fakeUpdater(scripted: string): Updater {
  const params = new URLSearchParams(location.search);
  const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
  return {
    currentVersion: async () => tauriConf.version,
    check: async () => {
      await wait(700);
      if (scripted === "error") throw new Error("Couldn't reach github.com (preview)");
      if (scripted === "latest") return null;
      return {
        version: scripted,
        download: async (progress) => {
          for (let i = 0; i <= 10; i++) {
            progress(i / 10);
            await wait(150);
          }
        },
        install: async () => {
          await wait(300);
          if (params.get("install") === "error") throw new Error("The downloaded update didn't match its signature (preview)");
        },
      };
    },
    relaunch: async () => {
      const url = new URL(location.href);
      url.searchParams.delete("update");
      url.searchParams.delete("install");
      location.replace(url);
    },
  };
}
