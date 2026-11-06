/** 13600 → "13.6k", 200000 → "200k", 950 → "950". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1)}k`;
}

/** "just now", "12m ago", "3h ago", "yesterday", "4d ago", then the date ("Oct 28"). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const s = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
