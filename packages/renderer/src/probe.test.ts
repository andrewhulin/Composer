import { describe, expect, it } from "vitest";
import { checkRender, type Probe } from "./probe";

const expected = { width: 1920, height: 1080, fps: 30, frames: 1035, audio: true };

const probe = (over: { video?: Partial<Probe["streams"][number]>; audio?: boolean; duration?: string } = {}): Probe => ({
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30/1", ...over.video },
    ...(over.audio === false ? [] : [{ codec_type: "audio", codec_name: "aac" }]),
  ],
  format: { duration: over.duration ?? "34.533", size: "4213000" },
});

describe("checkRender", () => {
  it("summarises a file that matches its composition, with no problems", () => {
    expect(checkRender(probe(), expected)).toEqual({ summary: "1920×1080 · 30 fps · 34.5 s · H.264 + AAC · 4.2 MB", problems: [] });
  });

  it("allows the little extra audio padding adds", () => {
    expect(checkRender(probe({ duration: "34.6" }), expected).problems).toEqual([]);
  });

  it("names every way the file is off", () => {
    const { problems } = checkRender(probe({ video: { width: 960, height: 540, avg_frame_rate: "30000/1001" }, audio: false, duration: "30.1" }), expected);
    expect(problems).toEqual([
      "It's 960×540, not 1920×1080.",
      "It plays at 29.97 fps, not 30.",
      "It's 30.10 s long, but the timeline is 34.50 s.",
      "The voiceover didn't make it in: the file has no sound.",
    ]);
  });

  it("doesn't expect sound when no voiceover was recorded", () => {
    expect(checkRender(probe({ audio: false }), { ...expected, audio: false }).problems).toEqual([]);
  });

  it("says so when there's no video at all", () => {
    expect(checkRender({ streams: [], format: {} }, expected).problems).toEqual(["The file has no video in it."]);
  });
});
