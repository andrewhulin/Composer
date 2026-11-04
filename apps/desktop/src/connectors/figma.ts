import { ulid, type ContextItem } from "@composer/core";
import { httpJson, imageDataUrl } from "./http";
import { SECRET } from "../platform/secrets";
import type { Connector } from "./types";

interface FigmaNode {
  name: string;
  type: string;
  characters?: string;
  children?: FigmaNode[];
}

/** Every text layer in a frame, top to bottom: the copy a screen carries. */
export function figmaText(node: FigmaNode, out: string[] = []): string[] {
  if (node.type === "TEXT" && node.characters?.trim()) out.push(node.characters.trim());
  for (const c of node.children ?? []) figmaText(c, out);
  return out;
}

/** A Figma frame as a screen item: its name, its copy as units, and a thumbnail. */
export function parseFigmaFrame(node: FigmaNode, url: string, image?: string): ContextItem {
  const lines = [...new Set(figmaText(node))].slice(0, 120);
  return {
    id: ulid(),
    kind: "screen",
    title: node.name,
    url,
    units: lines.length ? lines.map((text) => ({ text })) : [{ text: `Figma frame: ${node.name}` }],
    ...(image ? { image } : {}),
  };
}

export const figma: Connector = {
  platform: "figma",
  label: "Figma",
  secret: SECRET.figma,
  tokenRequired: true,
  tokenHelp: "Figma → Settings → Security → Personal access tokens (file content: read)",
  match(url) {
    if (!/(^|\.)figma\.com$/.test(url.hostname)) return;
    const m = /\/(?:design|file|proto)\/([A-Za-z0-9]+)/.exec(url.pathname);
    const nodeId = url.searchParams.get("node-id")?.replace("-", ":");
    return m && nodeId ? { file: m[1]!, node: nodeId } : undefined;
  },
  async fetch(config, token) {
    if (!token) throw new Error("Add a Figma personal access token in Settings (⌘,) to pull frames.");
    const headers = { "X-Figma-Token": token };
    const nodes = await httpJson<{ name: string; nodes: Record<string, { document: FigmaNode } | null> }>(
      `https://api.figma.com/v1/files/${config.file}/nodes?ids=${encodeURIComponent(config.node!)}`,
      { headers },
    );
    const doc = nodes.nodes[config.node!]?.document;
    if (!doc) throw new Error("Figma couldn't find that frame. Copy the link with the frame selected.");
    const images = await httpJson<{ images: Record<string, string | null> }>(
      `https://api.figma.com/v1/images/${config.file}?ids=${encodeURIComponent(config.node!)}&format=png&scale=1`,
      { headers },
    );
    const remote = images.images[config.node!];
    const image = remote ? await imageDataUrl(remote) : undefined;
    const url = `https://www.figma.com/design/${config.file}?node-id=${config.node!.replace(":", "-")}`;
    return {
      title: `Figma · ${doc.name}`,
      content: { v: 1, kind: "context", items: [parseFigmaFrame(doc, url, image)], syncedAt: new Date().toISOString() },
      config,
    };
  },
};
