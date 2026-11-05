import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "./env";

export interface RenderLine {
  stage: "voice" | "bundle" | "browser" | "mp4" | "gif" | "done" | "error";
  progress?: number;
  mp4?: string;
  gif?: string | null;
  poster?: string;
  message?: string;
}

const desktopOnly = () => new Error("Rendering and PRs need the desktop app (pnpm dev), not the browser preview.");

export async function rendererDefaultDir(): Promise<string | null> {
  return inTauri() ? invoke<string | null>("renderer_default_dir") : null;
}

/** Runs the Remotion render; `onLine` gets each progress line. Resolves with the last one. */
export async function renderStory(id: string, props: unknown, rendererDir: string, onLine: (l: RenderLine) => void): Promise<RenderLine> {
  if (!inTauri()) throw desktopOnly();
  const stop = await listen<{ id: string; line: string }>("story-progress", (e) => {
    if (e.payload.id !== id) return;
    try {
      onLine(JSON.parse(e.payload.line) as RenderLine);
    } catch {
      /* not a progress line */
    }
  });
  try {
    const last = JSON.parse(await invoke<string>("story_render", { id, props: JSON.stringify(props), rendererDir })) as RenderLine;
    if (last.stage === "error") throw new Error(last.message ?? "Render failed");
    return last;
  } finally {
    stop();
  }
}

export interface PrFile {
  name: string;
  from?: string;
  content?: string;
}

export async function openPr(args: { repo: string; branch: string; folder: string; title: string; body: string; files: PrFile[] }): Promise<string> {
  if (!inTauri()) throw desktopOnly();
  return invoke<string>("pr_open", args);
}

export async function revealPath(path: string): Promise<void> {
  if (inTauri()) await invoke("reveal_path", { path });
}

export async function openUrl(url: string): Promise<void> {
  if (inTauri()) await invoke("open_url", { url });
  else window.open(url, "_blank", "noopener");
}

export const fileUrl = (path: string): string => (inTauri() ? convertFileSrc(path) : path);

/** Reads a file to import (foundations). In the browser preview, use the file picker instead. */
export async function readTextFile(path: string): Promise<string> {
  if (!inTauri()) throw desktopOnly();
  return invoke<string>("read_text_file", { path });
}
