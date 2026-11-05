import { Composition, registerRoot } from "remotion";

/** The app icon (apps/desktop/src-tauri/icons/icon.svg), rendered as a transparent 1024px still. */
function Icon({ svg }: { svg: string }) {
  return <div style={{ width: 1024, height: 1024 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

registerRoot(() => <Composition id="Icon" component={Icon} width={1024} height={1024} fps={1} durationInFrames={1} defaultProps={{ svg: "" }} />);
