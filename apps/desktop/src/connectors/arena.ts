import { ulid, type ContextItem } from "@composer/core";
import { splitUnits } from "@composer/engine";
import { httpJson } from "./http";
import { SECRET } from "../platform/secrets";
import type { Connector } from "./types";

export interface ArenaBlock {
  id: number;
  class: "Image" | "Text" | "Link" | "Media" | "Attachment" | "Channel";
  title?: string | null;
  generated_title?: string | null;
  content?: string | null;
  description?: string | null;
  source?: { url?: string | null } | null;
  image?: { display?: { url?: string | null } | null; thumb?: { url?: string | null } | null } | null;
}

/** Are.na blocks: images become pins, text becomes notes, links keep their source. */
export function parseArenaBlocks(blocks: ArenaBlock[]): ContextItem[] {
  return blocks
    .filter((b) => b.class !== "Channel")
    .map((b) => {
      const title = b.title || b.generated_title || (b.class === "Text" ? (b.content ?? "").slice(0, 60) : b.class);
      const text = [b.content, b.description].filter(Boolean).join("\n\n") || title;
      const image = b.image?.display?.url ?? b.image?.thumb?.url ?? undefined;
      return {
        id: ulid(),
        kind: b.class === "Image" ? "pin" : b.class === "Link" ? "link" : "note",
        title,
        units: splitUnits(text, "note"),
        ...(b.source?.url ? { url: b.source.url } : {}),
        ...(image ? { image } : {}),
      } satisfies ContextItem;
    });
}

export const arena: Connector = {
  platform: "arena",
  label: "Are.na",
  secret: SECRET.arena,
  tokenRequired: false,
  tokenHelp: "Optional, for private channels: dev.are.na → personal access token",
  match(url) {
    if (!/(^|\.)are\.na$/.test(url.hostname)) return;
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = parts.length >= 2 ? parts[parts.length - 1] : undefined;
    return slug && parts[0] !== "block" ? { channel: slug } : undefined;
  },
  async fetch(config, token) {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const channel = await httpJson<{ title: string; contents: ArenaBlock[] }>(`https://api.are.na/v2/channels/${config.channel}?per=100`, { headers });
    return {
      title: `Are.na · ${channel.title}`,
      content: { v: 1, kind: "context", items: parseArenaBlocks(channel.contents), syncedAt: new Date().toISOString() },
      config,
    };
  },
};
