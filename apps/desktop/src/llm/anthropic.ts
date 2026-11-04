import Anthropic from "@anthropic-ai/sdk";
import { AbortError, type LlmClient, type LlmRequest, type LlmResult, type StreamHandlers } from "@composer/engine";

/**
 * Claude through the Anthropic SDK, from the webview. The key comes from Keychain at call time;
 * the CSP only lets the webview reach api.anthropic.com. Every request streams, uses adaptive
 * thinking with summaries shown, and opts into the server-side refusal fallback.
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
    const stream = client.beta.messages.stream(
      { ...this.params(req), betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
      { signal: h.signal },
    );
    if (h.onText) stream.on("text", (d) => h.onText!(d));
    if (h.onThinking) stream.on("thinking", (d) => h.onThinking!(d));
    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      if (h.signal.aborted || e instanceof Anthropic.APIUserAbortError) throw new AbortError();
      throw e;
    }
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return {
      text,
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
    const { max_tokens: _omit, ...params } = this.params(req);
    const r = await client.beta.messages.countTokens(params);
    return r.input_tokens;
  }
}
