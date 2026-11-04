import { ulid, type ContextItem, type Unit } from "@composer/core";
import { splitUnits } from "@composer/engine";
import { httpJson } from "./http";
import { SECRET } from "../platform/secrets";
import type { Connector } from "./types";

export interface LinearIssue {
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  state?: { name: string } | null;
  priorityLabel?: string | null;
  labels?: { nodes: { name: string }[] };
  comments?: { nodes: { body: string; createdAt: string; user?: { name: string } | null }[] };
}

const QUERY = `query Issue($id: String!) {
  issue(id: $id) {
    identifier title description url priorityLabel
    state { name }
    labels { nodes { name } }
    comments(first: 100) { nodes { body createdAt user { name } } }
  }
}`;

/** A Linear issue as one ticket item: the description, then each comment as its own unit. */
export function parseLinearIssue(issue: LinearIssue): ContextItem {
  const units: Unit[] = [{ text: `${issue.identifier} · ${issue.title}`, label: [issue.state?.name, issue.priorityLabel].filter(Boolean).join(" · ") || undefined } as Unit];
  if (issue.description) units.push(...splitUnits(issue.description, "ticket"));
  for (const c of [...(issue.comments?.nodes ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    units.push(...splitUnits(c.body, "ticket").map((u) => ({ ...u, label: c.user?.name ?? "comment" })));
  }
  const labels = issue.labels?.nodes.map((l) => l.name) ?? [];
  return {
    id: ulid(),
    kind: "ticket",
    title: `${issue.identifier} ${issue.title}`,
    url: issue.url,
    units: units.map((u) => (u.label ? u : { text: u.text })),
    ...(labels.length ? { author: labels.join(", ") } : {}),
  };
}

export const linear: Connector = {
  platform: "linear",
  label: "Linear",
  secret: SECRET.linear,
  tokenRequired: true,
  tokenHelp: "Linear → Settings → Security & access → Personal API keys",
  match(url) {
    if (!/(^|\.)linear\.app$/.test(url.hostname)) return;
    const m = /\/issue\/([A-Z][A-Z0-9]+-\d+)/i.exec(url.pathname);
    return m ? { issue: m[1]!.toUpperCase() } : undefined;
  },
  async fetch(config, token) {
    if (!token) throw new Error("Add a Linear API key in Settings (⌘,) to pull tickets.");
    const res = await httpJson<{ data?: { issue: LinearIssue | null }; errors?: { message: string }[] }>("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({ query: QUERY, variables: { id: config.issue } }),
    });
    if (res.errors?.length) throw new Error(`Linear: ${res.errors[0]!.message}`);
    const issue = res.data?.issue;
    if (!issue) throw new Error(`Linear couldn't find ${config.issue}`);
    const item = parseLinearIssue(issue);
    return {
      title: `Linear · ${issue.identifier} ${issue.title}`,
      content: { v: 1, kind: "context", items: [item], syncedAt: new Date().toISOString() },
      config,
    };
  },
};
