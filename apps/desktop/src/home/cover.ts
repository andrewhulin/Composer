import type { Hash, Phase, TextArtifact } from "@composer/core";
import type { ProjectCover } from "@composer/data";

/** What a Home card shows: a live prototype, the headline of the newest locked output, or nothing yet. */
export type Cover = { kind: "prototype"; hash: Hash; html: string } | { kind: "text"; phase: Phase; text: string } | null;

const asArtifact = (v: unknown): TextArtifact | undefined => (v && typeof v === "object" && (v as TextArtifact).kind === "text" ? (v as TextArtifact) : undefined);

/** The first line worth reading: markdown markers and "Label:" prefixes stripped, kept short. */
export function headline(text: string, max = 160): string {
  const line =
    text
      .split("\n")
      .map((l) => l.replace(/^[#>*\-\s]+/, "").replace(/[*_`]/g, "").trim())
      .find((l) => l.length > 0) ?? "";
  const plain = line.replace(/^[A-Z][A-Za-z ]{1,24}:\s+/, "");
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** A prototype wins when there is one, since it's the most recognizable; otherwise the newest locked output. */
export function coverOf(cover: ProjectCover | undefined, blobs: Map<Hash, unknown>): Cover {
  if (!cover) return null;
  if (cover.prototypeHash) {
    const art = asArtifact(blobs.get(cover.prototypeHash));
    const html = (art?.data as { html?: unknown } | undefined)?.html;
    if (typeof html === "string" && html.trim()) return { kind: "prototype", hash: cover.prototypeHash, html };
  }
  if (cover.latest) {
    const art = asArtifact(blobs.get(cover.latest.contentHash));
    const text = art ? headline(art.text) : "";
    if (text) return { kind: "text", phase: cover.latest.phase, text };
  }
  return null;
}
