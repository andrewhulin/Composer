import { describe, expect, it } from "vitest";
import { chartOf, chartScales, formatChartValue } from "./proof";
import type { Metric } from "./story";

const metric = (label: string, chart: Metric["chart"]): Metric => ({ label, value: "", target: "", met: "yes", chart });

describe("proof chart", () => {
  it("charts only metrics with an observed number", () => {
    expect(chartOf(metric("a", null))).toBeNull();
    expect(chartOf(metric("b", { unit: "%", observed: Number.NaN, low: null, high: null, target: null }))).toBeNull();
    expect(chartOf(metric("c", { unit: "%", observed: 4, low: null, high: null, target: null }))?.observed).toBe(4);
  });

  it("gives metrics in the same unit one shared scale that covers zero, every range and every target", () => {
    const metrics = [
      metric("opens", { unit: "%", observed: 44, low: 31, high: 57, target: 40 }),
      metric("length", { unit: "%", observed: 1.2, low: -2.1, high: 4.5, target: 0 }),
      metric("time", { unit: "s", observed: 12, low: null, high: null, target: 10 }),
    ];
    const scales = chartScales(metrics, 1000);
    expect([...scales.keys()].sort()).toEqual(["%", "s"]);
    const [lo, hi] = scales.get("%")!.domain();
    expect(lo).toBeLessThan(-2.1);
    expect(hi).toBeGreaterThan(57);
    const [slo, shi] = scales.get("s")!.domain();
    expect(slo).toBeLessThanOrEqual(0);
    expect(shi).toBeGreaterThan(12);
    expect(scales.get("%")!(lo!)).toBe(0);
    expect(scales.get("%")!(hi!)).toBe(1000);
  });

  it("signs percent and point changes, and leaves amounts plain", () => {
    expect(formatChartValue(44, "%")).toBe("+44%");
    expect(formatChartValue(-2.14, "%")).toBe("−2.1%");
    expect(formatChartValue(3, "pts")).toBe("+3 pts");
    expect(formatChartValue(12.5, "s")).toBe("12.5 s");
    expect(formatChartValue(1200, "")).toBe("1,200");
    expect(formatChartValue(0, "%")).toBe("0%");
    expect(formatChartValue(-0.04, "%")).toBe("0%");
  });
});
