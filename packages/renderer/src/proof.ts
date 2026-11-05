import { format } from "d3-format";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import type { Metric, MetricChart } from "./story";

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** A metric's chart, when it has a usable observed value. */
export function chartOf(m: Metric): MetricChart | null {
  return m.chart && finite(m.chart.observed) ? m.chart : null;
}

/**
 * One x scale per unit, so metrics measured the same way share an axis and can be compared.
 * Each covers zero, every observed value, range end and target, with a little room either side.
 */
export function chartScales(metrics: Metric[], width: number): Map<string, ScaleLinear<number, number>> {
  const values = new Map<string, number[]>();
  for (const m of metrics) {
    const c = chartOf(m);
    if (!c) continue;
    const list = values.get(c.unit) ?? [0];
    list.push(c.observed, ...[c.low, c.high, c.target].filter(finite));
    values.set(c.unit, list);
  }
  const scales = new Map<string, ScaleLinear<number, number>>();
  for (const [unit, list] of values) {
    const lo = Math.min(...list);
    const hi = Math.max(...list);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
    scales.set(unit, scaleLinear().domain([lo - pad, hi + pad]).nice().range([0, width]));
  }
  return scales;
}

/** Percent and point changes carry a sign; amounts like seconds don't unless they're negative. */
export function formatChartValue(value: number, unit: string): string {
  // Zero, and anything that rounds to it, is no change: no sign either way.
  const v = Math.abs(value) < 0.05 ? 0 : value;
  const signed = (unit === "%" || unit === "pts") && v !== 0;
  const text = format(signed ? "+,.1~f" : ",.1~f")(v);
  return unit === "%" ? `${text}%` : unit ? `${text} ${unit}` : text;
}
