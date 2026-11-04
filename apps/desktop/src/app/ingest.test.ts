import { describe, expect, it } from "vitest";
import { ingestText, isUrl, subtitlesToText, transcriptTitle } from "./ingest";

const transcript = `[12:03] P04: I open the app and have no idea what we talked about.
[13:10] Interviewer: What would help?
[14:22] P07: I forget where we left off.
[18:40] P11: A recap, but not a wall of text.`;

describe("ingestText", () => {
  it("recognises transcripts, names them after the speakers, and splits per utterance", () => {
    const r = ingestText(transcript);
    expect(r.platform).toBe("transcript");
    expect(r.title).toBe("Interviews · P04, P07, P11");
    expect(r.content.items[0]!.units).toHaveLength(4);
    expect(r.content.items[0]!.units[2]).toEqual({ text: "I forget where we left off.", label: "P07 · 14:22" });
  });

  it("treats a short line as a quote and longer text as a note", () => {
    expect(ingestText("What changed since last time?")).toMatchObject({ platform: "paste", title: "“What changed since last time?”", content: { items: [{ kind: "quote" }] } });
    const note = ingestText("Export my chats\n\nSeveral requests asked for exporting.\n\nMostly power users.");
    expect(note.title).toBe("Export my chats");
    expect(note.content.items[0]!.kind).toBe("note");
    expect(note.content.items[0]!.units).toHaveLength(3);
  });
});

describe("helpers", () => {
  it("turns subtitles into speaker lines", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v P07>I forget where we left off.</v>\n\n2\n00:00:04.000 --> 00:00:05.000\n<v P11>Me too.";
    expect(subtitlesToText(vtt)).toBe("P07: I forget where we left off.\nP11: Me too.");
  });

  it("knows a link when it sees one", () => {
    expect(isUrl("https://mobbin.com/screens/123")).toBe(true);
    expect(isUrl("not a link")).toBe(false);
    expect(transcriptTitle("Interviewer: hi\nInterviewer: hello\nInterviewer: ok")).toBe("Interview transcript");
  });
});
