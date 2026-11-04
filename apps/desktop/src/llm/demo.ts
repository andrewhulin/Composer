import { FakeLlm, type LlmRequest } from "@composer/engine";

/**
 * Dev-only scripted model for checking the UI without an API key: `pnpm web` then open
 * localhost:1420/?fake. Answers stream through the real engine; nothing here ships in a build.
 */
export function demoLlm(): FakeLlm {
  return new FakeLlm((req: LlmRequest) => {
    const schemaText = JSON.stringify(req.schema ?? {});
    const heavy = (JSON.stringify(req.messages).match(/weight=\\"heavy\\"/g) ?? []).length;
    const answer = schemaText.includes("insights")
      ? {
          summary: `Returning people lose the thread between sessions and want proof of progress, not a transcript. (${heavy} heavy sources)`,
          insights: [
            { title: "People re-explain context every session", detail: "Three of five interviewees restart from zero.", strength: "strong", evidence: [{ quote: "I forget where we left off.", source: "P07 · 14:22" }] },
            { title: "A wall of text reads as homework", detail: "Long summaries are skipped.", strength: "moderate", evidence: [{ quote: "Too much to read.", source: "P04" }] },
          ],
          tensions: ["Wanting a recap vs. not wanting more to read"],
          open_questions: ["Does a recap need to be visible before chat?"],
        }
      : {
          frame: "hypothesis",
          statement: "We believe returning users will open the recap if it shows what changed since their last session. We will know when recap opens within 24h rise 40% or more.",
          parts: { who: "returning users", behavior: "open the recap", because: "shows what changed since their last session", metric: "recap opens within 24h rise 40% or more" },
          support: [
            { label: "Who", text: "people on their third session or later." },
            { label: "Evidence", text: "P04, P07 and P11 asked what was covered last time." },
          ],
          checks: { testable: true, specific_user: true, measurable: true, heavy_sources: ["insights", "interviews"] },
          alternates: [{ frame: "hmw", statement: "How might we make coming back feel like picking up, not starting over?" }],
        };
    const json = JSON.stringify(answer);
    const deltas = json.match(/.{1,24}/g) ?? [json];
    return { thinking: ["Weighing the heavy interviews first. ", "Holding it against the active hypothesis."], deltas, delayMs: 25 };
  });
}
