import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SourcePlatform } from "@composer/core";
import { http } from "../connectors/http";
import { INTEGRATIONS, integration, type Fetcher, type IntegrationId, type TestResult } from "../connections/registry";
import { isRequired, statusFrom, type Status } from "../connections/status";
import { deleteSecret, getSecret, setSecret } from "../platform/secrets";
import { inTauri } from "../platform/env";
import { useProject } from "./project";

export const useConnections = create<{ statuses: Partial<Record<IntegrationId, Status>> }>(() => ({ statuses: {} }));

const setStatus = (id: IntegrationId, s: Status) => useConnections.setState((st) => ({ statuses: { ...st.statuses, [id]: s } }));

/**
 * The browser preview can't reach these services (CORS), so with ?fake it answers for them: any
 * token works, one containing "bad" is rejected and one containing "expired" has expired.
 */
const fake = import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("fake");
const fakeFetcher: Fetcher = async (url, init) => {
  const headers = new Headers(init?.headers);
  const token = [...headers.values()].join(" ");
  if (token.includes("bad")) return new Response("{}", { status: 401 });
  if (url.includes("slack.com")) return Response.json(token.includes("expired") ? { ok: false, error: "token_expired" } : { ok: true, user: "andrew", team: "Slingshot" });
  if (url.includes("linear.app")) return Response.json({ data: { viewer: { name: "Andrew Hulin" } } });
  if (url.includes("figma.com")) return Response.json({ handle: "andrew" });
  if (url.includes("are.na")) return Response.json({ username: "andrew" });
  if (url.includes("notion.com")) return Response.json({ name: "Composer" });
  return Response.json({});
};
const fetcher: Fetcher = fake ? fakeFetcher : (url, init) => http(url, init);

async function ghStatus(): Promise<TestResult> {
  if (fake) return { ok: true, who: "andrewhulin" };
  if (!inTauri()) return { ok: false, reason: "The GitHub CLI can only be checked from the app." };
  try {
    return { ok: true, who: await invoke<string>("gh_status") };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/** Asks the service whether a token works, without saving it. */
export async function testToken(id: IntegrationId, token: string): Promise<TestResult> {
  const i = integration(id);
  if (i.auth.kind === "cli") return ghStatus();
  if (!i.test) return { ok: true };
  return i.test(token.trim(), fetcher);
}

/** Rechecks one integration against what's saved. */
export async function checkIntegration(id: IntegrationId): Promise<Status> {
  const i = integration(id);
  if (i.auth.kind === "none") {
    setStatus(id, statusFrom(i, false));
    return statusFrom(i, false);
  }
  if (i.auth.kind === "cli") {
    setStatus(id, { kind: "checking" });
    const s = statusFrom(i, false, await ghStatus());
    setStatus(id, s);
    return s;
  }
  const token = await getSecret(i.auth.secret);
  if (!token) {
    const s = statusFrom(i, false);
    setStatus(id, s);
    return s;
  }
  setStatus(id, { kind: "checking" });
  const s = statusFrom(i, true, await testToken(id, token));
  setStatus(id, s);
  return s;
}

export async function checkAll(ids: IntegrationId[] = INTEGRATIONS.map((i) => i.id)) {
  await Promise.all(ids.map((id) => checkIntegration(id).catch(() => undefined)));
}

/**
 * Tests a pasted token and keeps it in Keychain when it works, or when the service can't be
 * reached to say. A rejected token is never saved.
 */
export async function connect(id: IntegrationId, token: string): Promise<TestResult> {
  const i = integration(id);
  if (i.auth.kind !== "token") return testToken(id, token);
  setStatus(id, { kind: "checking" });
  const result = await testToken(id, token);
  if (result.ok || result.unreachable) {
    await setSecret(i.auth.secret, token.trim());
    setStatus(id, statusFrom(i, true, result));
  } else {
    // The pasted token was rejected; whatever was saved before still stands, so show its state.
    await checkIntegration(id);
  }
  if (id === "notion" && (result.ok || result.unreachable)) {
    const { flushRequests, refreshRequests } = await import("../requests/store");
    await refreshRequests();
    void flushRequests().catch(() => undefined);
  }
  return result;
}

/** Removes the token from Keychain. */
export async function disconnect(id: IntegrationId) {
  const i = integration(id);
  if (i.auth.kind !== "token") return;
  await deleteSecret(i.auth.secret);
  setStatus(id, statusFrom(i, false));
  if (id === "notion") void import("../requests/store").then((m) => m.refreshRequests());
}

/** The integrations the open project needs right now: Claude, plus each source service it uses. */
export function requiredNow(): IntegrationId[] {
  const inUse = platformsInUse();
  return INTEGRATIONS.filter((i) => isRequired(i, inUse)).map((i) => i.id);
}

/** The source platforms the open project uses, which makes their connectors required. */
export function platformsInUse(): Set<SourcePlatform> {
  const nodes = Object.values(useProject.getState().graph.nodes);
  return new Set(nodes.flatMap((n) => (n.kind === "source" ? [n.platform] : [])));
}
