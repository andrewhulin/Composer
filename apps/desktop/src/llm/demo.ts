import { FakeLlm, type LlmRequest } from "@composer/engine";

/**
 * Dev-only scripted model for checking the UI without an API key: `pnpm web` then open
 * localhost:1420/?fake. Answers stream through the real engine; nothing here ships in a build.
 */
export function demoLlm(): FakeLlm {
  return new FakeLlm((req: LlmRequest) => {
    const schemaText = JSON.stringify(req.schema ?? {});
    const heavy = (JSON.stringify(req.messages).match(/weight=\\"heavy\\"/g) ?? []).length;
    const proto = {
      title: "Recap: what changed since last time",
      fidelity: /fidelity[^.]*low-fi|a low-fi/i.test(JSON.stringify(req.messages)) ? "lofi" : /high-fi/i.test(JSON.stringify(req.messages)) ? "hifi" : "wireframe",
      html: `<!doctype html><html><head><meta charset="utf-8"><title>Recap</title><style>
body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#f6f5f2;color:#19191c}
main{display:flex;flex-direction:column;gap:16px;padding:56px 20px 24px;min-height:844px;box-sizing:border-box}
h1{font-size:24px;margin:0;line-height:1.2}
.card{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:12px;background:#fff;border:1px solid #e4e1da}
.label{font-size:12px;color:#8a857a;text-transform:uppercase;letter-spacing:.06em}
.item{display:flex;gap:10px;align-items:center;font-size:15px}
.dot{width:8px;height:8px;border-radius:4px;background:#de8a45}
button{margin-top:auto;padding:14px;border:0;border-radius:10px;background:#19191c;color:#fff;font-size:16px}
</style></head><body><main data-screen="Recap">
<span class="label" data-part="who">Welcome back, third session</span>
<h1 data-part="because">Since last time</h1>
<div class="card"><span class="label">What changed</span>
<div class="item"><span class="dot"></span>You named the feeling: “too much to read”</div>
<div class="item"><span class="dot"></span>Two new ideas to try this week</div></div>
<button data-part="behavior">Pick up where we left off</button>
</main></body></html>`,
      screens: [{ name: "Recap", purpose: "Show what changed before chat" }],
      rationale: "One card, three lines: proof of progress without a transcript to read.",
      tests: "Recap opens within 24h rise 40% or more",
    };
    const answer = schemaText.includes('"html"') ? proto : schemaText.includes("insights")
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
