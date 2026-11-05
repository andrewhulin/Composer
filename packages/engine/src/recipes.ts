import type { Effort, Phase, RecipeId } from "@composer/core";

export interface Recipe {
  id: RecipeId;
  phase: Phase;
  title: string;
  /** Artifact contract the result satisfies, e.g. "weighted_context". */
  artifact: string;
  effort: Effort;
  charter: string;
  defaultInstruction: string;
  /** JSON schema for structured output, when the recipe returns data rather than prose. */
  schema?: Record<string, unknown>;
  /** Turns structured data into the readable text that flows downstream and shows in previews. */
  render?: (data: unknown) => string;
}

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const str = { type: "string" };
const arr = (items: unknown) => ({ type: "array", items });

export const FRAMES = {
  hypothesis: "Hypothesis",
  problem_statement: "Problem statement",
  hmw: "How might we",
  user_statement: "User statement",
} as const;
export type Frame = keyof typeof FRAMES;

export interface InsightsData {
  summary: string;
  insights: { title: string; detail: string; strength: "strong" | "moderate" | "weak"; evidence: { quote: string; source: string }[] }[];
  tensions: string[];
  open_questions: string[];
}

export interface StatementData {
  frame: Frame;
  statement: string;
  parts: { who: string; behavior: string; because: string; metric: string };
  support: { label: string; text: string }[];
  checks: { testable: boolean; specific_user: boolean; measurable: boolean; heavy_sources: string[] };
  alternates: { frame: Frame; statement: string }[];
}

export const FIDELITIES = { lofi: "Low-fi", wireframe: "Wireframe", hifi: "High-fi" } as const;
export type Fidelity = keyof typeof FIDELITIES;

export interface PrototypeData {
  title: string;
  fidelity: Fidelity;
  /** One self-contained HTML document: inline CSS and JS, no network. */
  html: string;
  screens: { name: string; purpose: string }[];
  rationale: string;
  tests: string;
}

const FIDELITY_RULES = `Fidelity rules:
- lofi: grayscale only, boxes and labels, system font, no imagery. It answers "what goes where".
- wireframe: real copy from the evidence, real structure and states, a neutral palette, no brand styling.
- hifi: the finished visual design. Use the design system's tokens as CSS custom properties when one is slotted; otherwise a restrained, considered style. Include hover, pressed and empty states.`;

