import type { SourcePlatform } from "@composer/core";
import { INTEGRATIONS, type Integration, type IntegrationId, type TestResult } from "./registry";

export type Status =
  | { kind: "checking" }
  | { kind: "not_connected"; reason?: string }
  | { kind: "optional" }
  | { kind: "not_needed" }
  | { kind: "connected"; who?: string }
  | { kind: "unverified"; reason: string }
  | { kind: "error"; reason: string }
  | { kind: "expired"; reason: string };

/** What an integration's state is, from whether a token is saved and what its last test said. */
export function statusFrom(i: Integration, saved: boolean, result?: TestResult): Status {
  if (i.auth.kind === "none") return { kind: "not_needed" };
  if (i.auth.kind === "cli") {
    if (!result) return { kind: "checking" };
    return result.ok ? { kind: "connected", ...(result.who ? { who: result.who } : {}) } : { kind: "not_connected", reason: result.reason };
  }
  if (!saved) return i.auth.optional ? { kind: "optional" } : { kind: "not_connected" };
  if (!result) return { kind: "checking" };
  if (result.ok) return { kind: "connected", ...(result.who ? { who: result.who } : {}) };
  if (result.unreachable) return { kind: "unverified", reason: result.reason };
  return result.expired ? { kind: "expired", reason: result.reason } : { kind: "error", reason: result.reason };
}

/** The short label in the Connectors list. */
export function statusLabel(s: Status): string {
  switch (s.kind) {
    case "checking":
      return "Checking…";
    case "not_connected":
      return "Not connected";
    case "optional":
      return "Optional · not connected";
    case "not_needed":
      return "No token needed";
    case "connected":
      return s.who ? `Connected as ${s.who}` : "Connected";
    case "unverified":
      return "Saved · not checked";
    case "error":
      return "Error";
    case "expired":
      return "Token expired";
  }
}

export const isProblem = (s: Status | undefined): boolean => !!s && (s.kind === "not_connected" || s.kind === "error" || s.kind === "expired");

/** Required: Claude always; a source's service when the open project has sources from it. */
export function isRequired(i: Integration, platformsInUse: ReadonlySet<SourcePlatform>): boolean {
  if (i.alwaysRequired) return true;
  return i.auth.kind === "token" && !i.auth.optional && !!i.platform && platformsInUse.has(i.platform);
}

/** Required integrations that are missing or broken, in list order: what the health chip shows. */
export function healthIssues(statuses: Partial<Record<IntegrationId, Status>>, platformsInUse: ReadonlySet<SourcePlatform>): Integration[] {
  return INTEGRATIONS.filter((i) => isRequired(i, platformsInUse) && isProblem(statuses[i.id]));
}

/** The chip's words: one problem by name, several by count. */
export function healthLabel(issues: Integration[], statuses: Partial<Record<IntegrationId, Status>>): string | null {
  if (!issues.length) return null;
  if (issues.length > 1) return `${issues.length} connectors need attention`;
  const i = issues[0]!;
  const s = statuses[i.id];
  return s?.kind === "expired" ? `${i.name} token expired` : s?.kind === "error" ? `${i.name} token rejected` : `${i.name} isn't connected`;
}
