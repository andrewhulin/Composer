import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { sha256 } from "@composer/core";
import type { TokenSet, UsedStyles } from "@composer/engine";
import { inTauri } from "../platform/env";
import { injectKit } from "./kit";

/**
 * Prototypes run in an iframe sandboxed to scripts only, on an opaque origin. In the app the
 * document is written under the data directory and served through the asset protocol; in the
 * browser preview it becomes a blob URL. Either way it can't reach Composer, the network or storage.
 */

const urls = new Map<string, string>();

export async function prototypeUrl(hash: string, html: string): Promise<string> {
  const doc = injectKit(html);
  const id = `${hash.slice(0, 16)}-${sha256(doc).slice(0, 16)}`;
  const hit = urls.get(id);
  if (hit) return hit;
  let url: string;
  if (inTauri()) {
    const path = await invoke<string>("prototype_write", { id, files: [{ path: "index.html", content: doc }] });
    url = convertFileSrc(path);
  } else {
    url = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
  }
  urls.set(id, url);
  return url;
}

// ---- talking to the runtime inside the frame ----

let seq = 0;

/** One request to the kit inside a prototype frame. Rejects after `ms` if the frame never answers. */
export function ask<T>(frame: HTMLIFrameElement, op: string, args: Record<string, unknown> = {}, ms = 4000): Promise<T> {
  const win = frame.contentWindow;
  if (!win) return Promise.reject(new Error("The prototype hasn't loaded yet."));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The prototype didn't answer. Open it again and retry."));
    }, ms);
    function onMessage(e: MessageEvent) {
      if (e.source !== win) return;
      const m = e.data as { composer?: string; id?: number; result?: T; error?: string };
      if (m?.composer !== "rt-reply" || m.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (m.error) reject(new Error(m.error));
      else resolve(m.result as T);
    }
    window.addEventListener("message", onMessage);
    win.postMessage({ composer: "rt", id, op, ...args }, "*");
  });
}

export type FrameEvent =
  | { kind: "ready"; screens: string[] }
  | { kind: "screen"; name: string }
  | { kind: "pick"; cid: string; label: string; leaf: boolean; text: string | null; styles: Record<string, string> }
  | { kind: "point"; x: number; y: number; screen: string | null; element: string };

/** Subscribes to events from one frame. Returns the unsubscribe. */
export function onFrameEvent(frame: () => HTMLIFrameElement | null, cb: (e: FrameEvent) => void): () => void {
  const listener = (e: MessageEvent) => {
    const f = frame();
    if (!f || e.source !== f.contentWindow) return;
    const m = e.data as { composer?: string } & FrameEvent;
    if (m?.composer === "rt-event") cb(m);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

export type FigmaNode = Record<string, unknown> & { type: "frame" | "text" | "image"; name: string };
export interface Serialized {
  tree: FigmaNode[];
  used: UsedStyles;
}

export const serialize = (frame: HTMLIFrameElement) => ask<Serialized>(frame, "serialize");
export const setMode = (frame: HTMLIFrameElement, mode: "interact" | "tweak" | "note") => ask<boolean>(frame, "mode", { mode });
export const applyTweak = (frame: HTMLIFrameElement, cid: string, prop: string, value: string) => ask<Record<string, string> | false>(frame, "apply", { cid, prop, value });
export const exportHtml = (frame: HTMLIFrameElement) => ask<string>(frame, "export");
export const goTo = (frame: HTMLIFrameElement, screen: string) => ask<boolean>(frame, "go", { screen });

/** The clipboard payload the Figma companion plugin builds frames from. */
export function figmaPayload(s: Serialized, tokens: TokenSet | null, title = "Prototype"): string {
  return JSON.stringify({ composer: "figma-frames", v: 1, title, tree: s.tree, tokens: tokens ?? undefined });
}
