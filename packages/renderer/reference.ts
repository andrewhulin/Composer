/**
 * Reads a reference video's rhythm for the release story. Run with the system Node:
 *   node reference.ts --video clip.mp4 --out ./ref [--max 10]
 * Prints one JSON line: {stage: "done", duration, width, height, fps, cuts, frames: [{file, t}]}
 * or {stage: "error", message}.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runFf, runFfBytes } from "./ff.ts";
import { frameDiffs, frameTimes, sceneCuts, type ReferenceInfo } from "./src/pacing.ts";
import type { Probe } from "./src/probe.ts";

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const emit = (o: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(o)}\n`);

/** Only the first three minutes are read: references are launch clips, not films. */
const READ_SECONDS = 180;
const SAMPLE_FPS = 10;
const SAMPLE_W = 64;
const SAMPLE_H = 36;

async function main() {
  const video = value("video");
  const outDir = value("out");
  if (!video || !outDir) throw new Error("Usage: node reference.ts --video <file> --out <dir>");
  const max = Math.min(12, Math.max(1, Number(value("max") ?? 10)));
  const out = path.resolve(outDir);
  mkdirSync(out, { recursive: true });

  const probe = JSON.parse((await runFf("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", video])).stdout) as Probe;
  const stream = probe.streams.find((s) => s.codec_type === "video");
  if (!stream) throw new Error("That file has no video in it.");
  const [n, d] = (stream.avg_frame_rate ?? stream.r_frame_rate ?? "30/1").split("/").map(Number);
  const duration = Math.min(READ_SECONDS, Number(probe.format.duration ?? stream.duration ?? 0));
  if (!duration) throw new Error("Couldn't tell how long that video is.");

  // Remotion's ffmpeg has no scene filter, so cuts are found here: tiny grayscale frames, ten a
  // second, compared one to the next.
  const gray = await runFfBytes("ffmpeg", ["-hide_banner", "-loglevel", "error", "-t", String(READ_SECONDS), "-i", video, "-an", "-vf", `scale=${SAMPLE_W}:${SAMPLE_H},format=gray`, "-r", String(SAMPLE_FPS), "-c:v", "rawvideo", "-f", "image2pipe", "pipe:1"]);
  const cuts = sceneCuts(frameDiffs(gray, SAMPLE_W * SAMPLE_H), SAMPLE_FPS).filter((t) => t < duration);

  const frames: ReferenceInfo["frames"] = [];
  for (const [i, t] of frameTimes(duration, cuts, max).entries()) {
    const file = path.join(out, `frame-${String(i).padStart(2, "0")}.jpg`);
    await runFf("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", "-q:v", "4", "-y", file]);
    // Inline, so the app doesn't need file access to show or send them.
    frames.push({ file, t, image: `data:image/jpeg;base64,${readFileSync(file).toString("base64")}` });
  }
  const info: ReferenceInfo = { duration, width: stream.width ?? 0, height: stream.height ?? 0, fps: d ? n! / d : n || 30, cuts, frames };
  emit({ stage: "done", ...info });
}

main().catch((e: unknown) => {
  emit({ stage: "error", message: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
