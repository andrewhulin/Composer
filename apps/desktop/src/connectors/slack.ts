import { ulid, type ContextItem } from "@composer/core";
import { httpJson } from "./http";
import { SECRET } from "../platform/secrets";
import type { Connector } from "./types";

export interface SlackMessage {
  text: string;
  user?: string;
  user_profile?: { real_name?: string; display_name?: string };
  ts: string;
}

/** Slack permalinks carry the channel and the message timestamp: /archives/C123/p1700000000123456. */
export function parseSlackPermalink(url: URL): { channel: string; ts: string } | undefined {
  const m = /\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(url.pathname);
  if (!m) return;
  const thread = url.searchParams.get("thread_ts");
  return { channel: m[1]!, ts: thread ?? `${m[2]}.${m[3]}` };
}

/** A thread as one item: each reply a unit labelled with who said it. */
export function parseSlackThread(messages: SlackMessage[], url: string): ContextItem {
  const name = (m: SlackMessage) => m.user_profile?.display_name || m.user_profile?.real_name || m.user || "someone";
  return {
    id: ulid(),
    kind: "quote",
    title: messages[0]?.text.slice(0, 60) ?? "Slack thread",
    url,
    units: messages.filter((m) => m.text.trim()).map((m) => ({ text: m.text.replace(/<@[A-Z0-9]+>/g, "@someone").trim(), label: name(m) })),
  };
}

export const slack: Connector = {
  platform: "slack",
  label: "Slack",
  secret: SECRET.slack,
  tokenRequired: true,
  tokenHelp: "A Slack user token (xoxp-) with channels:history, groups:history, chat:write",
  match(url) {
    if (!/\.slack\.com$/.test(url.hostname)) return;
    return parseSlackPermalink(url);
  },
  async fetch(config, token) {
    if (!token) throw new Error("Add a Slack token in Settings (⌘,) to pull threads.");
    const res = await httpJson<{ ok: boolean; error?: string; messages?: SlackMessage[] }>(
      `https://slack.com/api/conversations.replies?channel=${config.channel}&ts=${config.ts}&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Slack: ${res.error ?? "request failed"}`);
    const item = parseSlackThread(res.messages ?? [], `https://slack.com/archives/${config.channel}/p${config.ts!.replace(".", "")}`);
    return { title: `Slack · ${item.title}`, content: { v: 1, kind: "context", items: [item], syncedAt: new Date().toISOString() }, config };
  },
};
