import { shotsFrom } from "@composer/renderer";
import { referenceContent } from "./reference-content";
import { pickVideo, referenceFrames } from "../platform/share";
import { actions, toast } from "../store/project";
import { rendererDir } from "./story";

/**
 * Picks a video, reads its cuts and stills with ffmpeg, and adds it to Share wired into the
 * release story, which then matches its pacing and transitions on the next run.
 */
export async function addReferenceVideo(): Promise<boolean> {
  const dir = await rendererDir();
  if (!dir) {
    toast("Set the renderer folder in Settings (⌘,) → Share.", "error");
    return false;
  }
  const video = await pickVideo();
  if (!video) return false;
  const name = video.split("/").pop() ?? "video";
  const info = await referenceFrames(video, dir);
  await actions.addSource({ title: `Reference · ${name}`, platform: "video", content: referenceContent(name, info), config: { path: video } });
  const shots = shotsFrom(info.duration, info.cuts).length;
  toast(`Reference added: ${shots} ${shots === 1 ? "shot" : "shots"} over ${info.duration.toFixed(1)} s. Rerun the story to match its pacing.`, "success");
  return true;
}
