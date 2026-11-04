// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseLinearIssue, linear } from "./linear";
import { figmaText, parseFigmaFrame, figma } from "./figma";
import { parseArenaBlocks, arena } from "./arena";
import { parsePinterestRss, pinterest } from "./pinterest";
import { parseSlackPermalink, parseSlackThread, slack } from "./slack";
import { matchUrl } from "./index";

describe("link matching", () => {
  it("routes each platform's links to its connector, with the config parsed out", () => {
    expect(matchUrl("https://linear.app/slingshot/issue/ASH-482/recap-after-a-session")).toMatchObject({ connector: linear, config: { issue: "ASH-482" } });
    expect(matchUrl("https://www.figma.com/design/sEYeY0fivWVBcu9TTiDnvV/Design-Harness?node-id=29-548")).toMatchObject({ connector: figma, config: { file: "sEYeY0fivWVBcu9TTiDnvV", node: "29:548" } });
    expect(matchUrl("https://www.are.na/andrew/interface-motion")).toMatchObject({ connector: arena, config: { channel: "interface-motion" } });
    expect(matchUrl("https://www.pinterest.com/andrew/nov-board/")).toMatchObject({ connector: pinterest, config: { user: "andrew", board: "nov-board" } });
    expect(matchUrl("https://slingshot.slack.com/archives/C0123ABCD/p1730736000123456")).toMatchObject({ connector: slack, config: { channel: "C0123ABCD", ts: "1730736000.123456" } });
    expect(matchUrl("https://example.com/article")).toBeUndefined();
    expect(matchUrl("https://www.figma.com/design/abc/File")).toBeUndefined();
  });
});

describe("parsers", () => {
  it("Linear: description then each comment, labelled with its author", () => {
    const item = parseLinearIssue({
      identifier: "ASH-482",
      title: "Recap after a session",
      description: "Show what changed.\n\nKeep it short.",
      url: "https://linear.app/x/issue/ASH-482",
      state: { name: "In Progress" },
      priorityLabel: "High",
      labels: { nodes: [{ name: "Design" }, { name: "Retention" }] },
      comments: { nodes: [{ body: "Second", createdAt: "2026-11-02", user: { name: "Bo" } }, { body: "First", createdAt: "2026-11-01", user: { name: "Al" } }] },
    });
    expect(item.kind).toBe("ticket");
    expect(item.units.map((u) => [u.label, u.text])).toEqual([
      ["In Progress · High", "ASH-482 · Recap after a session"],
      [undefined, "Show what changed."],
      [undefined, "Keep it short."],
      ["Al", "First"],
      ["Bo", "Second"],
    ]);
    expect(item.author).toBe("Design, Retention");
  });

  it("Figma: the frame's copy, deduplicated, top to bottom", () => {
    const frame = { name: "Recap · iOS", type: "FRAME", children: [{ name: "t", type: "TEXT", characters: "Welcome back" }, { name: "g", type: "GROUP", children: [{ name: "t2", type: "TEXT", characters: "Since last time" }, { name: "t3", type: "TEXT", characters: "Welcome back" }] }] };
    expect(figmaText(frame)).toEqual(["Welcome back", "Since last time", "Welcome back"]);
    expect(parseFigmaFrame(frame, "u").units.map((u) => u.text)).toEqual(["Welcome back", "Since last time"]);
  });

  it("Are.na: images become pins, text becomes notes, nested channels are skipped", () => {
    const items = parseArenaBlocks([
      { id: 1, class: "Image", title: "Card stack", image: { display: { url: "https://d2w9rnfcy7mm78.cloudfront.net/1.jpg" } } },
      { id: 2, class: "Text", content: "Motion explains state." },
      { id: 3, class: "Channel", title: "Nested" },
      { id: 4, class: "Link", title: "Article", source: { url: "https://example.com" }, description: "About recaps." },
    ]);
    expect(items.map((i) => [i.kind, i.title])).toEqual([["pin", "Card stack"], ["note", "Motion explains state."], ["link", "Article"]]);
    expect(items[0]!.image).toContain("cloudfront");
    expect(items[2]!.url).toBe("https://example.com");
  });

  it("Pinterest: pins and their images from the board RSS", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Nov board</title>
      <item><title>Recap card, soft</title><link>https://pin.it/1</link><description><![CDATA[<a href="x"><img src="https://i.pinimg.com/236x/a.jpg"></a>Warm tones]]></description></item>
      <item><title></title><link>https://pin.it/2</link><description><![CDATA[<img src="https://i.pinimg.com/236x/b.jpg">Progress rings]]></description></item>
    </channel></rss>`;
    const { title, items } = parsePinterestRss(xml);
    expect(title).toBe("Nov board");
    expect(items.map((i) => [i.title, i.image])).toEqual([
      ["Recap card, soft", "https://i.pinimg.com/236x/a.jpg"],
      ["Progress rings", "https://i.pinimg.com/236x/b.jpg"],
    ]);
  });

  it("Slack: permalink timestamps and a thread as labelled units", () => {
    expect(parseSlackPermalink(new URL("https://x.slack.com/archives/C1/p1730736000123456?thread_ts=1730735000.000100"))).toEqual({ channel: "C1", ts: "1730735000.000100" });
    const item = parseSlackThread([{ text: "Tried the recap", ts: "1", user_profile: { display_name: "pat" } }, { text: "Love it <@U123>", ts: "2", user: "U9" }], "u");
    expect(item.units).toEqual([{ text: "Tried the recap", label: "pat" }, { text: "Love it @someone", label: "U9" }]);
  });
});
