import { PHASE_INFO, nextPhase, type Phase, type TextArtifact, type Weight } from "@composer/core";
import { docTag, type DocInput } from "./assembly/prompt";
import { splitUnits } from "./assembly/units";
import {
  FIDELITIES,
  statementForm,
  type InsightsData,
  type PrototypeData,
  type StatementData,
  type StatementForm,
  type StoryData,
  type VerdictData,
} from "./recipes";

/**
 * The key node: every workspace ends in exactly one typed output. Its fields are fixed per phase,
 * so the next phase always receives the same shape, and its text is exactly what the next phase's
 * prompt will read.
 */

export interface HandoffField {
  key: string;
  label: string;
  value: string;
  required: boolean;
  /** Longer values show as a paragraph rather than a line. */
  long?: boolean;
}

export interface Handoff {
  phase: Phase;
  /** The output's name, e.g. "Testable statement". */
  title: string;
  fields: HandoffField[];
  /** Required fields that are empty. Lock is blocked until this is empty. */
  missing: string[];
  /** The handoff as the next phase's prompt reads it. */
  text: string;
}

export interface HandoffSchema {
  phase: Phase;
  fields: { key: string; label: string; required: boolean; long?: boolean }[];
}

export const HANDOFF_SCHEMA: Record<Phase, HandoffSchema> = {
  understand: {
    phase: "understand",
    fields: [
      { key: "summary", label: "Summary", required: true, long: true },
      { key: "insights", label: "Insights", required: true, long: true },
      { key: "tensions", label: "Tensions", required: false, long: true },
      { key: "open_questions", label: "Open questions", required: false, long: true },
    ],
  },
  define: {
    phase: "define",
    fields: [
      { key: "believe", label: "We believe", required: true, long: true },
      { key: "whom", label: "For whom", required: true },
      { key: "know_when", label: "We'll know when", required: true, long: true },
      { key: "evidence", label: "Evidence", required: false, long: true },
    ],
  },
  build: {
    phase: "build",
    fields: [
      { key: "title", label: "Prototype", required: true },
      { key: "fidelity", label: "Fidelity", required: true },
      { key: "screens", label: "Screens", required: true },
      { key: "rationale", label: "Why this shape", required: false, long: true },
      { key: "tests", label: "What it tests", required: false, long: true },
    ],
  },
  validate: {
    phase: "validate",
    fields: [
      { key: "verdict", label: "Verdict", required: true },
      { key: "summary", label: "Summary", required: true, long: true },
      { key: "metrics", label: "Metrics", required: true, long: true },
      { key: "next", label: "Next", required: false, long: true },
    ],
  },
  share: {
    phase: "share",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "logline", label: "Logline", required: true, long: true },
      { key: "chapters", label: "Chapters", required: false, long: true },
    ],
  },
};

/** A Define draft: the fixed form, plus the evidence it cites in the designer's words. */
export interface DefineDraft extends StatementForm {
  evidence?: string;
}

const lines = (xs: string[]) => xs.filter(Boolean).join("\n");

function valuesFor(phase: Phase, art: TextArtifact | undefined, draft?: Partial<DefineDraft>): Record<string, string> {
  const data = art?.data;
  switch (phase) {
    case "understand": {
      const d = data as InsightsData | undefined;
      if (!d) return { summary: art?.text ?? "" };
      return {
        summary: d.summary,
        insights: lines(d.insights.map((i, n) => `${n + 1}. ${i.title} (${i.strength}). ${i.detail}`)),
        tensions: lines(d.tensions.map((t) => `- ${t}`)),
        open_questions: lines(d.open_questions.map((q) => `- ${q}`)),
      };
    }
    case "define": {
      const d = data as StatementData | undefined;
      const form = d ? statementForm(d) : { believe: "", whom: "", know_when: "" };
      return {
        believe: draft?.believe ?? form.believe,
        whom: draft?.whom ?? form.whom,
        know_when: draft?.know_when ?? form.know_when,
        evidence: draft?.evidence ?? (d ? lines(d.support.map((s) => `- ${s.label}: ${s.text}`)) : ""),
      };
    }
    case "build": {
      const d = data as PrototypeData | undefined;
      if (!d) return {};
      return {
        title: d.title,
        fidelity: FIDELITIES[d.fidelity] ?? d.fidelity,
        screens: d.screens.map((s) => s.name).join(", "),
        rationale: d.rationale,
        tests: d.tests,
      };
    }
    case "validate": {
      const d = data as VerdictData | undefined;
      if (!d) return {};
      return {
        verdict: d.verdict,
        summary: d.summary,
        metrics: lines(d.metrics.map((m) => `- ${m.kind}: ${m.text} → ${m.observed} (${m.met === "yes" ? "met" : m.met === "no" ? "not met" : "unknown"})`)),
        next: d.next,
      };
    }
    case "share": {
      const d = data as StoryData | undefined;
      if (!d) return {};
      return { title: d.title, logline: d.logline, chapters: lines([`Problem: “${d.problem.quote}” (${d.problem.who})`, `Process: ${d.process.caption}`, `UI: ${d.ui.caption}`, `Proof: ${d.proof.caption}`]) };
    }
  }
}

