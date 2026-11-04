import { ulid, type ContextItem, type ItemKind, type SourceContent, type SourcePlatform } from "@composer/core";
import { splitUnits } from "@composer/engine";
import { inTauri } from "../platform/env";

export interface Ingested {
  title: string;
  platform: SourcePlatform;
  content: SourceContent;
  /** Connector settings, so the source can be synced again. */
  config?: Record<string, string>;
}

const SPEAKER_LINE = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?[A-Z][\w .'-]{0,30}:\s+\S/;

function looksLikeTranscript(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.length >= 3 && lines.filter((l) => SPEAKER_LINE.test(l)).length / lines.length > 0.5;
}

function content(items: ContextItem[]): SourceContent {
  return { v: 1, kind: "context", items, syncedAt: new Date().toISOString() };
}

function item(kind: ItemKind, title: string, text: string, extra: Partial<ContextItem> = {}): ContextItem {
  return { id: ulid(), kind, title, units: splitUnits(text, kind), ...extra };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Interviews · P04, P07, P11" from the speakers in a transcript (interviewers left out). */
export function transcriptTitle(text: string): string {
  const speakers = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-Z][\w .'-]{0,30}):\s+\S/.exec(line);
    if (m && !/^(interviewer|moderator|facilitator|me|q)$/i.test(m[1]!.trim())) speakers.add(m[1]!.trim());
  }
  const list = [...speakers].slice(0, 4).join(", ");
  return list ? `Interviews · ${list}${speakers.size > 4 ? "…" : ""}` : "Interview transcript";
}

/** Pasted or typed text: a quote, a transcript, or a note. */
export function ingestText(text: string, title?: string): Ingested {
  const t = text.trim();
  if (looksLikeTranscript(t)) {
    const name = title ?? transcriptTitle(t);
    return { title: name, platform: "transcript", content: content([item("transcript", name, t)]) };
  }
  if (t.length <= 280 && !t.includes("\n\n")) {
    const name = title ?? `“${clip(t.replace(/^["“]|["”]$/g, ""), 60)}”`;
    return { title: name, platform: "paste", content: content([item("quote", name, t)]) };
  }
  const name = title ?? clip(t.split("\n")[0]!.replace(/^#+\s*/, ""), 60);
  return { title: name, platform: "paste", content: content([item("note", name, t)]) };
}

/** WebVTT / SRT → "Speaker: line" transcript text. */
export function subtitlesToText(raw: string): string {
  return raw
    .replace(/^WEBVTT.*$/m, "")
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
        .join(" ")
        .replace(/<v ([^>]+)>/g, "$1: ")
        .replace(/<[^>]+>/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

async function downscale(file: File, max = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

/** A dropped file: images, transcripts, subtitles, markdown, text, JSON, CSV. */
export async function ingestFile(file: File): Promise<Ingested> {
  const name = file.name.replace(/\.[^.]+$/, "");
  if (file.type.startsWith("image/")) {
    const image = await downscale(file);
    return { title: name, platform: "image", content: content([item("image", name, `Image: ${file.name}`, { image })]) };
  }
  if (/\.pdf$/i.test(file.name)) throw new Error("PDFs aren't supported yet. Paste the text, or export it as .txt or .md.");
  const raw = await file.text();
  if (/\.(vtt|srt)$/i.test(file.name)) {
    return { title: name, platform: "transcript", content: content([item("transcript", name, subtitlesToText(raw))]) };
  }
  if (looksLikeTranscript(raw)) return { title: name, platform: "transcript", content: content([item("transcript", name, raw)]) };
  return { title: name, platform: "file", content: content([item("file", name, raw)]) };
}

const PLATFORM_BY_HOST: [RegExp, SourcePlatform][] = [
  [/(^|\.)mobbin\.com$/, "mobbin"],
  [/(^|\.)60fps\.design$/, "60fps"],
  [/(^|\.)are\.na$/, "arena"],
  [/(^|\.)pinterest\./, "pinterest"],
  [/(^|\.)linear\.app$/, "linear"],
  [/(^|\.)figma\.com$/, "figma"],
];

async function fetchText(url: string): Promise<string> {
  if (inTauri()) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) DesignComposer/0.1" } });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.text();
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

/**
 * A link. Links a connector understands (Linear issues, Figma frames, Are.na channels, Pinterest
 * boards, Slack threads) go through its API; anything else is fetched once as a web page.
 */
export async function ingestUrl(url: string): Promise<Ingested> {
  const { matchUrl, runConnector } = await import("../connectors");
  const matched = matchUrl(url);
  if (matched) {
    const r = await runConnector(matched.connector, matched.config);
    return { title: r.title, platform: matched.connector.platform, content: r.content, config: r.config };
  }
  return ingestPage(url);
}

async function ingestPage(url: string): Promise<Ingested> {
  const u = new URL(url);
  const platform = PLATFORM_BY_HOST.find(([re]) => re.test(u.hostname))?.[1] ?? "link";
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = (p: string) => doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute("content")?.trim();
  const title = meta("og:title") ?? doc.title?.trim() ?? u.hostname;
  const description = meta("og:description") ?? meta("description");
  const ogImage = meta("og:image");
  doc.querySelectorAll("script, style, nav, footer, header, noscript, svg, form, aside").forEach((n) => n.remove());
  const root = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const blocks = [...(root?.querySelectorAll("h1, h2, h3, p, li, blockquote") ?? [])]
    .map((n) => n.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((t) => t.length > 30)
    .slice(0, 300);
  const text = [description, ...blocks].filter(Boolean).join("\n\n") || title;
  const image = ogImage ? new URL(ogImage, url).toString() : undefined;
  return {
    title: clip(title, 80),
    platform,
    content: content([item("link", title, text, { url, ...(image ? { image } : {}) })]),
    config: { url },
  };
}

export function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}
