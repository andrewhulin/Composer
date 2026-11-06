import { describe, expect, it } from "vitest";
import { formatTokens, timeAgo } from "./format";

describe("formatTokens", () => {
  it("formats token counts the way the inspector shows them", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1900)).toBe("1.9k");
    expect(formatTokens(13_600)).toBe("13.6k");
    expect(formatTokens(200_000)).toBe("200k");
    expect(formatTokens(212_400)).toBe("212k");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  it("says how long ago, in the coarsest unit that fits", () => {
    expect(timeAgo("2026-11-06T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-06T11:48:00Z", now)).toBe("12m ago");
    expect(timeAgo("2026-11-06T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-11-05T10:00:00Z", now)).toBe("yesterday");
    expect(timeAgo("2026-11-02T12:00:00Z", now)).toBe("4d ago");
    expect(timeAgo("2026-10-28T12:00:00Z", now)).toBe("Oct 28");
    expect(timeAgo("2025-10-28T12:00:00Z", now)).toBe("Oct 28, 2025");
  });
});
