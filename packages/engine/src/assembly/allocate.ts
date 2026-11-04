import type { Weight } from "@composer/core";

export type Multipliers = Record<Weight, number>;

/** Share multipliers per weight. Mute is excluded from the prompt entirely. */
export const DEFAULT_MULTIPLIERS: Multipliers = { mute: 0, light: 1, normal: 2.5, heavy: 4 };

/** Pinned items sit outside the main budget, capped at this fraction of it. */
export const PIN_CAP = 0.15;

export interface Demand {
  id: string;
  weight: Weight;
  pinned: boolean;
  /** Tokens the item would need to go in whole. */
  demand: number;
}

/**
 * Weighted water-filling. Every item gets `remaining × w / Σw`; items whose whole demand fits
 * their share are taken whole and the surplus is shared again among the rest.
 */
export function waterFill(items: { id: string; w: number; demand: number }[], budget: number): Map<string, number> {
  const alloc = new Map<string, number>();
  let remaining = Math.max(0, budget);
  let active = items.filter((i) => i.w > 0 && i.demand > 0);
  for (const i of items) alloc.set(i.id, 0);
  while (active.length) {
    const totalW = active.reduce((s, i) => s + i.w, 0);
    const fits = active.filter((i) => i.demand <= (remaining * i.w) / totalW);
    if (!fits.length) {
      for (const i of active) alloc.set(i.id, Math.floor((remaining * i.w) / totalW));
      break;
    }
    for (const i of fits) {
      alloc.set(i.id, i.demand);
      remaining -= i.demand;
    }
    active = active.filter((i) => !fits.includes(i));
  }
  return alloc;
}

/** Token allowance per item for a given total budget. */
export function allocate(demands: Demand[], budget: number, m: Multipliers = DEFAULT_MULTIPLIERS): Map<string, number> {
  const pins = demands.filter((d) => d.pinned);
  const rest = demands.filter((d) => !d.pinned);
  const pinBudget = Math.min(
    pins.reduce((s, d) => s + d.demand, 0),
    Math.floor(budget * PIN_CAP),
  );
  // A pinned item is always present, even if it was also muted.
  const pinAlloc = waterFill(pins.map((d) => ({ id: d.id, w: Math.max(m[d.weight], m.light), demand: d.demand })), pinBudget);
  const used = [...pinAlloc.values()].reduce((s, v) => s + v, 0);
  const restAlloc = waterFill(rest.map((d) => ({ id: d.id, w: m[d.weight], demand: d.demand })), budget - used);
  return new Map([...pinAlloc, ...restAlloc]);
}
