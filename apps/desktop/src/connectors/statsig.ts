import { ulid, type ContextItem } from "@composer/core";
import { httpJson } from "./http";
import { SECRET } from "../platform/secrets";
import type { Connector } from "./types";

export interface PulseMetric {
  metricID: string;
  percent_change?: number | null;
  percent_confidence_interval?: { lower: number; upper: number } | null;
  p_value?: number | null;
  test_mean?: number | null;
  control_mean?: number | null;
  test_units?: number | null;
  control_units?: number | null;
}

const pct = (n: number | null | undefined) => (n == null ? "?" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

/** Pulse results as data items: one per metric, with the change, its interval and p-value in words. */
export function parsePulse(experiment: string, primary: PulseMetric[], secondary: PulseMetric[]): ContextItem[] {
  const line = (m: PulseMetric, role: string) => {
    const ci = m.percent_confidence_interval ? ` (CI ${pct(m.percent_confidence_interval.lower)} to ${pct(m.percent_confidence_interval.upper)})` : "";
    const p = m.p_value == null ? "" : `, p=${m.p_value.toFixed(3)}`;
    const n = m.test_units != null && m.control_units != null ? `, n=${m.test_units} test vs ${m.control_units} control` : "";
    return { text: `${m.metricID.replace(/::.*$/, "")}: ${pct(m.percent_change)}${ci}${p}${n}`, label: role };
  };
  return [
    {
      id: ulid(),
      kind: "data",
      title: `Statsig · ${experiment}`,
      units: [...primary.map((m) => line(m, "primary")), ...secondary.map((m) => line(m, "secondary"))],
    },
  ];
}

export const statsig: Connector = {
  platform: "statsig",
  label: "Statsig",
  secret: SECRET.statsig,
  tokenRequired: true,
  tokenHelp: "Statsig → Project settings → Keys & environments → Console API key",
  match(url) {
    if (!/(^|\.)statsig\.com$/.test(url.hostname)) return;
    const m = /\/experiments\/([^/?#]+)/.exec(url.pathname);
    return m ? { experiment: decodeURIComponent(m[1]!) } : undefined;
  },
  async fetch(config, token) {
    if (!token) throw new Error("Add a Statsig Console API key in Settings (⌘,) to read results.");
    const headers = { "STATSIG-API-KEY": token };
    const exp = await httpJson<{ data: { name?: string; groups?: { id: string; name: string; isControl?: boolean }[] } }>(
      `https://statsigapi.net/console/v1/experiments/${encodeURIComponent(config.experiment!)}`,
      { headers },
    );
    const groups = exp.data.groups ?? [];
    const control = groups.find((g) => g.isControl) ?? groups[0];
    const test = groups.find((g) => g !== control);
    if (!control || !test) throw new Error("Statsig: this experiment needs a control and a test group.");
    const res = await httpJson<{ data: { primaryMetrics?: PulseMetric[]; secondaryMetrics?: PulseMetric[] } }>(
      `https://statsigapi.net/console/v1/experiments/${encodeURIComponent(config.experiment!)}/pulse_results?control=${encodeURIComponent(control.id)}&test=${encodeURIComponent(test.id)}`,
      { headers },
    );
    const name = exp.data.name ?? config.experiment!;
    return {
      title: `Statsig · ${name} (${test.name} vs ${control.name})`,
      content: { v: 1, kind: "context", items: parsePulse(name, res.data.primaryMetrics ?? [], res.data.secondaryMetrics ?? []), syncedAt: new Date().toISOString() },
      config,
    };
  },
};
