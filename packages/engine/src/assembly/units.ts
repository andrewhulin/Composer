import type { ItemKind, Unit } from "@composer/core";

/** Rough token estimate (≈4 chars per token). Exact counts come from countTokens and are cached. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const SPEAKER = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([A-Z][\w .'-]{0,30}):\s+(.*)$/;
const MAX_UNIT_CHARS = 1600;

/**
 * Splits raw text into atomic units at ingest time. Transcripts split per utterance
 * ("P07: …" or "[14:22] P07: …"); everything else splits per paragraph, with very long
 * paragraphs split at sentence boundaries so no single unit dominates a budget.
 */
export function splitUnits(text: string, kind: ItemKind): Unit[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  if (kind === "transcript") {
    const units: Unit[] = [];
    for (const line of clean.split("\n")) {
      if (!line.trim()) continue;
      const m = SPEAKER.exec(line);
      if (m) {
        const [, time, speaker, said] = m;
        units.push({ text: said!.trim(), label: time ? `${speaker} · ${time}` : speaker });
      } else if (units.length) {
        units[units.length - 1]!.text += ` ${line.trim()}`;
      } else {
        units.push({ text: line.trim() });
      }
    }
    return units;
  }
  return clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > MAX_UNIT_CHARS ? splitSentences(p, MAX_UNIT_CHARS) : [p]))
    .map((t) => ({ text: t }));
}

/** Groups sentences into chunks no longer than `max` characters. */
export function splitSentences(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["”’)]*\s*|$)/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && current.length + s.length > max) {
      chunks.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Cuts a single oversized unit at the last sentence boundary that fits `maxTokens`. */
export function cutAtSentence(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "));
  return (end > maxChars * 0.3 ? head.slice(0, end + 1) : head.replace(/\s+\S*$/, "")).trim();
}
