/**
 * Remotion's own ffmpeg and ffprobe. They ship in a per-platform compositor package and load
 * their libraries from that folder, so it has to be on the library path when they run.
 */
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export function ffDir(): string {
  const require = createRequire(import.meta.url);
  const renderer = require.resolve("@remotion/renderer");
  const main = createRequire(renderer).resolve(`@remotion/compositor-${process.platform}-${process.arch}`);
  return path.dirname(main);
}

export function runFf(bin: "ffmpeg" | "ffprobe", args: string[]): Promise<{ stdout: string; stderr: string }> {
  const dir = ffDir();
  return new Promise((resolve, reject) => {
    execFile(path.join(dir, bin), args, { env: { ...process.env, DYLD_LIBRARY_PATH: dir, LD_LIBRARY_PATH: dir }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim().split("\n").pop() || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

/** Same, for output that's binary: raw frames piped to stdout. */
export function runFfBytes(bin: "ffmpeg" | "ffprobe", args: string[]): Promise<Buffer> {
  const dir = ffDir();
  return new Promise((resolve, reject) => {
    execFile(path.join(dir, bin), args, { env: { ...process.env, DYLD_LIBRARY_PATH: dir, LD_LIBRARY_PATH: dir }, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.toString().trim().split("\n").pop() || err.message));
      else resolve(stdout);
    });
  });
}
