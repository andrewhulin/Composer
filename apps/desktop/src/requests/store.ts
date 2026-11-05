import { create } from "zustand";
import { PHASE_INFO, ulid } from "@composer/core";
import { recipe } from "@composer/engine";
import tauriConf from "../../src-tauri/tauri.conf.json";
import { useProject } from "../store/project";
import { getSecret, SECRET } from "../platform/secrets";
import { inTauri } from "../platform/env";
import { http } from "../connectors/http";
import { makeOutbox, type FlushResult } from "./outbox";
import { parseNotionId, type Area, type FeatureRequest, type Fetcher } from "./queue";

const OUTBOX = "request_outbox";
export const QUEUE_LINK = "notion_queue";
const SOURCE = "notion_queue_source";

interface RequestsState {
  /** Requests saved here that haven't reached Notion yet. */
  pending: number;
  /** A Notion token and a valid queue link are both set. */
  connected: boolean;
}

export const useRequests = create<RequestsState>(() => ({ pending: 0, connected: false }));

const repo = () => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Composer is still starting.");
  return r;
};

/** The preview has no Tauri, and Notion blocks browser requests; `?notion=ok|error` scripts the answer. */
function notionFetcher(): Fetcher {
  const scripted = import.meta.env.DEV && !inTauri() ? new URLSearchParams(location.search).get("notion") : null;
  if (!scripted) return http;
  let n = 40;
  return async (url) => {
    await new Promise((done) => setTimeout(done, 600));
    if (scripted === "error") return Response.json({ code: "object_not_found", message: "Could not find database" }, { status: 404 });
    if (url.includes("/databases/")) return Response.json({ data_sources: [{ id: "preview-source" }] });
    n += 1;
    return Response.json({ url: "https://www.notion.so/preview", properties: { ID: { type: "unique_id", unique_id: { number: n } } } });
  };
}

const outbox = makeOutbox({
  load: async () => (await repo().getSetting<FeatureRequest[]>(OUTBOX)) ?? [],
  save: (list) => repo().setSetting(OUTBOX, list),
  token: () => getSecret(SECRET.notion),
  queueLink: () => repo().getSetting<string>(QUEUE_LINK),
  cachedSource: () => repo().getSetting<{ databaseId: string; dataSourceId: string }>(SOURCE),
  cacheSource: (source) => repo().setSetting(SOURCE, source),
  fetcher: notionFetcher(),
});

/** Re-reads whether Notion is set up and how many requests are waiting. */
export async function refreshRequests(): Promise<void> {
  const [token, link, pending] = await Promise.all([getSecret(SECRET.notion), repo().getSetting<string>(QUEUE_LINK), outbox.pending()]);
  useRequests.setState({ pending, connected: !!token && !!parseNotionId(link ?? "") });
}

async function after(result: Promise<FlushResult>): Promise<FlushResult> {
  const r = await result;
  await refreshRequests();
  return r;
}

/** Sends anything still waiting. Runs at launch and whenever the Notion settings change. */
export function flushRequests(): Promise<FlushResult> {
  return after(outbox.flush());
}

export function submitRequest(input: { title: string; why: string; areas: Area[]; context?: string }): Promise<FlushResult & { id: string }> {
  const request: FeatureRequest = { ...input, id: ulid(), createdAt: new Date().toISOString() };
  return after(outbox.submit(request)).then((r) => ({ ...r, id: request.id }));
}

/** Where the request comes from: the phase and the kind of step selected, never the project's content. */
export function describeContext(): string {
  const { activePhase, loop, selection, graph } = useProject.getState();
  const node = selection ? graph.nodes[selection] : undefined;
  const selected = !node
    ? undefined
    : node.kind === "claude"
      ? `${recipe(node.recipe).title} step`
      : node.kind === "source"
        ? `${node.platform} source`
        : node.kind === "hypothesis"
          ? "a hypothesis"
          : node.mode === "inlet"
            ? "an inlet"
            : "the phase output";
  return [`${PHASE_INFO[activePhase].name}, loop ${loop}`, selected && `selected: ${selected}`, `Composer ${tauriConf.version}`].filter(Boolean).join(" · ");
}
