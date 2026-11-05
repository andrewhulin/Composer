import { ulid, type ContextItem, type SourceContent } from "@composer/core";
import { describeReference, shotsFrom, type ReferenceInfo } from "@composer/renderer";

/** A reference video as a Share source: its rhythm in words, plus stills Claude sees as images. */
export function referenceContent(name: string, info: ReferenceInfo): SourceContent {
  const shots = shotsFrom(info.duration, info.cuts);
  const shotAt = (t: number) => shots.findIndex((s) => t >= s.start && t < s.end) + 1;
  const rhythm: ContextItem = { id: ulid(), kind: "file", title: `Reference · ${name}`, units: describeReference(info).map((text) => ({ text })) };
  const stills: ContextItem[] = info.frames
    .filter((f) => f.image)
    .map((f) => {
      const title = shots.length > 1 ? `Frame at ${f.t.toFixed(1)} s · shot ${shotAt(f.t)} of ${shots.length}` : `Frame at ${f.t.toFixed(1)} s`;
      return { id: ulid(), kind: "screen", title, units: [{ text: title }], image: f.image! };
    });
  return { v: 1, kind: "context", items: [rhythm, ...stills], syncedAt: new Date().toISOString() };
}
