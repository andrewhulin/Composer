import { useState } from "react";
import type { Id } from "@composer/core";
import { FRAMES, type Frame, type StatementData } from "@composer/engine";
import { Check, X } from "lucide-react";
import { actions } from "../../store/project";
import { Badge, Button, Icon, Tabs } from "../primitives";
import styles from "./StatementCard.module.css";

const PART_TONE = { who: "define", behavior: "build", because: "understand", metric: "validate" } as const;

/** Wraps each part of the statement where it appears in the sentence, colored as in Figma 07 · Define. */
function Highlighted({ text, parts }: { text: string; parts: StatementData["parts"] }) {
  const marks = (Object.keys(PART_TONE) as (keyof typeof PART_TONE)[])
    .map((k) => ({ k, s: parts[k]?.trim() }))
    .filter((m) => m.s && text.toLowerCase().includes(m.s.toLowerCase()))
    .map((m) => ({ ...m, at: text.toLowerCase().indexOf(m.s!.toLowerCase()) }))
    .sort((a, b) => a.at - b.at);
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const m of marks) {
    if (m.at < i) continue;
    out.push(text.slice(i, m.at));
    out.push(
      <span key={m.k} className={styles[PART_TONE[m.k]]}>
        {text.slice(m.at, m.at + m.s!.length)}
      </span>,
    );
    i = m.at + m.s!.length;
  }
  out.push(text.slice(i));
  return <p className={styles.sentence}>{out}</p>;
}

/**
 * The testable statement: frame tabs, the sentence with its parts colored, checks, alternates,
 * Compare and Lock. Picking another frame changes what the Define node drafts next run.
 */
export function StatementCard({ data, claudeId, outputId, frame }: { data: StatementData; claudeId?: Id; outputId?: Id; frame: Frame }) {
  const [compare, setCompare] = useState(false);
  const checks = [
    { ok: data.checks.testable, label: "Testable" },
    { ok: data.checks.specific_user, label: "Specific user" },
    { ok: data.checks.measurable, label: "Measurable" },
    { ok: data.checks.heavy_sources.length > 0, label: `Traces to ${data.checks.heavy_sources.length} heavy ${data.checks.heavy_sources.length === 1 ? "node" : "nodes"}` },
  ];
  return (
    <div className={styles.card}>
      <Tabs
        label="Frame"
        variant="segmented"
        size="sm"
        block
        value={frame}
        onChange={(f) => claudeId && actions.update(claudeId, { options: { frame: f } })}
        items={(Object.keys(FRAMES) as Frame[]).map((f) => ({
          value: f,
          label: <span title={claudeId ? `Draft a ${FRAMES[f].toLowerCase()} next run` : undefined}>{FRAMES[f]}</span>,
        }))}
      />
      <div className={styles.paper}>
        <Highlighted text={data.statement} parts={data.parts} />
      </div>
      <div className={styles.chips}>
        {(Object.keys(PART_TONE) as (keyof typeof PART_TONE)[]).map((k) => (
          <span key={k} className={styles.part} data-phase={PART_TONE[k]} title={data.parts[k]}>
            <Badge tone="phase" mono>
              {k}
            </Badge>
          </span>
        ))}
      </div>
      <div className={styles.checks}>
        {checks.map((c) => (
          <span key={c.label} className={c.ok ? styles.ok : styles.miss}>
            <Icon icon={c.ok ? Check : X} size="sm" label={c.ok ? "Yes" : "No"} />
            {c.label}
          </span>
        ))}
      </div>
      {data.support.length > 0 && (
        <div className={styles.support}>
          {data.support.map((s) => (
            <p key={s.label}>
              <span>{s.label}:</span> {s.text}
            </p>
          ))}
        </div>
      )}
      {compare && (
        <div className={styles.alternates}>
          {data.alternates.map((a, i) => (
            <p key={i}>
              <span>{FRAMES[a.frame] ?? a.frame}</span>
              {a.statement}
            </p>
          ))}
        </div>
      )}
      <div className={styles.footer}>
        <p className={styles.alt}>
          {data.alternates.length} alternate{data.alternates.length === 1 ? "" : "s"} drafted
          {data.alternates[0] ? ` · ${FRAMES[data.alternates[0].frame] ?? ""}: “${data.alternates[0].statement}”` : ""}
        </p>
        {data.alternates.length > 0 && (
          <Button variant="secondary" onClick={() => setCompare(!compare)}>
            {compare ? "Hide" : "Compare"}
          </Button>
        )}
        {outputId && (
          <Button variant="primary" onClick={() => void actions.lockStatement(outputId)} data-tour="lock-statement">
            Lock {frame === "hypothesis" ? "hypothesis" : FRAMES[frame].toLowerCase()}
          </Button>
        )}
      </div>
    </div>
  );
}