/** The text the next phase reads. Define writes its fixed form; the rest keep their recipe's render. */
export function handoffText(phase: Phase, values: Record<string, string>, art?: TextArtifact): string {
  if (phase === "define") {
    return lines([
      `We believe: ${values.believe ?? ""}`,
      `For whom: ${values.whom ?? ""}`,
      `We'll know when: ${values.know_when ?? ""}`,
      values.evidence ? `Evidence:\n${values.evidence}` : "",
    ]);
  }
  return art?.text ?? HANDOFF_SCHEMA[phase].fields.map((f) => (values[f.key] ? `${f.label}: ${values[f.key]}` : "")).filter(Boolean).join("\n");
}

/** Builds the key node for a phase from the artifact feeding it and, for Define, the working draft. */
export function toHandoff(phase: Phase, art: TextArtifact | undefined, draft?: Partial<DefineDraft>): Handoff {
  const values = valuesFor(phase, art, draft);
  const fields = HANDOFF_SCHEMA[phase].fields.map((f) => ({ ...f, value: (values[f.key] ?? "").trim() }));
  const missing = fields.filter((f) => f.required && !f.value).map((f) => f.label);
  const text = art?.edited ? art.text : handoffText(phase, values, phase === "define" ? undefined : art);
  return { phase, title: PHASE_INFO[phase].output, fields, missing, text };
}

/** The artifact a writing workspace locks: the designer's draft over Claude's last statement. */
export function defineArtifact(draft: DefineDraft, base?: StatementData): TextArtifact {
  const form: StatementForm = { believe: draft.believe.trim(), whom: draft.whom.trim(), know_when: draft.know_when.trim() };
  const statement = `We believe ${lowerFirst(form.believe)} for ${form.whom}. We'll know when ${lowerFirst(form.know_when)}`;
  const data: StatementData = {
    frame: base?.frame ?? "hypothesis",
    form,
    variants: base?.variants ?? [],
    statement: base && sameForm(statementForm(base), form) ? base.statement : statement,
    parts: base && sameForm(statementForm(base), form) ? base.parts : { who: form.whom, behavior: form.believe, because: "", metric: form.know_when },
    support: base?.support ?? [],
    checks: checkForm(form, base?.checks.heavy_sources ?? []),
    alternates: base?.alternates ?? [],
  };
  const values = { ...form, evidence: draft.evidence ?? lines(data.support.map((s) => `- ${s.label}: ${s.text}`)) };
  return { v: 1, kind: "text", artifact: "testable_statement", text: handoffText("define", values), data };
}

const sameForm = (a: StatementForm, b: StatementForm) => a.believe.trim() === b.believe.trim() && a.whom.trim() === b.whom.trim() && a.know_when.trim() === b.know_when.trim();
const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);

const VAGUE_WHO = /^(users?|people|everyone|customers?|anyone)\b/i;
const MEASURE = /\d|%|percent|rate|time|count|within|per |more than|less than|at least|fewer|double|half/i;

/** Live checks on a draft, so the designer sees what makes it testable while they write. */
export function checkForm(form: StatementForm, heavySources: string[] = []): StatementData["checks"] {
  return {
    testable: form.believe.trim().length > 12 && form.know_when.trim().length > 0,
    specific_user: form.whom.trim().length > 0 && !VAGUE_WHO.test(form.whom.trim()),
    measurable: MEASURE.test(form.know_when),
    heavy_sources: heavySources,
  };
}

/** Where a phase's key node goes: the next phase, the next loop, or out of Composer. */
export function handoffTarget(phase: Phase, verdict?: VerdictData["verdict"]): string {
  if (phase === "share") return "Leaves Composer";
  if (phase === "validate") return verdict === "misses" ? "Loops back to Understand" : verdict === "holds" ? "Goes to Share" : "Share if it holds, Understand if it misses";
  return `Goes to ${PHASE_INFO[nextPhase(phase)!].name}`;
}

/** The next phase's inlet alias for this phase's output, matching the scaffold. */
export const INLET_ALIAS: Record<Phase, string> = { understand: "insights", define: "statement", build: "prototype", validate: "verdict", share: "story" };

/**
 * The handoff as the next phase's prompt will carry it, untrimmed: the exact `<doc>` block. The
 * workspace prefers the block pulled from the next node's live prompt, which also shows trimming.
 */
export function handoffDoc(phase: Phase, text: string, label: string, opts: { weight?: Weight; pinned?: boolean; why?: string } = {}): string {
  const d: DocInput = {
    alias: INLET_ALIAS[phase],
    title: PHASE_INFO[phase].output,
    source: label,
    kind: "note",
    weight: opts.weight ?? "heavy",
    pinned: opts.pinned ?? false,
    ...(opts.why ? { why: opts.why } : {}),
    units: splitUnits(text, "note"),
  };
  return docTag(d, d.units.map((u) => (u.label ? `${u.label}: ${u.text}` : u.text)).join("\n"));
}

/** Pulls one document's block out of an assembled prompt's user text, by alias. */
export function docBlock(promptText: string, alias: string): string | undefined {
  const start = promptText.indexOf(`<doc alias="${alias}"`);
  if (start < 0) return undefined;
  const end = promptText.indexOf("</doc>", start);
  return end < 0 ? undefined : promptText.slice(start, end + "</doc>".length);
}

