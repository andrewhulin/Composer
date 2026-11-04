import type { Graph } from "@composer/core";
import { useProject } from "./project";
import { usePlayback } from "./playback";

/** The graph on screen: a recorded snapshot during playback, the working graph otherwise. */
export function useDisplayGraph(): Graph {
  const live = useProject((s) => s.graph);
  const recorded = usePlayback((s) => (s.active ? s.graph : null));
  return recorded ?? live;
}

export function usePlaybackActive(): boolean {
  return usePlayback((s) => s.active);
}
