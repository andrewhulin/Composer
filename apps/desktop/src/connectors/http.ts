import { inTauri } from "../platform/env";

/** fetch through Tauri's HTTP plugin (no CORS) in the app; plain fetch in the browser preview. */
export async function http(url: string, init: RequestInit = {}): Promise<Response> {
  if (inTauri()) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(url, init);
  }
  return fetch(url, init);
}

export async function httpJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await http(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${new URL(url).hostname} answered ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Fetches an image and returns a downscaled JPEG data URL, so thumbnails survive expiring URLs. */
export async function imageDataUrl(url: string, max = 768): Promise<string | undefined> {
  try {
    const res = await http(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  }
}
