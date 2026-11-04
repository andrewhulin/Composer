/** What a prototype actually rendered with, read from its computed styles. */
export interface UsedStyles {
  colors: string[];
  radii: number[];
  fontSizes: number[];
}

export interface TokenSet {
  colors: string[];
  radii: number[];
  fontSizes: number[];
}

export interface LintResult {
  /** Share of used values that match a token, 0–100, or null when no tokens are slotted. */
  pct: number | null;
  /** Off-system values, most used first: the raw material for design system proposals. */
  offenders: { kind: "color" | "radius" | "fontSize"; value: string; count: number }[];
}

/** "rgb(224, 90, 78)" / "#E05A4E" / "#e05a4eff" → "#e05a4e". Transparent and invalid → null. */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (hex) {
    if (hex[2] === "00") return null;
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return `#${h}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/.exec(v);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null;
    return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

/**
 * How much of a prototype is on the design system: every used color, radius and font size is
 * matched against the tokens (radii and sizes within 0.5px). Feeds "Build output on-system".
 */
export function lintAgainstTokens(used: UsedStyles, tokens: TokenSet | null): LintResult {
  if (!tokens) return { pct: null, offenders: [] };
  const colors = new Set(tokens.colors.map(normalizeColor).filter(Boolean));
  const near = (list: number[], v: number) => list.some((t) => Math.abs(t - v) <= 0.5);
  const counts = new Map<string, { kind: LintResult["offenders"][number]["kind"]; value: string; count: number }>();
  let total = 0;
  let ok = 0;
  const check = (kind: "color" | "radius" | "fontSize", value: string, pass: boolean) => {
    total++;
    if (pass) ok++;
    else {
      const key = `${kind}:${value}`;
      const hit = counts.get(key) ?? { kind, value, count: 0 };
      hit.count++;
      counts.set(key, hit);
    }
  };
  for (const c of used.colors) {
    const n = normalizeColor(c);
    if (n) check("color", n, colors.has(n));
  }
  for (const r of used.radii) if (r > 0) check("radius", `${r}px`, near(tokens.radii, r));
  for (const f of used.fontSizes) check("fontSize", `${f}px`, near(tokens.fontSizes, f));
  return {
    pct: total ? Math.round((100 * ok) / total) : 100,
    offenders: [...counts.values()].sort((a, b) => b.count - a.count),
  };
}
