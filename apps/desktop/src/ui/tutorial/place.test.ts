import { describe, expect, it } from "vitest";
import { place } from "./place";

describe("guide card placement", () => {
  const overlaps = (c: { left: number; top: number }, r: { left: number; top: number; width: number; height: number }, h: number) =>
    c.left < r.left + r.width && c.left + 344 > r.left && c.top < r.top + r.height && c.top + h > r.top;

  it("sits beside the target when there's room", () => {
    const r = { left: 100, top: 200, width: 200, height: 80 };
    expect(place(r, 260, false, 1512, 945)).toEqual({ left: 316, top: 200 });
  });

  it("never covers the target when any position avoids it", () => {
    const wide = { left: 300, top: 300, width: 900, height: 200 };
    const c = place(wide, 260, false, 1512, 945);
    expect(overlaps(c, wide, 260)).toBe(false);
  });

  it("stays on screen in a small window", () => {
    const r = { left: 3, top: 168, width: 518, height: 175 };
    const c = place(r, 249, false, 523, 372);
    expect(c.left).toBeGreaterThanOrEqual(0);
    expect(c.top).toBeGreaterThanOrEqual(0);
  });

  it("centers welcome and finish, and parks other untargeted steps bottom right", () => {
    expect(place(null, 300, true, 1512, 945)).toEqual({ left: (1512 - 344) / 2, top: (945 - 300) / 2 - 40 });
    expect(place(null, 300, false, 1512, 945)).toEqual({ left: 1512 - 344 - 24, top: 945 - 300 - 24 });
  });
});
