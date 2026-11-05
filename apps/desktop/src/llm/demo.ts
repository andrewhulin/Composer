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
    const strategy = {
      metrics: [
        { kind: "success", text: "Recap opened within 24h · +40% vs control" },
        { kind: "guardrail", text: "Session length does not drop" },
        { kind: "kill", text: "No lift after 2 weeks → back to Understand" },
      ],
      methods: [
        { method: "slack", use: true, plan: "Post the prototype and 3 questions to the design channel", questions: ["Would you open this before chatting?", "What's missing from the recap?", "Too much or too little?"] },
        { method: "360", use: true, plan: "5 sessions · returning users only", questions: ["Walk me through what you'd do first"] },
        { method: "statsig", use: true, plan: "recap_v2 vs control · 50/50 · 14 days", questions: [] },
        { method: "survey", use: false, plan: "Not needed for this hypothesis", questions: [] },
      ],
      decision_rule: "Holds if opens rise 40% with no drop in session length; misses at the kill line.",
    };
    const verdict = {
      verdict: "misses",
      summary: "Opens rose 12%, well short of 40%; people skim past the card.",
      metrics: [
        { kind: "success", text: "Recap opened within 24h · +40%", observed: "+12%", met: "no" },
        { kind: "guardrail", text: "Session length does not drop", observed: "-0.9%", met: "yes" },
      ],
      findings: [{ text: "People skim past a card that looks like content", source: "Slack · 4 replies" }],
      next: "Back to Understand: why is the card skimmed instead of opened?",
    };
    const story = {
      title: "Recap after a session",
      logline: "A short recap waits at the top of the next session, so returning users pick up where they left off.",
      problem: { quote: "What changed since last time? I never know where we left off.", who: "P04 · returning user", context: "Returning users spend their first minutes rebuilding context." },
      process: { caption: "Two loops: the first recap was skimmed, the second was opened." },
      ui: {
        caption: "The recap is the first thing a returning user sees.",
        beats: [
          { part: "who", note: "Returning users see it on their second session" },
          { part: "behavior", note: "They open the recap before chatting" },
          { part: "metric", note: "Opens are tracked within 24 hours" },
        ],
      },
      proof: { caption: "Opens rose without shortening sessions.", metrics: [{ label: "Recap opened within 24h", value: "+44%", target: "+40%", met: "yes" }, { label: "Session length", value: "+1.2%", target: "no drop", met: "yes" }] },
      voiceover: ["Returning users kept asking what changed since last time.", "We ran it twice: the first recap got skimmed, the second got opened.", "Now a short recap waits at the top of the next session.", "Opens rose forty-four percent, and sessions didn't get shorter."],
    };
    const pr = {
      title: "Add a session recap for returning users",
      summary: "Returning users now see a short recap of their last session before they start chatting.",
      before: "Returning users land on an empty chat and rebuild context themselves.",
      after: "A recap card sits at the top of the next session with what changed and what was planned.",
      why: "\"What changed since last time?\" came up in 4 of 6 interviews. In the A/B test, opens within 24h rose 44% with no drop in session length.",
      metric: "Recap opens within 24h, and session length as a guardrail.",
      testing: ["Statsig recap_v2 vs control, 50/50, 14 days", "5 moderated sessions with returning users"],
    };
    const reflection = {
      rules: [{ phase: "define", text: "Quote people verbatim and name who said it; never paraphrase the problem.", why: "Every high-scored statement quoted a participant; every low one summarized.", evidence: ["high runs", "low runs"] }],
      principles: [{ change: "sharpened", n: 2, text: "Apply the essentialism test, and in Define keep the raw quote over the summary.", why: "You kept raw quotes over summaries in three statements." }],
    };
    const answer = schemaText.includes('"principles"') ? reflection : schemaText.includes('"voiceover"') ? story : schemaText.includes('"before"') ? pr : schemaText.includes('"decision_rule"') ? strategy : schemaText.includes('"findings"') ? verdict : schemaText.includes('"html"') ? proto : schemaText.includes("insights")
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
