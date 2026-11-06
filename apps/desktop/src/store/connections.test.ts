// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

async function fresh(answer: (url: string) => Response) {
  vi.resetModules();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => answer(String(url))));
  const connections = await import("./connections");
  const secrets = await import("../platform/secrets");
  return { ...connections, ...secrets, status: (id: "figma" | "slack") => connections.useConnections.getState().statuses[id] };
}

afterEach(() => vi.unstubAllGlobals());

describe("connecting a service", () => {
  it("keeps a token in Keychain only once the service accepts it", async () => {
    const t = await fresh((url) => (url.includes("figma") ? Response.json({ handle: "andrew" }) : new Response("{}", { status: 404 })));
    const r = await t.connect("figma", "  figd_good  ");
    expect(r).toEqual({ ok: true, who: "andrew" });
    expect(await t.getSecret(t.SECRET.figma)).toBe("figd_good");
    expect(t.status("figma")).toEqual({ kind: "connected", who: "andrew" });
  });

  it("never saves a rejected token", async () => {
    const t = await fresh(() => new Response("{}", { status: 403 }));
    const r = await t.connect("figma", "figd_bad");
    expect(r.ok).toBe(false);
    expect(await t.getSecret(t.SECRET.figma)).toBeNull();
    expect(t.status("figma")).toEqual({ kind: "not_connected" });
  });

  it("keeps a token it couldn't check, and says so", async () => {
    const t = await fresh(() => {
      throw new TypeError("offline");
    });
    await t.connect("slack", "xoxp-1");
    expect(await t.getSecret(t.SECRET.slack)).toBe("xoxp-1");
    expect(t.status("slack")).toMatchObject({ kind: "unverified" });
  });

  it("removes the token on Disconnect", async () => {
    const t = await fresh(() => Response.json({ ok: true, user: "andrew" }));
    await t.connect("slack", "xoxp-1");
    await t.disconnect("slack");
    expect(await t.getSecret(t.SECRET.slack)).toBeNull();
    expect(t.status("slack")).toEqual({ kind: "not_connected" });
  });
});
