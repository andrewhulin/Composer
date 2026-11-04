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

export function recipe(id: RecipeId): Recipe {
  const r = RECIPES[id];
  if (!r) throw new Error(`Recipe ${id} is not available yet`);
  return r;
}
