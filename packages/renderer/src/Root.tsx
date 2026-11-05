import { Composition } from "remotion";
import { ReleaseStory } from "./ReleaseStory";
import { SAMPLE } from "./sample";
import { FPS, HEIGHT, timeline, WIDTH, type StoryProps } from "./story";

export function Root() {
  return (
    <Composition
      id="ReleaseStory"
      component={ReleaseStory}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={timeline(SAMPLE).total}
      defaultProps={SAMPLE}
      calculateMetadata={({ props }: { props: StoryProps }) => ({ durationInFrames: timeline(props).total })}
    />
  );
}