export const RECIPES: Partial<Record<RecipeId, Recipe>> = {
  synthesize_insights: {
    id: "synthesize_insights",
    phase: "understand",
    title: "Synthesize insights",
    artifact: "weighted_context",
    effort: "high",
    charter:
      "This phase collects everything, unfiltered, then weighs it. Its one output is weighted context: the insights the next phase should listen to, each tied to raw evidence. Weigh evidence the way the designer did: heavy documents dominate, light ones only colour.",
    defaultInstruction:
      "Synthesize every wired document into the insights that matter for this problem. Quote people directly, name who said it, and keep each insight tied to its evidence.",
    schema: obj({
      summary: str,
      insights: arr(
        obj({
          title: str,
          detail: str,
          strength: { type: "string", enum: ["strong", "moderate", "weak"] },
          evidence: arr(obj({ quote: str, source: str })),
        }),
      ),
      tensions: arr(str),
      open_questions: arr(str),
    }),
    render: (data) => {
      const d = data as InsightsData;
      const lines = [d.summary, ""];
      d.insights.forEach((i, n) => {
        lines.push(`${n + 1}. ${i.title} (${i.strength})`, `   ${i.detail}`);
        for (const e of i.evidence) lines.push(`   “${e.quote}” · ${e.source}`);
      });
      if (d.tensions.length) lines.push("", "Tensions:", ...d.tensions.map((t) => `- ${t}`));
      if (d.open_questions.length) lines.push("", "Open questions:", ...d.open_questions.map((q) => `- ${q}`));
      return lines.join("\n").trim();
    },
  },
  draft_statement: {
    id: "draft_statement",
    phase: "define",
    title: "Draft statement",
    artifact: "testable_statement",
    effort: "high",
    charter:
      "This phase aligns on something testable. Its one output is a testable statement in the frame the designer picked: a hypothesis (We believe [who] will [behavior] if [because]. We will know when [metric].), a problem statement, a How might we, or a user statement. It must be specific about who, measurable, and traceable to the heavy evidence.",
    defaultInstruction:
      "Draft one {frame} from {insights}. Hold it against the active hypothesis if one is wired. Quote people directly. Then draft two alternates in other frames.",
    schema: obj({
      frame: { type: "string", enum: Object.keys(FRAMES) },
      statement: str,
      parts: obj({ who: str, behavior: str, because: str, metric: str }),
      support: arr(obj({ label: str, text: str })),
      checks: obj({
        testable: { type: "boolean" },
        specific_user: { type: "boolean" },
        measurable: { type: "boolean" },
        heavy_sources: arr(str),
      }),
      alternates: arr(obj({ frame: { type: "string", enum: Object.keys(FRAMES) }, statement: str })),
    }),
    render: (data) => {
      const d = data as StatementData;
      return [
        `${FRAMES[d.frame]}: ${d.statement}`,
        ...d.support.map((s) => `${s.label}: ${s.text}`),
        d.parts.metric ? `Metric: ${d.parts.metric}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
};

RECIPES.prototype = {
  id: "prototype",
  phase: "build",
  title: "Prototype",
  artifact: "prototype",
  effort: "high",
  charter: `This phase reaches a prototype at any fidelity. Its one output is a working prototype that tests the locked statement, plus why it is shaped that way.

Return one complete, self-contained HTML document: inline <style> and <script> only, no external requests, no frameworks, no web fonts. Frame it as a phone screen (390 × 844) unless the statement is clearly about desktop. Mark each top-level screen with data-screen="Name", and put data-part="who|behavior|because|metric" on the elements that carry that part of the hypothesis. Use real words from the evidence, never lorem ipsum.

${FIDELITY_RULES}`,
  defaultInstruction: "Build a {fidelity} prototype that tests {statement}. Hold it against the active hypothesis if one is wired. Show the moment the hypothesis is about, and nothing that doesn't serve it.",
  schema: obj({
    title: str,
    fidelity: { type: "string", enum: Object.keys(FIDELITIES) },
    html: str,
    screens: arr(obj({ name: str, purpose: str })),
    rationale: str,
    tests: str,
  }),
  render: (data) => {
    const d = data as PrototypeData;
    return [`Prototype (${FIDELITIES[d.fidelity] ?? d.fidelity}): ${d.title}`, `Screens: ${d.screens.map((s) => `${s.name} (${s.purpose})`).join("; ")}`, `Why: ${d.rationale}`, `Tests: ${d.tests}`].join("\n");
  },
};

export type MetricKind = "success" | "guardrail" | "kill";
export const METHODS = { slack: "Internal feedback · Slack", "360": "360 testing", statsig: "A/B test · Statsig", survey: "Unmoderated survey" } as const;
export type Method = keyof typeof METHODS;
/** Display order; object keys alone would put "360" first. */
export const METHOD_ORDER: Method[] = ["slack", "360", "statsig", "survey"];

export interface StrategyData {
  metrics: { kind: MetricKind; text: string }[];
  methods: { method: Method; use: boolean; plan: string; questions: string[] }[];
  decision_rule: string;
}

export interface VerdictData {
  verdict: "holds" | "misses" | "inconclusive";
  summary: string;
  metrics: { kind: MetricKind; text: string; observed: string; met: "yes" | "no" | "unknown" }[];
  findings: { text: string; source: string }[];
  next: string;
}

RECIPES.test_strategy = {
  id: "test_strategy",
  phase: "validate",
  title: "Test strategy",
  artifact: "test_strategy",
  effort: "high",
  charter:
    "This phase crafts the test strategy and reaches a verdict. This step writes the strategy: success metrics tied to the hypothesis, guardrails that must not get worse, a kill criterion that sends the work back to Understand, and the cheapest methods that can prove or disprove it. Methods available: internal feedback in Slack, 360 user sessions, an A/B test in Statsig, an unmoderated survey. Only switch on the methods this hypothesis needs.",
  defaultInstruction: "Write the test strategy for {prototype}, held against the active hypothesis. Name one success metric with its threshold, the guardrails, and the kill criterion. For each method, say whether to use it, the plan, and the exact questions to ask.",
  schema: obj({
    metrics: arr(obj({ kind: { type: "string", enum: ["success", "guardrail", "kill"] }, text: str })),
    methods: arr(obj({ method: { type: "string", enum: METHOD_ORDER }, use: { type: "boolean" }, plan: str, questions: arr(str) })),
    decision_rule: str,
  }),
  render: (data) => {
    const d = data as StrategyData;
    return [
      ...d.metrics.map((m) => `${m.kind}: ${m.text}`),
      ...d.methods.filter((m) => m.use).map((m) => `${METHODS[m.method]}: ${m.plan}`),
      `Decision: ${d.decision_rule}`,
    ].join("\n");
  },
};

RECIPES.verdict = {
  id: "verdict",
  phase: "validate",
  title: "Verdict",
  artifact: "verdict",
  effort: "high",
  charter:
    "This step reaches the verdict. Hold the evidence (feedback threads, session notes, experiment results) against the strategy's metrics. The hypothesis holds only if the success metric is met and no guardrail broke; it misses if the kill criterion is met or the success metric clearly failed; otherwise it is inconclusive and you say exactly what evidence is missing. Quote people and numbers; never round a miss into a hold.",
  defaultInstruction: "Reach a verdict on the active hypothesis from {strategy} and the evidence wired in. For each metric say what was observed and whether it was met. List the findings that should feed the next loop if it misses.",
  schema: obj({
    verdict: { type: "string", enum: ["holds", "misses", "inconclusive"] },
    summary: str,
    metrics: arr(obj({ kind: { type: "string", enum: ["success", "guardrail", "kill"] }, text: str, observed: str, met: { type: "string", enum: ["yes", "no", "unknown"] } })),
    findings: arr(obj({ text: str, source: str })),
    next: str,
  }),
  render: (data) => {
    const d = data as VerdictData;
    return [
      `Verdict: ${d.verdict}. ${d.summary}`,
      ...d.metrics.map((m) => `${m.kind} · ${m.text} → ${m.observed} (${m.met === "yes" ? "met" : m.met === "no" ? "not met" : "unknown"})`),
      ...d.findings.map((f) => `Finding: ${f.text} (${f.source})`),
      `Next: ${d.next}`,
    ].join("\n");
  },
};

export type Part = "who" | "behavior" | "because" | "metric";

export interface StoryData {
  title: string;
  logline: string;
  problem: { quote: string; who: string; context: string };
  process: { caption: string };
  ui: { caption: string; beats: { part: Part; note: string }[] };
  proof: { caption: string; metrics: { label: string; value: string; target: string; met: "yes" | "no" | "unknown" }[] };
  /** One spoken line per chapter: problem, process, UI, proof. */
  voiceover: string[];
}

export interface PrData {
  title: string;
  summary: string;
  before: string;
  after: string;
  why: string;
  metric: string;
  testing: string[];
}

export const CHAPTERS = ["The problem", "The process", "The UI", "The proof"] as const;

RECIPES.release_story = {
  id: "release_story",
  phase: "share",
  title: "Release story",
  artifact: "release_story",
  effort: "high",
  charter:
    "This phase shares what shipped. It is the only way out of Composer. This step scripts a short release video in four chapters: the problem (the single most telling quote, verbatim, with who said it), the process (one line over the real graph rebuilding itself), the UI (the moments of the prototype that carry the hypothesis, in order), and the proof (the metrics against their targets, exactly as validated). Write for people who weren't in the room. Every claim must trace to a locked output; never invent a number or a quote.",
  defaultInstruction: "Script the release story from {verdict} and the locked outputs in memory. Pick the quote that makes the problem obvious. Walk the prototype beat by beat. Show the proof with real numbers. Write one voiceover line per chapter, under 22 words each.",
  schema: obj({
    title: str,
    logline: str,
    problem: obj({ quote: str, who: str, context: str }),
    process: obj({ caption: str }),
    ui: obj({ caption: str, beats: arr(obj({ part: { type: "string", enum: ["who", "behavior", "because", "metric"] }, note: str })) }),
    proof: obj({ caption: str, metrics: arr(obj({ label: str, value: str, target: str, met: { type: "string", enum: ["yes", "no", "unknown"] } })) }),
    voiceover: arr(str),
  }),
  render: (data) => {
    const d = data as StoryData;
    return [
      `${d.title}: ${d.logline}`,
      `Problem: "${d.problem.quote}" (${d.problem.who}). ${d.problem.context}`,
      `Process: ${d.process.caption}`,
      `UI: ${d.ui.caption}`,
      ...d.ui.beats.map((b, i) => `  ${i + 1}. [${b.part}] ${b.note}`),
      `Proof: ${d.proof.caption}`,
      ...d.proof.metrics.map((m) => `  ${m.label}: ${m.value} (target ${m.target}, ${m.met === "yes" ? "met" : m.met === "no" ? "not met" : "unknown"})`),
    ].join("\n");
  },
};

RECIPES.pr_description = {
  id: "pr_description",
  phase: "share",
  title: "PR description",
  artifact: "pr_description",
  effort: "medium",
  charter:
    "This step writes the pull request that ships the change. Reviewers need the before and after, why it's worth doing (the hypothesis and the evidence), the metric to watch after merge, and how it was tested. Plain, specific, no marketing. Every claim must trace to a locked output.",
  defaultInstruction: "Write the PR description for the work in {story}. Title under 70 characters. Say what changes for the user, why (with the quote and the number that convinced us), and what to watch after merge.",
  schema: obj({ title: str, summary: str, before: str, after: str, why: str, metric: str, testing: arr(str) }),
  render: (data) => prMarkdown(data as PrData),
};

/** The PR body as GitHub markdown. */
export function prMarkdown(d: PrData): string {
  return [
    d.summary,
    "",
    "## Before → after",
    `- **Before:** ${d.before}`,
    `- **After:** ${d.after}`,
    "",
    "## Why",
    d.why,
    "",
    "## Watch after merge",
    d.metric,
    ...(d.testing.length ? ["", "## Tested", ...d.testing.map((t) => `- ${t}`)] : []),
  ].join("\n");
}

export function recipe(id: RecipeId): Recipe {
  const r = RECIPES[id];
  if (!r) throw new Error(`Recipe ${id} is not available yet`);
  return r;
}
