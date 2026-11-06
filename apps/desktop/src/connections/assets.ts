import type { IntegrationId } from "./registry";

/** Rive contract for a connector's guide (assets/connectors/README.md). */
export const RIVE_STATE_MACHINE = "Guide";
export const RIVE_STEP_INPUT = "step";

export interface GuideAssets {
  /** assets/connectors/<id>/guide.riv */
  riv?: string;
  /** assets/connectors/<id>/step-<n>.{gif,webp,png,mp4}, by 1-based step. */
  steps: Record<number, { url: string; kind: "image" | "video" }>;
}

/**
 * Sorts dropped-in files by connector: one .riv drives every step; otherwise a GIF, image or
 * MP4 per step; anything missing falls back to the coded guide. Paths are Vite glob keys.
 */
export function sortAssets(files: Record<string, string>): Partial<Record<IntegrationId, GuideAssets>> {
  const out: Partial<Record<IntegrationId, GuideAssets>> = {};
  for (const [path, url] of Object.entries(files)) {
    const m = /connectors\/([a-z]+)\/(guide\.riv|step-(\d+)\.(gif|webp|png|mp4))$/.exec(path);
    if (!m) continue;
    const entry = (out[m[1] as IntegrationId] ??= { steps: {} });
    if (m[2] === "guide.riv") entry.riv = url;
    else entry.steps[Number(m[3])] = { url, kind: m[4] === "mp4" ? "video" : "image" };
  }
  return out;
}

const FILES = import.meta.glob("../assets/connectors/*/*.{riv,gif,webp,png,mp4}", { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** What's been dropped into assets/connectors for each connector, found at build time. */
export const GUIDE_ASSETS = sortAssets(FILES);
