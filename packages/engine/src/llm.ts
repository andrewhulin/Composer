import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Effort } from "@composer/core";

export interface LlmRequest {
  model: string;
  maxTokens: number;
  effort: Effort;
  system: BetaTextBlockParam[];
  messages: BetaMessageParam[];
  /** JSON schema for structured output. */
  schema?: Record<string, unknown>;
}

export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LlmResult {
  text: string;
  stopReason: string | null;
  /** Explanation when the model declined (stop_reason "refusal"). */
  refusal?: string;
  usage: LlmUsage;
  /** The model that actually answered (differs after a server-side fallback). */
  model: string;
}

export interface StreamHandlers {
  signal: AbortSignal;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
}

/** The engine's view of Claude. The desktop app implements it with the Anthropic SDK; tests use FakeLlm. */
export interface LlmClient {
  stream(req: LlmRequest, handlers: StreamHandlers): Promise<LlmResult>;
  countTokens(req: LlmRequest): Promise<number>;
}

export class AbortError extends Error {
  constructor() {
    super("Run cancelled");
    this.name = "AbortError";
  }
}

export interface FakeTurn {
  /** Text deltas to stream, in order. */
  deltas?: string[];
  thinking?: string[];
  delayMs?: number;
  error?: Error;
  stopReason?: string;
  refusal?: string;
  usage?: Partial<LlmUsage>;
}

/** Scripted LLM for tests and offline demo: replays turns, honours cancellation. */
export class FakeLlm implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private turns: FakeTurn[];

  constructor(turns: FakeTurn[] | ((req: LlmRequest) => FakeTurn)) {
    this.turns = Array.isArray(turns) ? [...turns] : [];
    if (!Array.isArray(turns)) this.next = turns;
  }

  private next: (req: LlmRequest) => FakeTurn = () => this.turns.shift() ?? { deltas: ["ok"] };

  async stream(req: LlmRequest, h: StreamHandlers): Promise<LlmResult> {
    this.requests.push(req);
    const turn = this.next(req);
    const wait = () =>
      new Promise<void>((resolve, reject) => {
        if (h.signal.aborted) return reject(new AbortError());
        const t = setTimeout(resolve, turn.delayMs ?? 0);
        h.signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new AbortError());
        }, { once: true });
      });
    for (const d of turn.thinking ?? []) {
      await wait();
      h.onThinking?.(d);
    }
    let text = "";
    for (const d of turn.deltas ?? []) {
      await wait();
      text += d;
      h.onText?.(d);
    }
    await wait();
    if (turn.error) throw turn.error;
    return {
      text,
      stopReason: turn.stopReason ?? "end_turn",
      ...(turn.refusal ? { refusal: turn.refusal } : {}),
      usage: { input: 100, output: text.length, cacheRead: 0, cacheWrite: 0, ...turn.usage },
      model: req.model,
    };
  }

  async countTokens(req: LlmRequest): Promise<number> {
    return Math.ceil(JSON.stringify([req.system, req.messages]).length / 4);
  }
}
