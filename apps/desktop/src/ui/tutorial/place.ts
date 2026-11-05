export type Rect = { left: number; top: number; width: number; height: number };

export const CARD_W = 344;

/**
 * Beside the target if there's room, otherwise wherever covers the least of it. With nothing to
 * point at, welcome and finish sit in the middle; other steps keep out of the way, bottom right.
 */
export function place(target: Rect | null, h: number, centered: boolean, vw = window.innerWidth, vh = window.innerHeight): { left: number; top: number } {
  const m = 14;
  const gap = 16;
  const clampY = (y: number) => Math.max(m, Math.min(vh - h - m, y));
  const clampX = (x: number) => Math.max(m, Math.min(vw - CARD_W - m, x));
  if (centered) return { left: (vw - CARD_W) / 2, top: Math.max(m, (vh - h) / 2 - 40) };
  if (!target) return { left: clampX(vw - CARD_W - 24), top: clampY(vh - h - 24) };
  const r = target;
  const candidates = [
    { left: r.left + r.width + gap, top: clampY(r.top) },
    { left: r.left - gap - CARD_W, top: clampY(r.top) },
    { left: clampX(r.left), top: r.top + r.height + gap },
    { left: clampX(r.left), top: r.top - gap - h },
    { left: vw - CARD_W - m, top: vh - h - m },
    { left: vw - CARD_W - m, top: m },
    { left: m, top: vh - h - m },
    { left: m, top: m },
  ].map((c) => ({ left: clampX(c.left), top: clampY(c.top) }));
  const overlap = (c: { left: number; top: number }) => {
    const w = Math.max(0, Math.min(c.left + CARD_W, r.left + r.width) - Math.max(c.left, r.left));
    const hh = Math.max(0, Math.min(c.top + h, r.top + r.height) - Math.max(c.top, r.top));
    return w * hh;
  };
  return candidates.reduce((best, c) => (overlap(c) < overlap(best) ? c : best), candidates[0]!);
}
