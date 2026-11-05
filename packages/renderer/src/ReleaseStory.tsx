import { Fragment } from "react";
import { AbsoluteFill, Html5Audio, staticFile } from "remotion";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Backdrop, Caption, Chrome, Fonts } from "./chrome";
import { EndCard, Problem, Process, Proof, TitleCard, Ui } from "./chapters";
import { COLORS, timeline, transitionFrames, transitionOf, type SegmentId, type StoryProps, type Transition } from "./story";

const ACCENT: Partial<Record<SegmentId, string>> = { problem: COLORS.phase.understand, process: COLORS.phase.define, ui: COLORS.phase.build, proof: COLORS.phase.validate, end: COLORS.phase.share };

// Typed loosely: each presentation has its own props, and a series mixes none of them.
const PRESENTATION: Record<Exclude<Transition, "cut">, () => TransitionPresentation<Record<string, unknown>>> = {
  fade: () => fade() as TransitionPresentation<Record<string, unknown>>,
  slide: () => slide({ direction: "from-right" }) as TransitionPresentation<Record<string, unknown>>,
  wipe: () => wipe({ direction: "from-left" }) as TransitionPresentation<Record<string, unknown>>,
};

/** The release video: title, the four chapters, and the end card, each sized to its voiceover and joined by the story's transition. */
export function ReleaseStory(props: StoryProps) {
  const { story, process, prototype, project, voice, staticFonts } = props;
  const { segments } = timeline(props);
  const kind = transitionOf(story);
  const overlap = transitionFrames(story);
  return (
    <AbsoluteFill style={{ background: COLORS.app }}>
      <Fonts enabled={!!staticFonts} />
      <TransitionSeries>
        {segments.map((seg, i) => {
          const line = seg.chapter !== null ? (story.voiceover[seg.chapter] ?? "") : "";
          const audio = seg.chapter !== null ? voice?.[seg.chapter] : null;
          return (
            <Fragment key={seg.id}>
              {i > 0 && kind !== "cut" && <TransitionSeries.Transition timing={linearTiming({ durationInFrames: overlap })} presentation={PRESENTATION[kind]()} />}
              <TransitionSeries.Sequence durationInFrames={seg.frames} name={seg.id}>
                <Backdrop {...(ACCENT[seg.id] ? { accent: ACCENT[seg.id] } : {})} />
                {seg.id === "title" && <TitleCard story={story} loops={project.loops} />}
                {seg.id === "problem" && <Problem story={story} />}
                {seg.id === "process" && <Process graph={process} caption={story.process.caption} frames={seg.frames} />}
                {seg.id === "ui" && <Ui story={story} prototype={prototype} frames={seg.frames} />}
                {seg.id === "proof" && <Proof story={story} />}
                {seg.id === "end" && <EndCard title={story.title} loops={project.loops} />}
                <Chrome project={project.name} {...(seg.chapter !== null ? { index: `${seg.chapter + 1} / 4` } : {})} />
                {line && <Caption text={line} frames={seg.frames} />}
                {audio && <Html5Audio src={staticFile(audio.src)} />}
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
}
