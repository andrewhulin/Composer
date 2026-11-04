import { describe, expect, it } from "vitest";
import { formatTokens } from "./format";

describe("formatTokens", () => {
  it("formats token counts the way the inspector shows them", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1900)).toBe("1.9k");
    expect(formatTokens(13_600)).toBe("13.6k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(212_400)).toBe("212k");
  });
});
