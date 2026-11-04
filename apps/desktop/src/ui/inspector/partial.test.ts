import { describe, expect, it } from "vitest";
import { countKey, partialField } from "./partial";

describe("partialField", () => {
  it("reads a field from JSON that is still arriving", () => {
    expect(partialField('{"frame":"hypothesis","statement":"Returning users can\\u2019t see wh', "statement")).toBe("Returning users can’t see wh");
    expect(partialField('{"frame":"hyp', "statement")).toBeUndefined();
    expect(countKey('{"insights":[{"title":"a"},{"title":"b"', "title")).toBe(2);
  });
});
