import { describe, expect, it } from "vitest";
import { fillRepeat, fillRow, KIT_DOC, KIT_ATTRIBUTES, samplePath, SAMPLE_DATA } from "./kit";

describe("interaction kit", () => {
  it("fills placeholders and escapes sample values", () => {
    expect(fillRow("<b>{{name}}</b> {{index}} {{missing}}", { name: "A <b>" }, 0)).toBe("<b>A &lt;b&gt;</b> 1 ");
  });

  it("repeats over a set with a limit", () => {
    const out = fillRepeat("<li>{{title}}</li>", "tasks", 2);
    expect(out).toBe(`<li>${SAMPLE_DATA.tasks![0]!.title}</li><li>${SAMPLE_DATA.tasks![1]!.title}</li>`);
    expect(fillRepeat("<li>{{x}}</li>", "nope")).toBe("");
  });

  it("reads one sample by path", () => {
    expect(samplePath("people.0.name")).toBe(SAMPLE_DATA.people![0]!.name);
    expect(samplePath("people.99.name")).toBe("");
    expect(samplePath("bad")).toBe("");
  });

  it("documents every attribute it supports", () => {
    for (const a of KIT_ATTRIBUTES) expect(KIT_DOC).toContain(a);
  });
});
