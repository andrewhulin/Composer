import type { Unit } from "@composer/core";
import { bm25 } from "./salience";
import { cutAtSentence, estimateTokens } from "./units";

export interface TrimmedUnit extends Unit {
  index: number;
  tokens: number;
  /** True when this unit was cut at a sentence boundary to fit. */
  cut?: boolean;
}

export interface TrimResult {
  kept: TrimmedUnit[];
  dropped: TrimmedUnit[];
  used: number;
  demand: number;
}

/**
 * Keeps whole units within `allowance` tokens, most salient first (starred, then BM25 against the
 * query), and never summarizes. Only a lone unit bigger than the whole allowance is cut.
 */
export function trimUnits(units: Unit[], allowance: number, query: string[]): TrimResult {
  const all: TrimmedUnit[] = units.map((u, index) => ({ ...u, index, tokens: estimateTokens(u.text) }));
  const demand = all.reduce((s, u) => s + u.tokens, 0);
  if (demand <= allowance) return { kept: all, dropped: [], used: demand, demand };
  if (allowance <= 0) return { kept: [], dropped: all, used: 0, demand };

  const scores = bm25(all.map((u) => u.text), query);
  const ranked = [...all].sort(
    (a, b) => Number(!!b.starred) - Number(!!a.starred) || scores[b.index]! - scores[a.index]! || a.index - b.index,
  );
  const keep = new Set<number>();
  let used = 0;
  for (const u of ranked) {
    if (used + u.tokens <= allowance) {
      keep.add(u.index);
      used += u.tokens;
    }
  }
  let cutUnit: TrimmedUnit | undefined;
  if (keep.size === 0) {
    const top = ranked[0]!;
    const text = cutAtSentence(top.text, allowance);
    cutUnit = { ...top, text, tokens: estimateTokens(text), cut: true };
    keep.add(top.index);
    used = cutUnit.tokens;
  }
  const kept = all.filter((u) => keep.has(u.index)).map((u) => (cutUnit && u.index === cutUnit.index ? cutUnit : u));
  const dropped = all.filter((u) => !keep.has(u.index));
  return { kept, dropped, used, demand };
}

const NOUN: Record<string, string> = { transcript: "utterances", ticket: "comments" };

/** Renders kept units in original order with markers where units were left out. */
export function renderTrimmed(r: TrimResult, kind: string): string {
  const all = [...r.kept, ...r.dropped].sort((a, b) => a.index - b.index);
  const keptIdx = new Set(r.kept.map((u) => u.index));
  const lines: string[] = [];
  let gap: TrimmedUnit[] = [];
  const flush = () => {
    if (!gap.length) return;
    const noun = NOUN[kind] ?? "passages";
    const labels = gap.map((u) => u.label).filter(Boolean);
    const range = labels.length ? `, ${labels[0]}${labels.length > 1 ? `–${labels[labels.length - 1]}` : ""}` : "";
    lines.push(`[… ${gap.length} ${gap.length === 1 ? noun.replace(/s$/, "") : noun} omitted${range} …]`);
    gap = [];
  };
  for (const u of all) {
    if (!keptIdx.has(u.index)) {
      gap.push(u);
      continue;
    }
    flush();
    const kept = r.kept.find((k) => k.index === u.index)!;
    lines.push(`${kept.label ? `${kept.label}: ` : ""}${kept.text}${kept.cut ? " [… cut to fit]" : ""}`);
  }
  flush();
  return lines.join("\n");
}
