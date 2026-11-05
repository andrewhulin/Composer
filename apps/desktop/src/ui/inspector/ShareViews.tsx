import { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { CHAPTERS, type PrData, type StoryData } from "@composer/engine";
import { FPS, HEIGHT, ReleaseStory, timeline, WIDTH, type StoryProps } from "@composer/renderer";
import { fileUrl, openUrl, revealPath } from "../../platform/share";
import { openPullRequest, prPlan, renderRelease, storyProps, useShare } from "../../share/story";
import { toast } from "../../store/project";
import { cx } from "../primitives/cx";
import styles from "./ShareViews.module.css";

const STAGE: Record<string, string> = { voice: "Recording voiceover", bundle: "Bundling", browser: "Starting the renderer", mp4: "Rendering MP4", gif: "Rendering GIF", done: "Done", error: "Failed" };

function usePlayerProps(data: StoryData): StoryProps | null {
  const [props, setProps] = useState<StoryProps | null>(null);
  useEffect(() => {
    let live = true;
    void storyProps(data).then((p) => live && setProps(p));
    return () => {
      live = false;
    };
  }, [data]);
  return props;
}

function StoryPlayer({ props, large }: { props: StoryProps; large?: boolean }) {
  const frames = useMemo(() => timeline(props).total, [props]);
  return (
    <Player
      component={ReleaseStory}
      inputProps={props}
      durationInFrames={frames}
      fps={FPS}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      controls
      initialFrame={Math.min(45, frames - 1)}
      loop={!large}
      autoPlay={!!large}
      style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}`, borderRadius: large ? 12 : 6, overflow: "hidden" }}
    />
  );
}

/** Figma 07 · Share: the release video, playable here, then rendered to MP4, GIF and a poster. */
export function StoryView({ data, hash }: { data: StoryData; hash: string }) {
  const props = usePlayerProps(data);
  const [large, setLarge] = useState(false);
  const render = useShare((s) => s.renders[hash]);
  const line = render?.line;
  const done = line?.stage === "done" ? line : null;
  const seconds = props ? Math.round(timeline(props).total / FPS) : null;
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <span className={styles.title}>{data.title}</span>
        <span className={styles.logline}>{data.logline}</span>
      </div>
      <div className={styles.player}>
        {props ? <StoryPlayer props={props} /> : <div className={styles.loading}>Preparing preview…</div>}
        <button type="button" className={styles.link} onClick={() => setLarge(true)} disabled={!props}>
          Release story · {seconds ?? "–"}s <em>open large</em>
        </button>
      </div>
      <ol className={styles.chapters}>
        {CHAPTERS.map((c, i) => (
          <li key={c}>
            <span className={styles.n}>{String(i + 1).padStart(2, "0")}</span>
            <span className={styles.chapter}>{c}</span>
            <span className={styles.vo}>{data.voiceover[i] ?? ""}</span>
          </li>
        ))}
      </ol>
      <div className={styles.render}>
        <button type="button" className={styles.primary} disabled={render?.running} onClick={() => void renderRelease(hash, data)}>
          {render?.running ? "Rendering…" : done ? "Render again" : "Render MP4 + GIF"}
        </button>
        {render?.running && line && (
          <div className={styles.progress}>
            <span>{STAGE[line.stage] ?? line.stage}</span>
            <span className={styles.bar}>
              <span style={{ width: `${Math.round((line.progress ?? 0) * 100)}%` }} />
            </span>
          </div>
        )}
        {render?.error && <p className={styles.error}>{render.error}</p>}
        {done && (
          <div className={styles.files}>
            {done.poster && <img src={fileUrl(done.poster)} alt="Poster frame" className={styles.poster} />}
            {[
              ["MP4", done.mp4],
              ["GIF", done.gif],
              ["Poster", done.poster],
            ].map(([label, path]) =>
              path ? (
                <button key={label} type="button" className={styles.file} onClick={() => void revealPath(path)}>
                  <span>{label}</span>
                  <em>{path.split("/").pop()}</em>
                  <span className={styles.reveal}>Reveal</span>
                </button>
              ) : null,
            )}
          </div>
        )}
      </div>
      {large && props && (
        <div className={styles.overlay} onPointerDown={() => setLarge(false)}>
          <div className={styles.stage} onPointerDown={(e) => e.stopPropagation()}>
            <StoryPlayer props={props} large />
          </div>
        </div>
      )}
    </div>
  );
}

/** The PR, and the one button that pushes it. A confirm step names the repo, branch and files first. */
export function PrView({ data, hash, storyHash }: { data: PrData; hash: string; storyHash: string | null }) {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof prPlan>> | null>(null);
  const [busy, setBusy] = useState(false);
  const url = useShare((s) => s.prs[hash]);
  return (
    <div className={styles.view}>
      <div className={styles.pr}>
        <span className={styles.prTitle}>{data.title}</span>
        <p>{data.summary}</p>
        <dl>
          <dt>Before</dt>
          <dd>{data.before}</dd>
          <dt>After</dt>
          <dd>{data.after}</dd>
          <dt>Why</dt>
          <dd>{data.why}</dd>
          <dt>Watch</dt>
          <dd>{data.metric}</dd>
        </dl>
      </div>
      {url ? (
        <button type="button" className={cx(styles.primary, styles.done)} onClick={() => void openUrl(url)}>
          PR open · {url.replace("https://github.com/", "")}
        </button>
      ) : plan ? (
        <div className={styles.confirm}>
          <p>
            Push <code>{plan.branch}</code> to <code>{plan.repo ?? "no repository set"}</code> with {plan.files.map((f) => f.name).join(", ") || "no files"}, then open the PR on GitHub?
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !plan.repo}
              onClick={async () => {
                setBusy(true);
                try {
                  await openPullRequest(hash, plan);
                } catch (e) {
                  toast(e instanceof Error ? e.message : String(e), "error");
                } finally {
                  setBusy(false);
                  setPlan(null);
                }
              }}
            >
              {busy ? "Opening…" : "Push and open PR"}
            </button>
            <button type="button" className={styles.secondary} onClick={() => setPlan(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.primary} onClick={() => void prPlan(data, storyHash).then(setPlan)}>
          Open pull request…
        </button>
      )}
    </div>
  );
}
