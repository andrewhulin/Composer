/** What ffprobe reports about a file, trimmed to the fields the check reads. */
export interface Probe {
  streams: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; duration?: string }[];
  format: { duration?: string; size?: string };
}

export interface RenderCheck {
  /** "1920×1080 · 30 fps · 34.5 s · H.264 + AAC · 4.2 MB" */
  summary: string;
  /** Each way the file differs from what was asked for. Empty when it matches. */
  problems: string[];
}

export interface Expected {
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** Whether a voiceover was recorded, so the file should carry sound. */
  audio: boolean;
}

const CODEC: Record<string, string> = { h264: "H.264", hevc: "HEVC", aac: "AAC", gif: "GIF", prores: "ProRes" };

/** "30000/1001" → 29.97 */
function rate(r: string | undefined): number {
  if (!r) return 0;
  const [n, d] = r.split("/").map(Number);
  return d ? n! / d : Number(n) || 0;
}

const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Checks a rendered file against the composition it came from. */
export function checkRender(probe: Probe, expected: Expected): RenderCheck {
  const video = probe.streams.find((s) => s.codec_type === "video");
  if (!video) return { summary: "no video stream", problems: ["The file has no video in it."] };
  const audio = probe.streams.find((s) => s.codec_type === "audio");
  const fps = rate(video.avg_frame_rate) || rate(video.r_frame_rate);
  const seconds = Number(probe.format.duration ?? video.duration ?? 0);
  const want = expected.frames / expected.fps;
  const problems: string[] = [];
  if (video.width !== expected.width || video.height !== expected.height) problems.push(`It's ${video.width}×${video.height}, not ${expected.width}×${expected.height}.`);
  if (fps && Math.abs(fps - expected.fps) > 0.01) problems.push(`It plays at ${round(fps)} fps, not ${expected.fps}.`);
  // Audio padding can run a little past the last frame; more than that means frames went missing.
  if (Math.abs(seconds - want) > 0.15) problems.push(`It's ${seconds.toFixed(2)} s long, but the timeline is ${want.toFixed(2)} s.`);
  if (expected.audio && !audio) problems.push("The voiceover didn't make it in: the file has no sound.");
  const codecs = [video.codec_name, audio?.codec_name].filter(Boolean).map((c) => CODEC[c!] ?? c!.toUpperCase());
  const size = Number(probe.format.size ?? 0);
  const summary = [`${video.width}×${video.height}`, `${round(fps)} fps`, `${seconds.toFixed(1)} s`, codecs.join(" + "), size ? `${(size / 1e6).toFixed(1)} MB` : ""].filter(Boolean).join(" · ");
  return { summary, problems };
}
