import { describe, expect, it } from "vitest";
import { createQueueRow, NOTION_VERSION, parseNotionId, queueProperties, richText, type FeatureRequest, type Fetcher } from "./queue";

const ID = "804d9bd2-24ab-4e1a-ac87-1d82ee1b9015";

const request = (over: Partial<FeatureRequest> = {}): FeatureRequest => ({
  id: "r1",
  title: "  Drag variants to reorder  ",
  why: "Rounds get long and the best one ends up last.",
  areas: ["Build"],
  createdAt: "2026-11-05T12:00:00.000Z",
  ...over,
});

describe("parseNotionId", () => {
  it("reads the id from database links in every shape Notion hands out", () => {
    expect(parseNotionId("https://www.notion.so/acme/Dev-queue-804d9bd224ab4e1aac871d82ee1b9015?v=0123456789abcdef0123456789abcdef")).toBe(ID);
    expect(parseNotionId("https://app.notion.com/p/804d9bd224ab4e1aac871d82ee1b9015?pvs=204")).toBe(ID);
    expect(parseNotionId("https://www.notion.so/804d9bd224ab4e1aac871d82ee1b9015")).toBe(ID);
  });

  it("takes a bare id with or without dashes", () => {
    expect(parseNotionId("804d9bd224ab4e1aac871d82ee1b9015")).toBe(ID);
    expect(parseNotionId(` ${ID.toUpperCase()} `)).toBe(ID);
  });

  it("doesn't let a title ending in hex letters bleed into the id", () => {
    expect(parseNotionId("https://www.notion.so/Cafe-804d9bd224ab4e1aac871d82ee1b9015")).toBe(ID);
  });

  it("rejects links that aren't Notion or carry no id", () => {
    expect(parseNotionId("https://example.com/804d9bd224ab4e1aac871d82ee1b9015")).toBeUndefined();
    expect(parseNotionId("https://www.notion.so/Dev-queue")).toBeUndefined();
    expect(parseNotionId("")).toBeUndefined();
  });
});

describe("queueProperties", () => {
  it("lands as Proposed from the app, so nothing builds it until it's queued by hand", () => {
    const p = queueProperties(request({ areas: ["Build", "Evals"] }));
    expect(p.Status).toEqual({ status: { name: "Proposed" } });
    expect(p.Source).toEqual({ select: { name: "In-app" } });
    expect(p.Area).toEqual({ multi_select: [{ name: "Build" }, { name: "Evals" }] });
    expect(p.Request.title[0]!.text.content).toBe("Drag variants to reorder");
  });

  it("puts where it was sent from under the why, only when included", () => {
    const withContext = queueProperties(request({ context: "Build, loop 1 · Composer 0.1.0" }));
    expect(withContext.Spec.rich_text.map((r) => r.text.content).join("")).toBe("Rounds get long and the best one ends up last.\n\nSent from Composer · Build, loop 1 · Composer 0.1.0");
    expect(queueProperties(request()).Spec.rich_text.map((r) => r.text.content).join("")).not.toContain("Sent from");
  });

  it("sends an empty spec as no text rather than an empty run", () => {
    expect(queueProperties(request({ why: "  " })).Spec.rich_text).toEqual([]);
  });
});

describe("richText", () => {
  it("splits at Notion's 2,000-character limit without losing text", () => {
    const text = "a".repeat(4500);
    const runs = richText(text);
    expect(runs.map((r) => r.text.content.length)).toEqual([2000, 2000, 500]);
    expect(runs.map((r) => r.text.content).join("")).toBe(text);
  });
});

/** A scripted Notion that records what it was asked. */
function fakeNotion(answers: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(answers).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected ${url}`);
    return answers[key]!();
  };
  return { calls, fetcher };
}

describe("createQueueRow", () => {
  const ok = {
    "/databases/": () => Response.json({ data_sources: [{ id: "source-1" }] }),
    "/pages": () => Response.json({ url: "https://www.notion.so/row", properties: { ID: { type: "unique_id", unique_id: { number: 12 } } } }),
  };

  it("looks up the data source, then adds the row under it with the current API version", async () => {
    const notion = fakeNotion(ok);
    const row = await createQueueRow(request(), { token: "t", databaseId: ID }, notion.fetcher);
    expect(row).toEqual({ url: "https://www.notion.so/row", number: 12, dataSourceId: "source-1" });
    expect(notion.calls.map((c) => c.url)).toEqual([`https://api.notion.com/v1/databases/${ID}`, "https://api.notion.com/v1/pages"]);
    const post = notion.calls[1]!;
    expect((post.init.headers as Record<string, string>)["Notion-Version"]).toBe(NOTION_VERSION);
    expect(JSON.parse(post.init.body as string).parent).toEqual({ type: "data_source_id", data_source_id: "source-1" });
  });

  it("skips the lookup when the data source is already known", async () => {
    const notion = fakeNotion(ok);
    await createQueueRow(request(), { token: "t", databaseId: ID, dataSourceId: "source-1" }, notion.fetcher);
    expect(notion.calls.map((c) => c.url)).toEqual(["https://api.notion.com/v1/pages"]);
  });

  it("says what to do when the database isn't shared with the integration", async () => {
    const notion = fakeNotion({ "/databases/": () => Response.json({ code: "object_not_found" }, { status: 404 }) });
    await expect(createQueueRow(request(), { token: "t", databaseId: ID }, notion.fetcher)).rejects.toThrow("Share it with your integration");
  });

  it("says the token is wrong when Notion rejects it", async () => {
    const notion = fakeNotion({ "/databases/": () => Response.json({ code: "unauthorized" }, { status: 401 }) });
    await expect(createQueueRow(request(), { token: "t", databaseId: ID }, notion.fetcher)).rejects.toThrow("didn't accept the token");
  });

  it("turns a network failure into a plain message", async () => {
    const offline: Fetcher = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(createQueueRow(request(), { token: "t", databaseId: ID, dataSourceId: "s" }, offline)).rejects.toThrow("Couldn't reach Notion.");
  });
});
