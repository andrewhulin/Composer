import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { sha256 } from "./sha256";
import { canonicalJson, hashOf } from "./canonical";
import { ulid } from "./ids";

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto for any unicode string", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 300 }), (s) => {
        expect(sha256(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
      }),
      { numRuns: 200 },
    );
  });
});

describe("canonicalJson", () => {
  it("sorts keys and drops undefined so equal values hash equally", () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, undefined] } })).toBe('{"a":{"c":[1,null]},"b":1}');
    expect(hashOf({ x: 1, y: 2 })).toBe(hashOf({ y: 2, x: 1 }));
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
  });
});

describe("ulid", () => {
  it("is 26 chars and sorts by time, monotonic within a millisecond", () => {
    const ids = [ulid(1000), ulid(1000), ulid(1001), ulid(5000)];
    expect(ids.every((id) => id.length === 26)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(4);
  });
});
