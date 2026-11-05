import { describe, expect, it } from "vitest";
import { referenceContent } from "./reference-content";

const info = {
  duration: 10,
  width: 1080,
  height: 1350,
  fps: 30,
  cuts: [2.4, 5, 7.5],
  frames: [
    { file: "/tmp/ref/frame-00.jpg", t: 1.2, image: "data:image/jpeg;base64,AAA" },
    { file: "/tmp/ref/frame-01.jpg", t: 6.25, image: "data:image/jpeg;base64,BBB" },
    { file: "/tmp/ref/frame-02.jpg", t: 9 },
  ],
};

describe("referenceContent", () => {
  it("leads with the rhythm in words, so Claude reads the pacing before the stills", () => {
    const [rhythm] = referenceContent("launch.mp4", info).items;
    expect(rhythm!.title).toBe("Reference · launch.mp4");
    expect(rhythm!.units.map((u) => u.text)).toEqual(["Length 10.0 s · 1080×1350 · 30 fps.", "4 shots. Median shot 2.5 s, shortest 2.4 s, longest 2.6 s.", "Cuts at 2.4 s, 5.0 s, 7.5 s."]);
  });

  it("turns each still into an image Claude sees, labelled with its moment and shot", () => {
    const stills = referenceContent("launch.mp4", info).items.slice(1);
    expect(stills.map((s) => [s.title, s.image])).toEqual([
      ["Frame at 1.2 s · shot 1 of 4", "data:image/jpeg;base64,AAA"],
      ["Frame at 6.3 s · shot 3 of 4", "data:image/jpeg;base64,BBB"],
    ]);
  });

  it("drops shot numbers for a single continuous shot", () => {
    const stills = referenceContent("one.mov", { ...info, cuts: [] }).items.slice(1);
    expect(stills[0]!.title).toBe("Frame at 1.2 s");
  });
});
