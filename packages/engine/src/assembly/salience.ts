const STOP = new Set(
  "a an and are as at be but by for from has have i if in into is it its me my of on or our so that the their them they this to was we were what when which who will with you your".split(" "),
);

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** BM25 score of each document against the query terms. */
export function bm25(docs: string[], query: string[], k1 = 1.2, b = 0.75): number[] {
  const toks = docs.map(terms);
  const avg = toks.reduce((s, t) => s + t.length, 0) / Math.max(1, toks.length) || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const term of new Set(t)) df.set(term, (df.get(term) ?? 0) + 1);
  const q = [...new Set(query)];
  return toks.map((t) => {
    const tf = new Map<string, number>();
    for (const term of t) tf.set(term, (tf.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg));
    }
    return score;
  });
}
