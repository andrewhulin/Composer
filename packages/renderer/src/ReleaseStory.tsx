import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { Backdrop, Caption, Chrome, Fonts } from "./chrome";
import { EndCard, Problem, Process, Proof, TitleCard, Ui } from "./chapters";
import { COLORS, timeline, type SegmentId, type StoryProps } from "./story";

const ACCENT: Partial<Record<SegmentId, string>> = { problem: COLORS.phase.understand, process: COLORS.phase.define, ui: COLORS.phase.build, proof: COLORS.phase.validate, end: COLORS.phase.share };

/** The release video: title, the four chapters, and the end card, each sized to its voiceover. */
export function ReleaseStory(props: StoryProps) {
  const { story, process, prototype, project, voice, staticFonts } = props;
  const { segments } = timeline(props);
  return (
    <AbsoluteFill style={{ background: COLORS.app }}>
      <Fonts enabled={!!staticFonts} />
      {segments.map((seg) => {
        const line = seg.chapter !== null ? (story.voiceover[seg.chapter] ?? "") : "";
        const audio = seg.chapter !== null ? voice?.[seg.chapter] : null;
        return (
          <Sequence key={seg.id} from={seg.from} durationInFrames={seg.frames} name={seg.id}>
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
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
