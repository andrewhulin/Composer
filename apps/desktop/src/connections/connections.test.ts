import { describe, expect, it } from "vitest";
import { sortAssets } from "./assets";
import { INTEGRATIONS, integration, type Fetcher } from "./registry";
import { healthIssues, healthLabel, isRequired, statusFrom, statusLabel } from "./status";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answering =
  (body: unknown, status = 200): Fetcher =>
  async () =>
    json(body, status);
const offline: Fetcher = async () => {
  throw new TypeError("Load failed");
};

describe("token tests", () => {
  it("say who a working token belongs to", async () => {
    expect(await integration("linear").test!("lin_api_x", answering({ data: { viewer: { name: "Andrew Hulin" } } }))).toEqual({ ok: true, who: "Andrew Hulin" });
    expect(await integration("figma").test!("figd_x", answering({ handle: "andrew" }))).toEqual({ ok: true, who: "andrew" });
    expect(await integration("slack").test!("xoxp-x", answering({ ok: true, user: "andrew", team: "Slingshot" }))).toEqual({ ok: true, who: "andrew · Slingshot" });
    expect(await integration("notion").test!("ntn_x", answering({ name: "Composer" }))).toEqual({ ok: true, who: "Composer" });
    expect(await integration("anthropic").test!("sk-ant-x", answering({ input_tokens: 8 }))).toEqual({ ok: true, who: "Claude Opus 5.5" });
  });

  it("call a rejected token rejected, and an expired Slack token expired", async () => {
    const figma = await integration("figma").test!("figd_bad", answering({}, 403));
    expect(figma).toMatchObject({ ok: false });
    expect(figma.ok || figma.unreachable).toBeFalsy();
    expect(await integration("linear").test!("lin_api_bad", answering({ errors: [{ message: "Authentication required" }] }))).toMatchObject({ ok: false });
    const slack = await integration("slack").test!("xoxp-old", answering({ ok: false, error: "token_expired" }));
    expect(slack).toMatchObject({ ok: false, expired: true });
  });

  it("tell an unreachable service from a bad token", async () => {
    expect(await integration("statsig").test!("console-x", offline)).toMatchObject({ ok: false, unreachable: true });
    expect(await integration("notion").test!("ntn_x", answering({}, 503))).toMatchObject({ ok: false, unreachable: true });
  });

  it("send each service the header it expects", async () => {
    const seen: Record<string, string> = {};
    const capture: Fetcher = async (url, init) => {
      new Headers(init?.headers).forEach((v, k) => (seen[`${new URL(url).hostname} ${k}`] = v));
      return json({ ok: true, data: { viewer: { name: "x" } } });
    };
    await integration("linear").test!("lin_api_1", capture);
    await integration("figma").test!("figd_1", capture);
    await integration("statsig").test!("console-1", capture);
    await integration("anthropic").test!("sk-ant-1", capture);
    expect(seen).toMatchObject({ "api.linear.app authorization": "lin_api_1", "api.figma.com x-figma-token": "figd_1", "statsigapi.net statsig-api-key": "console-1", "api.anthropic.com x-api-key": "sk-ant-1" });
  });
});

describe("connector status", () => {
  it("reads each kind of integration", () => {
    expect(statusFrom(integration("pinterest"), false)).toEqual({ kind: "not_needed" });
    expect(statusFrom(integration("arena"), false)).toEqual({ kind: "optional" });
    expect(statusFrom(integration("linear"), false)).toEqual({ kind: "not_connected" });
    expect(statusFrom(integration("linear"), true)).toEqual({ kind: "checking" });
    expect(statusFrom(integration("linear"), true, { ok: true, who: "Andrew" })).toEqual({ kind: "connected", who: "Andrew" });
    expect(statusFrom(integration("linear"), true, { ok: false, reason: "no" })).toEqual({ kind: "error", reason: "no" });
    expect(statusFrom(integration("slack"), true, { ok: false, reason: "old", expired: true })).toEqual({ kind: "expired", reason: "old" });
    expect(statusFrom(integration("figma"), true, { ok: false, reason: "offline", unreachable: true })).toEqual({ kind: "unverified", reason: "offline" });
    expect(statusFrom(integration("github"), false, { ok: false, reason: "gh isn't installed" })).toEqual({ kind: "not_connected", reason: "gh isn't installed" });
    expect(statusFrom(integration("github"), false, { ok: true, who: "andrewhulin" })).toEqual({ kind: "connected", who: "andrewhulin" });
  });

  it("labels them the way the list does", () => {
    expect(statusLabel({ kind: "connected", who: "Andrew" })).toBe("Connected as Andrew");
    expect(statusLabel({ kind: "expired", reason: "x" })).toBe("Token expired");
    expect(statusLabel({ kind: "not_connected" })).toBe("Not connected");
  });

  it("requires Claude always, and a source's service only when the project uses it", () => {
    const none = new Set<never>();
    expect(isRequired(integration("anthropic"), none)).toBe(true);
    expect(isRequired(integration("linear"), none)).toBe(false);
    expect(isRequired(integration("linear"), new Set(["linear" as const]))).toBe(true);
    // Optional tokens and token-free services are never required.
    expect(isRequired(integration("arena"), new Set(["arena" as const]))).toBe(false);
    expect(isRequired(integration("pinterest"), new Set(["pinterest" as const]))).toBe(false);
  });

  it("flags only required connectors that are missing or broken", () => {
    const statuses = { anthropic: { kind: "connected" as const }, linear: { kind: "expired" as const, reason: "x" }, figma: { kind: "not_connected" as const }, slack: { kind: "unverified" as const, reason: "offline" } };
    const issues = healthIssues(statuses, new Set(["linear", "slack"] as const));
    expect(issues.map((i) => i.id)).toEqual(["linear"]);
    expect(healthLabel(issues, statuses)).toBe("Linear token expired");
    expect(healthLabel(healthIssues({ anthropic: { kind: "not_connected" }, linear: { kind: "error", reason: "x" } }, new Set(["linear"] as const)), {})).toBe("2 connectors need attention");
    expect(healthLabel([], statuses)).toBeNull();
  });
});

describe("setup guides", () => {
  it("give every connector numbered steps, ending where the token goes", () => {
    for (const i of INTEGRATIONS) {
      expect(i.steps.length, i.id).toBeGreaterThanOrEqual(3);
      for (const s of i.steps) if (s.link) expect(s.link.url, i.id).toMatch(/^https:\/\//);
      if (i.auth.kind === "token") expect(i.steps.at(-1)!.mock.field, i.id).toBeTruthy();
    }
  });

  it("pick up dropped-in Rive files and per-step loops by connector", () => {
    const sorted = sortAssets({
      "../assets/connectors/figma/guide.riv": "/a/figma.riv",
      "../assets/connectors/linear/step-1.gif": "/a/l1.gif",
      "../assets/connectors/linear/step-3.mp4": "/a/l3.mp4",
      "../assets/connectors/linear/notes.png": "/a/ignored.png",
    });
    expect(sorted.figma).toEqual({ riv: "/a/figma.riv", steps: {} });
    expect(sorted.linear).toEqual({ steps: { 1: { url: "/a/l1.gif", kind: "image" }, 3: { url: "/a/l3.mp4", kind: "video" } } });
    expect(sorted.slack).toBeUndefined();
  });
});
