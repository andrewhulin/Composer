import { describe, expect, it } from "vitest";
import { coverOf, headline } from "./cover";

const text = (t: string, data?: unknown) => ({ v: 1, kind: "text", artifact: "x", text: t, ...(data ? { data } : {}) });

describe("Home card covers", () => {
  it("reads the first real line, without markdown or a label", () => {
    expect(headline("## Verdict: misses\nOpens rose 12%")).toBe("misses");
    expect(headline("\n- **We believe** open the recap")).toBe("We believe open the recap");
    expect(headline("x".repeat(200), 20)).toHaveLength(20);
  });

  it("prefers a prototype, then the newest locked output, then nothing", () => {
    const blobs = new Map<string, unknown>([
      ["p", text("Prototype", { html: "<html>recap</html>" })],
      ["v", text("We believe: open the recap because it shows what changed")],
      ["empty", text("Prototype", { html: "  " })],
    ]);
    const latest = { phase: "define" as const, contentHash: "v", createdAt: "2026-11-06" };
    expect(coverOf({ prototypeHash: "p", latest }, blobs)).toEqual({ kind: "prototype", hash: "p", html: "<html>recap</html>" });
    expect(coverOf({ prototypeHash: "empty", latest }, blobs)).toEqual({ kind: "text", phase: "define", text: "open the recap because it shows what changed" });
    expect(coverOf({ latest: { ...latest, contentHash: "missing" } }, blobs)).toBeNull();
    expect(coverOf(undefined, blobs)).toBeNull();
  });
});
