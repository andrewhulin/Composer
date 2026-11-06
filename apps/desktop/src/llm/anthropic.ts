import Anthropic from "@anthropic-ai/sdk";
import { AbortError, HAIKU, readAdvisor, type LlmClient, type LlmRequest, type LlmResult, type StreamHandlers } from "@composer/engine";

/**
 * Claude through the Anthropic SDK, from the webview. The key comes from Keychain at call time;
 * the CSP only lets the webview reach api.anthropic.com. Every request streams and uses adaptive
 * thinking with summaries shown. Opus and Sonnet opt into the server-side refusal fallback
 * (Haiku 5.5 has none). Sonnet and Haiku runs can carry the advisor tool, consulting Opus.
 */
export class AnthropicLlm implements LlmClient {
  constructor(private readonly apiKey: () => Promise<string | null>) {}

  private async client(): Promise<Anthropic> {
    const key = await this.apiKey();
    if (!key) throw new Error("Add your Anthropic API key in Settings to run Claude nodes.");
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  private params(req: LlmRequest) {
    return {
      model: req.model,
      ...(req.advisor ? { tools: [{ type: "advisor_20260301" as const, name: "advisor" as const, model: req.advisor.model, ...(req.advisor.maxUses ? { max_uses: req.advisor.maxUses } : {}) }] } : {}),
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      thinking: { type: "adaptive" as const, display: "summarized" as const },
      output_config: {
        effort: req.effort,
        ...(req.schema ? { format: { type: "json_schema" as const, schema: req.schema } } : {}),
      },
    };
  }

  async stream(req: LlmRequest, h: StreamHandlers): Promise<LlmResult> {
    const client = await this.client();
    if (h.signal.aborted) throw new AbortError();
    const fallback = req.model !== HAIKU;
    const betas = [...(fallback ? ["server-side-fallback-2026-07-01"] : []), ...(req.advisor ? ["advisor-tool-2026-03-01"] : [])];
    const stream = client.beta.messages.stream({ ...this.params(req), ...(betas.length ? { betas } : {}), ...(fallback ? { fallbacks: "default" as const } : {}) }, { signal: h.signal });
    if (h.onText) stream.on("text", (d) => h.onText!(d));
    if (h.onThinking) stream.on("thinking", (d) => h.onThinking!(d));
    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      if (h.signal.aborted || e instanceof Anthropic.APIUserAbortError) throw new AbortError();
      throw e;
    }
    // With the advisor, the answer is the text after the last consultation; anything before it was thinking aloud.
    const lastAdvice = msg.content.map((b) => b.type).lastIndexOf("advisor_tool_result");
    const text = msg.content
      .slice(lastAdvice + 1)
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");
    const advisor = req.advisor ? readAdvisor(msg.content) : undefined;
    return {
      text,
      ...(advisor ? { advisor } : {}),
      stopReason: msg.stop_reason,
      ...(msg.stop_reason === "refusal" && msg.stop_details?.explanation ? { refusal: msg.stop_details.explanation } : {}),
      usage: {
        input: msg.usage.input_tokens,
        output: msg.usage.output_tokens,
        cacheRead: msg.usage.cache_read_input_tokens ?? 0,
        cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
      },
      model: msg.model,
    };
  }

  async countTokens(req: LlmRequest): Promise<number> {
    const client = await this.client();
    const { max_tokens: _omit, tools: _tools, ...params } = this.params(req);
    const r = await client.beta.messages.countTokens(params);
    return r.input_tokens;
  }
}
