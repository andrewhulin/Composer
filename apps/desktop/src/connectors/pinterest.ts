import { ulid, type ContextItem } from "@composer/core";
import { http } from "./http";
import type { Connector } from "./types";

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** The text of the first `<name>` element in an XML fragment, CDATA unwrapped. */
function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  if (!m) return "";
  const raw = m[1]!.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? cdata[1]! : decode(raw);
}

/**
 * Pins from a board's public RSS feed: title, link, and the pin image from the description HTML.
 * Feeds vary, so items are read by tag rather than through an XML parser.
 */
export function parsePinterestRss(xml: string): { title: string; items: ContextItem[] } {
  const head = xml.split(/<item\b/)[0] ?? "";
  const title = tag(head, "title") || "Pinterest board";
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map((m) => {
    const body = m[1]!;
    const html = new DOMParser().parseFromString(tag(body, "description"), "text/html");
    const image = html.querySelector("img")?.getAttribute("src") ?? undefined;
    const text = html.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const pinTitle = tag(body, "title") || text.slice(0, 60) || "Pin";
    const link = tag(body, "link");
    return {
      id: ulid(),
      kind: "pin",
      title: pinTitle,
      units: [{ text: text || pinTitle }],
      ...(link ? { url: link } : {}),
      ...(image ? { image } : {}),
    } satisfies ContextItem;
  });
  return { title, items };
}

export const pinterest: Connector = {
  platform: "pinterest",
  label: "Pinterest",
  tokenRequired: false,
  tokenHelp: "Public boards need nothing: Composer reads the board's RSS feed",
  match(url) {
    if (!/(^|\.)pinterest\.[a-z.]+$/.test(url.hostname)) return;
    const [user, board] = url.pathname.split("/").filter(Boolean);
    return user && board && user !== "pin" ? { user, board } : undefined;
  },
  async fetch(config) {
    const res = await http(`https://www.pinterest.com/${config.user}/${config.board}.rss`);
    if (!res.ok) throw new Error(`Pinterest answered ${res.status}. Is the board public?`);
    const { title, items } = parsePinterestRss(await res.text());
    return { title: `Pinterest · ${title}`, content: { v: 1, kind: "context", items, syncedAt: new Date().toISOString() }, config };
  },
};
