import { createQueueRow, parseNotionId, type FeatureRequest, type Fetcher, type QueuedRow } from "./queue";

export interface OutboxDeps {
  load(): Promise<FeatureRequest[]>;
  save(list: FeatureRequest[]): Promise<void>;
  token(): Promise<string | null>;
  /** The Dev queue link as pasted in Settings. */
  queueLink(): Promise<string | undefined>;
  cachedSource(): Promise<{ databaseId: string; dataSourceId: string } | undefined>;
  cacheSource(source: { databaseId: string; dataSourceId: string }): Promise<void>;
  fetcher: Fetcher;
}

export interface FlushResult {
  sent: (QueuedRow & { id: string })[];
  /** Requests still waiting here. */
  pending: number;
  /** No token or no queue link yet, so nothing was tried. */
  notConnected?: boolean;
  /** What stopped the send, when Notion or the network said no. */
  error?: string;
}

/**
 * Requests are saved here first and sent in order, so one sent offline or before Notion is
 * connected isn't lost. A failed send stops the run and keeps the rest for the next one.
 */
export function makeOutbox(deps: OutboxDeps) {
  let chain: Promise<unknown> = Promise.resolve();
  const mutate = (fn: (list: FeatureRequest[]) => FeatureRequest[]) => {
    const next = chain.then(async () => deps.save(fn(await deps.load())));
    chain = next.catch(() => undefined);
    return next;
  };
  const count = async () => {
    await chain;
    return (await deps.load()).length;
  };

  async function run(): Promise<FlushResult> {
    const sent: FlushResult["sent"] = [];
    const token = await deps.token();
    const databaseId = parseNotionId((await deps.queueLink()) ?? "");
    if (!token || !databaseId) return { sent, pending: await count(), notConnected: true };
    const cached = await deps.cachedSource();
    let dataSourceId = cached?.databaseId === databaseId ? cached.dataSourceId : undefined;
    const tried = new Set<string>();
    for (;;) {
      await chain;
      const next = (await deps.load()).find((r) => !tried.has(r.id));
      if (!next) break;
      tried.add(next.id);
      try {
        const row = await createQueueRow(next, { token, databaseId, dataSourceId }, deps.fetcher);
        if (row.dataSourceId !== dataSourceId) {
          dataSourceId = row.dataSourceId;
          await deps.cacheSource({ databaseId, dataSourceId });
        }
        await mutate((list) => list.filter((r) => r.id !== next.id));
        sent.push({ id: next.id, ...row });
      } catch (e) {
        return { sent, pending: await count(), error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { sent, pending: await count() };
  }

  let running: Promise<FlushResult> | null = null;
  const flush = (): Promise<FlushResult> => {
    running ??= run().finally(() => (running = null));
    return running;
  };

  return {
    pending: count,
    flush,
    /** Saves the request, then sends everything waiting. */
    async submit(request: FeatureRequest): Promise<FlushResult> {
      await mutate((list) => [...list, request]);
      const first = await flush();
      // A send already under way may have finished its last look before this request landed.
      if (first.notConnected || first.error || first.sent.some((s) => s.id === request.id)) return first;
      const second = await flush();
      return { ...second, sent: [...first.sent, ...second.sent] };
    },
  };
}
