import { describe, expect, it } from "vitest";
import { makeOutbox, type OutboxDeps } from "./outbox";
import type { FeatureRequest, Fetcher } from "./queue";

const LINK = "https://www.notion.so/Dev-queue-804d9bd224ab4e1aac871d82ee1b9015";

const req = (id: string): FeatureRequest => ({ id, title: `Request ${id}`, why: "", areas: ["App shell"], createdAt: "2026-11-05T12:00:00.000Z" });

/** In-memory settings and a scripted Notion: `fail` makes the next sends fail. */
function setup(opts: { token?: string | null; link?: string } = {}) {
  const store: { list: FeatureRequest[]; source?: { databaseId: string; dataSourceId: string } } = { list: [] };
  const posted: string[] = [];
  let lookups = 0;
  const state = { fail: false, token: opts.token === undefined ? "token" : opts.token, link: opts.link ?? LINK };
  let n = 0;
  const fetcher: Fetcher = async (url, init) => {
    await Promise.resolve();
    if (state.fail) throw new TypeError("Failed to fetch");
    if (url.includes("/databases/")) {
      lookups++;
      return Response.json({ data_sources: [{ id: "source-1" }] });
    }
    posted.push(JSON.parse(init.body as string).properties.Request.title[0].text.content);
    return Response.json({ properties: { ID: { type: "unique_id", unique_id: { number: ++n } } } });
  };
  const deps: OutboxDeps = {
    load: async () => store.list,
    save: async (list) => void (store.list = list),
    token: async () => state.token,
    queueLink: async () => state.link,
    cachedSource: async () => store.source,
    cacheSource: async (s) => void (store.source = s),
    fetcher,
  };
  return { outbox: makeOutbox(deps), store, posted, state, lookups: () => lookups };
}

describe("outbox", () => {
  it("sends a request straight away when Notion is connected", async () => {
    const t = setup();
    const r = await t.outbox.submit(req("a"));
    expect(r.sent.map((s) => [s.id, s.number])).toEqual([["a", 1]]);
    expect(r.pending).toBe(0);
    expect(t.posted).toEqual(["Request a"]);
  });

  it("keeps requests made before Notion is connected, then sends them in order", async () => {
    const t = setup({ token: null });
    expect((await t.outbox.submit(req("a"))).notConnected).toBe(true);
    await t.outbox.submit(req("b"));
    expect(await t.outbox.pending()).toBe(2);
    expect(t.posted).toEqual([]);

    t.state.token = "token";
    const r = await t.outbox.flush();
    expect(r.sent.map((s) => s.id)).toEqual(["a", "b"]);
    expect(t.posted).toEqual(["Request a", "Request b"]);
    expect(await t.outbox.pending()).toBe(0);
  });

  it("keeps everything when a send fails, and loses nothing on the retry", async () => {
    const t = setup();
    t.state.fail = true;
    const r = await t.outbox.submit(req("a"));
    expect(r.error).toBe("Couldn't reach Notion.");
    expect(r.pending).toBe(1);

    t.state.fail = false;
    expect((await t.outbox.flush()).sent.map((s) => s.id)).toEqual(["a"]);
    expect(t.posted).toEqual(["Request a"]);
  });

  it("never sends a request twice when sends overlap", async () => {
    const t = setup();
    await Promise.all([t.outbox.submit(req("a")), t.outbox.submit(req("b")), t.outbox.flush(), t.outbox.submit(req("c"))]);
    expect([...t.posted].sort()).toEqual(["Request a", "Request b", "Request c"]);
    expect(await t.outbox.pending()).toBe(0);
  });

  it("looks the data source up once and reuses it, until the database link changes", async () => {
    const t = setup();
    await t.outbox.submit(req("a"));
    await t.outbox.submit(req("b"));
    expect(t.lookups()).toBe(1);

    t.state.link = "https://www.notion.so/Other-0123456789abcdef0123456789abcdef";
    await t.outbox.submit(req("c"));
    expect(t.lookups()).toBe(2);
  });

  it("treats a link that isn't a Notion database as not connected", async () => {
    const t = setup({ link: "https://example.com/queue" });
    expect((await t.outbox.submit(req("a"))).notConnected).toBe(true);
    expect(t.posted).toEqual([]);
  });
});
