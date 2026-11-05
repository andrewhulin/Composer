import type { Phase } from "@composer/core";

/** The Dev queue's areas: one per phase, plus the shell and evals. */
export const AREAS = ["Understand", "Define", "Build", "Validate", "Share", "App shell", "Evals"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_FOR_PHASE: Record<Phase, Area> = { understand: "Understand", define: "Define", build: "Build", validate: "Validate", share: "Share" };

/** A feature request on its way to the Dev queue. */
export interface FeatureRequest {
  id: string;
  title: string;
  why: string;
  areas: Area[];
  /** Where in the app it was sent from, when the sender chose to include that. */
  context?: string;
  createdAt: string;
}

/** Since this version, new rows hang off a database's data source rather than the database. */
export const NOTION_VERSION = "2025-09-03";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dashed = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();

/** The database id in a Notion link (`…/Dev-queue-<id>?v=…`) or a bare id, as a dashed UUID. */
export function parseNotionId(input: string): string | undefined {
  const raw = input.trim();
  if (UUID.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-f]{32}$/i.test(raw)) return dashed(raw);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (!/(^|\.)notion\.(so|site|com)$/.test(url.hostname)) return;
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const m = /(?:^|[^0-9a-f])([0-9a-f]{32})$/i.exec(last);
  return m ? dashed(m[1]!) : undefined;
}

/** Notion rich text, split into the 2,000-character runs the API accepts. */
export function richText(text: string): { type: "text"; text: { content: string } }[] {
  const runs: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length && runs.length < 100; i += 2000) runs.push({ type: "text", text: { content: text.slice(i, i + 2000) } });
  return runs;
}

/** The row a request becomes: Proposed and from the app, so nothing builds it until it's queued by hand. */
export function queueProperties(r: FeatureRequest) {
  const spec = [r.why.trim(), r.context ? `Sent from Composer · ${r.context}` : ""].filter(Boolean).join("\n\n");
  return {
    Request: { title: richText(r.title.trim()) },
    Spec: { rich_text: richText(spec) },
    Area: { multi_select: r.areas.map((name) => ({ name })) },
    Status: { status: { name: "Proposed" } },
    Source: { select: { name: "In-app" } },
  };
}

export interface QueueTarget {
  token: string;
  databaseId: string;
  /** Cached from an earlier send, so only the first one looks it up. */
  dataSourceId?: string;
}

export interface QueuedRow {
  url?: string;
  /** The row's ID number in the database, when it has one. */
  number?: number;
  dataSourceId: string;
}

/** Turns a Notion error into what to do about it. */
async function notionError(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (res.status === 401) return new Error("Notion didn't accept the token. Paste it again in Settings.");
  if (res.status === 404 || body.code === "object_not_found") return new Error("Notion can't see that database. Share it with your integration: ••• → Connections.");
  if (res.status === 429) return new Error("Notion is rate limiting. Try again in a minute.");
  return new Error(`Notion answered ${res.status}${body.message ? `: ${body.message}` : ""}`);
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" });

/** Adds one request to the queue, looking up the database's data source the first time. */
export async function createQueueRow(r: FeatureRequest, target: QueueTarget, fetcher: Fetcher): Promise<QueuedRow> {
  const send: Fetcher = (url, init) => fetcher(url, init).catch(() => Promise.reject(new Error("Couldn't reach Notion.")));
  let dataSourceId = target.dataSourceId;
  if (!dataSourceId) {
    const res = await send(`https://api.notion.com/v1/databases/${target.databaseId}`, { method: "GET", headers: headers(target.token) });
    if (!res.ok) throw await notionError(res);
    const db = (await res.json()) as { data_sources?: { id: string }[] };
    dataSourceId = db.data_sources?.[0]?.id;
    if (!dataSourceId) throw new Error("That Notion link isn't a database.");
  }
  const res = await send("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: headers(target.token),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties: queueProperties(r) }),
  });
  if (!res.ok) throw await notionError(res);
  const page = (await res.json()) as { url?: string; properties?: Record<string, { type?: string; unique_id?: { number?: number } }> };
  const id = Object.values(page.properties ?? {}).find((p) => p.type === "unique_id");
  return { url: page.url, number: id?.unique_id?.number, dataSourceId };
}
