/**
 * Renders a release story. Run with the system Node (type stripping):
 *   node render.ts --props story.json --out ./out [--no-voice] [--no-gif]
 * Prints one JSON object per line: {stage, progress?} … then {stage: "done", mp4, gif, poster} or {stage: "error", message}.
 */
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timeline, type StoryProps } from "./src/story.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const emit = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(o)}\n`);

/** Seconds of audio in a PCM WAV file, from its header. */
function wavSeconds(file: string): number {
  const buf = readFileSync(file);
  const byteRate = buf.readUInt32LE(28);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return size / byteRate;
    off += 8 + size + (size % 2);
  }
  return 0;
}

async function main() {
  const propsPath = value("props");
  const outDir = value("out");
  if (!propsPath || !outDir) throw new Error("Usage: node render.ts --props <file> --out <dir>");
  const out = path.resolve(outDir);
  const pub = path.join(out, "public");
  mkdirSync(path.join(pub, "voice"), { recursive: true });
  cpSync(path.join(here, "public", "fonts"), path.join(pub, "fonts"), { recursive: true });

  const props = JSON.parse(readFileSync(propsPath, "utf8")) as StoryProps;
  // Renders embed the prototype's HTML; a URL only works inside the app.
  if (props.prototype) props.prototype = { html: props.prototype.html };
  props.staticFonts = true;

  if (!flag("no-voice") && process.platform === "darwin") {
    emit({ stage: "voice" });
    const voiceName = value("voice-name");
    props.voice = props.story.voiceover.slice(0, 4).map((line, i) => {
      if (!line.trim()) return null;
      const file = path.join(pub, "voice", `${i}.wav`);
      execFileSync("say", [...(voiceName ? ["-v", voiceName] : []), "-o", file, "--file-format=WAVE", "--data-format=LEI16@22050", line]);
      return { src: `voice/${i}.wav`, seconds: wavSeconds(file) };
    });
  }
  writeFileSync(path.join(out, "props.rendered.json"), JSON.stringify(props, null, 2));

  emit({ stage: "bundle", progress: 0 });
  const serveUrl = await bundle({ entryPoint: path.join(here, "src", "entry.ts"), publicDir: pub, onProgress: (p) => emit({ stage: "bundle", progress: p / 100 }) });
  emit({ stage: "browser" });
  await ensureBrowser();
  const composition = await selectComposition({ serveUrl, id: "ReleaseStory", inputProps: props });

  const mp4 = path.join(out, "story.mp4");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: mp4, inputProps: props, onProgress: ({ progress }) => emit({ stage: "mp4", progress }) });

  let gif: string | null = null;
  if (!flag("no-gif")) {
    gif = path.join(out, "story.gif");
    await renderMedia({ composition, serveUrl, codec: "gif", outputLocation: gif, inputProps: props, scale: 0.5, everyNthFrame: 3, numberOfGifLoops: 0, muted: true, onProgress: ({ progress }) => emit({ stage: "gif", progress }) });
  }

  const proof = timeline(props).segments.find((s) => s.id === "proof")!;
  const poster = path.join(out, "poster.png");
  await renderStill({ composition, serveUrl, output: poster, inputProps: props, frame: Math.min(composition.durationInFrames - 1, proof.from + 75) });
  emit({ stage: "done", mp4, gif, poster });
}

main().catch((e: unknown) => {
  emit({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
