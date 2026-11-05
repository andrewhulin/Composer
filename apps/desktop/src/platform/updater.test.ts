// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import tauriConf from "../../src-tauri/tauri.conf.json";
import { platformUpdater, type Updater } from "./updater";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

type PluginEvent = { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" };

const at = (path: string) => history.replaceState(null, "", path);

async function settled<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

async function progressOf(updater: Updater): Promise<(number | null)[]> {
  const found = await settled(updater.check());
  const seen: (number | null)[] = [];
  await settled(found!.download((p) => seen.push(p)));
  return seen;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("in the browser preview", () => {
  it("has no updater unless an outcome is scripted", () => {
    at("/?fake");
    expect(platformUpdater()).toBeNull();
  });

  it("reports the version from the app config", async () => {
    at("/?update=0.1.1");
    expect(await platformUpdater()!.currentVersion()).toBe(tauriConf.version);
  });

  it("announces the scripted version and downloads it to completion", async () => {
    at("/?update=0.1.1");
    const updater = platformUpdater()!;
    expect((await settled(updater.check()))?.version).toBe("0.1.1");
    const progress = await progressOf(updater);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort());
  });

  it("finds nothing with update=latest", async () => {
    at("/?update=latest");
    expect(await settled(platformUpdater()!.check())).toBeNull();
  });

  it("fails the check with update=error", async () => {
    at("/?update=error");
    const checking = platformUpdater()!.check();
    const failed = expect(checking).rejects.toThrow("Couldn't reach github.com");
    await vi.runAllTimersAsync();
    await failed;
  });

  it("fails only the install with install=error", async () => {
    at("/?update=0.1.1&install=error");
    const found = (await settled(platformUpdater()!.check()))!;
    await settled(found.download(() => {}));
    const installing = found.install();
    const failed = expect(installing).rejects.toThrow("didn't match its signature");
    await vi.runAllTimersAsync();
    await failed;
  });

  it("relaunches by reloading without the scripted outcome", async () => {
    at("/?fake&update=0.1.1&install=error");
    const replace = vi.spyOn(location, "replace").mockImplementation(() => {});
    await platformUpdater()!.relaunch();
    const url = new URL(String(replace.mock.calls[0]![0]));
    expect([...url.searchParams.keys()]).toEqual(["fake"]);
  });
});

describe("in the app", () => {
  const announce = (events: PluginEvent[]) => {
    const install = vi.fn(async () => {});
    vi.mocked(check).mockResolvedValue({
      version: "0.1.1",
      download: async (onEvent: (e: PluginEvent) => void) => events.forEach(onEvent),
      install,
    } as never);
    return install;
  };

  beforeEach(() => {
    at("/");
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it("uses the Tauri updater even without a scripted outcome", async () => {
    vi.mocked(check).mockResolvedValue(null);
    const updater = platformUpdater()!;
    expect(await updater.check()).toBeNull();
    expect(await updater.currentVersion()).toBe("0.1.0");
  });

  it("reports download progress as a fraction of the announced size", async () => {
    announce([{ event: "Started", data: { contentLength: 100 } }, { event: "Progress", data: { chunkLength: 40 } }, { event: "Progress", data: { chunkLength: 60 } }, { event: "Finished" }]);
    expect(await progressOf(platformUpdater()!)).toEqual([0, 0.4, 1, 1]);
  });

  it("reports unknown progress when the size isn't announced", async () => {
    announce([{ event: "Started", data: {} }, { event: "Progress", data: { chunkLength: 40 } }, { event: "Finished" }]);
    expect(await progressOf(platformUpdater()!)).toEqual([null, null, 1]);
  });

  it("installs through the plugin and relaunches through the process plugin", async () => {
    const install = announce([{ event: "Finished" }]);
    const updater = platformUpdater()!;
    const found = await updater.check();
    await found!.install();
    await updater.relaunch();
    expect(install).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });
});
