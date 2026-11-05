import { describe, expect, it } from "vitest";
import type { TextArtifact } from "@composer/core";
import { checkForm, defineArtifact, docBlock, handoffDoc, handoffTarget, toHandoff } from "./handoff";
import { RECIPES, statementForm, type StatementData } from "./recipes";

const statement: StatementData = {
  frame: "hypothesis",
  statement: "We believe returning users will open the recap if it shows what changed.",
  parts: { who: "returning users", behavior: "open the recap", because: "it shows what changed", metric: "recap opens within 24h rise 40%" },
  support: [{ label: "P07", text: "I forget where we left off." }],
  checks: { testable: true, specific_user: true, measurable: true, heavy_sources: ["interviews"] },
  alternates: [],
};
const art = (data: unknown, artifact = "testable_statement"): TextArtifact => ({ v: 1, kind: "text", artifact, text: "rendered", data });

describe("key node handoffs", () => {
  it("fills Define's fixed form from older statements that predate it", () => {
    const f = statementForm(statement);
    expect(f).toEqual({ believe: "open the recap because it shows what changed", whom: "returning users", know_when: "recap opens within 24h rise 40%" });
  });

  it("prefers the designer's draft and blocks lock on empty required fields", () => {
    const h = toHandoff("define", art(statement), { believe: "they'll open it", whom: "" });
    expect(h.fields.find((x) => x.key === "believe")!.value).toBe("they'll open it");
    expect(h.missing).toEqual(["For whom"]);
    expect(h.text).toContain("We believe: they'll open it");
    expect(h.text).toContain("Evidence:\n- P07: I forget where we left off.");
  });

  it("keeps the recipe's render for canvas phases, and an edited handoff verbatim", () => {
    const proto = { title: "Recap", fidelity: "wireframe", html: "<p/>", screens: [{ name: "Home", purpose: "x" }], rationale: "r", tests: "t" };
    const h = toHandoff("build", art(proto, "prototype"));
    expect(h.missing).toEqual([]);
    expect(h.text).toBe("rendered");
    expect(h.fields.find((x) => x.key === "fidelity")!.value).toBe("Wireframe");
    expect(toHandoff("build", { ...art(proto, "prototype"), text: "hand edit", edited: true }).text).toBe("hand edit");
    expect(toHandoff("validate", undefined).missing).toContain("Verdict");
  });

  it("locks a draft written without Claude", () => {
    const a = defineArtifact({ believe: "A one-line recap on open brings people back", whom: "Returning designers on their third session", know_when: "Recap opens rise 40% within 7 days" });
    const d = a.data as StatementData;
    expect(d.form!.whom).toBe("Returning designers on their third session");
    expect(d.checks).toMatchObject({ testable: true, specific_user: true, measurable: true });
    expect(a.text.split("\n").slice(0, 3)).toEqual([
      "We believe: A one-line recap on open brings people back",
      "For whom: Returning designers on their third session",
      "We'll know when: Recap opens rise 40% within 7 days",
    ]);
  });

  it("keeps Claude's statement when the draft is unchanged", () => {
    const base = { ...statement, form: { believe: "b", whom: "w", know_when: "k" } };
    expect((defineArtifact({ believe: "b", whom: "w", know_when: "k" }, base).data as StatementData).statement).toBe(statement.statement);
  });

  it("checks a form live", () => {
    expect(checkForm({ believe: "they will", whom: "users", know_when: "they like it" })).toMatchObject({ testable: false, specific_user: false, measurable: false });
  });

  it("previews the exact doc block the next phase reads", () => {
    const doc = handoffDoc("define", "We believe: x\nFor whom: y", "Define v2");
    expect(doc).toBe('<doc alias="statement" title="Testable statement" source="Define v2" weight="heavy">\nWe believe: x\nFor whom: y\n</doc>');
    expect(docBlock(`before ${doc} after`, "statement")).toBe(doc);
    expect(docBlock("nothing", "statement")).toBeUndefined();
  });

  it("names where each handoff goes", () => {
    expect(handoffTarget("define")).toBe("Goes to Build");
    expect(handoffTarget("validate", "misses")).toBe("Loops back to Understand");
    expect(handoffTarget("share")).toBe("Leaves Composer");
  });

  it("asks for the fixed form and variants in the statement schema", () => {
    const props = (RECIPES.draft_statement!.schema as { properties: Record<string, unknown>; required: string[] });
    expect(props.required).toEqual(expect.arrayContaining(["form", "variants"]));
    expect(RECIPES.draft_statement!.render!({ ...statement, form: { believe: "b", whom: "w", know_when: "k" } })).toContain("For whom: w");
  });
});
