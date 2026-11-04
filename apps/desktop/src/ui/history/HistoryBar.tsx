import { useState } from "react";
import { PHASE_INFO } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { branchLine, frames, playback, usePlayback, type Speed } from "../../store/playback";
import { useUi } from "../../store/ui";
import { cx } from "../primitives/cx";
import playIcon from "../../assets/icons/play.svg";
import backIcon from "../../assets/icons/step-back.svg";
import forwardIcon from "../../assets/icons/step-forward.svg";
import flagIcon from "../../assets/icons/flag.svg";
import { timelineFrom } from "./timeline";
import { SnapshotThumb } from "./SnapshotThumb";
import styles from "./HistoryBar.module.css";

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
const SPEEDS: Speed[] = [0.5, 1, 2];
const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", " ·");
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** 150px history: transport, snapshot position, and the phase-colored timeline (or playback controls). */
export function HistoryBar() {
  const active = usePlayback((s) => s.active);
  return <footer className={styles.history}>{active ? <PlaybackControls /> : <Timeline />}</footer>;
}

function Timeline() {
  useProject((s) => s.snapshots);
  const bookmarks = useProject((s) => s.bookmarks);
  const branches = useProject((s) => s.branches);
  const project = useProject((s) => s.project);
  const activePhase = useProject((s) => s.activePhase);
  const bookmarkOpen = useUi((s) => s.bookmarkOpen);
  const setCompareOpen = useUi((s) => s.setCompareOpen);
  const [menu, setMenu] = useState<"bookmarks" | "branches" | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const line = branchLine();
  const t = timelineFrom(line, bookmarks, activePhase);
  const last = line[line.length - 1];
  const others = branches.filter((b) => b.id !== project?.branchId && b.forkedFromSnapshotId);

  return (
    <>
      <div className={styles.transport}>
        <button type="button" className={styles.play} aria-label="Play history" onClick={() => void playback.play()}>
          <img src={playIcon} alt="" width={12} height={12} />
        </button>
        <button type="button" aria-label="Previous snapshot" className={styles.step} onClick={() => void playback.step(-1)}>
          <img src={backIcon} alt="" width={14} height={14} />
        </button>
        <button type="button" aria-label="Next snapshot" className={styles.step} onClick={() => void playback.step(1)} disabled>
          <img src={forwardIcon} alt="" width={14} height={14} />
        </button>
        <span className={styles.speed}>1×</span>
        <span className="caps">History</span>
        <span className={styles.position}>{line.length ? `Snapshot ${line.length} of ${line.length}` : "Every run is recorded"}</span>
        <span className={styles.when}>{last ? fmt(last.createdAt) : ""}</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={cx(styles.action, menu === "bookmarks" && styles.actionOn)} onClick={() => setMenu(menu === "bookmarks" ? null : "bookmarks")}>
          Bookmarks <span>{bookmarks.length}</span>
        </button>
        <button type="button" className={cx(styles.action, menu === "branches" && styles.actionOn)} onClick={() => setMenu(menu === "branches" ? null : "branches")}>
          Branches <span>{branches.length}</span>
        </button>
        <button type="button" className={styles.action} onClick={() => setCompareOpen(true)} disabled={line.length < 2}>
          Compare
        </button>
        {menu === "bookmarks" && (
          <div className={styles.menu}>
            {bookmarks.length === 0 && <p className={styles.menuEmpty}>⌘B marks the moment that matters. Snapshots are automatic; bookmarks are yours.</p>}
            {bookmarks.map((b) => (
              <button key={b.snapshotId} type="button" onClick={() => (setMenu(null), void playback.open(b.snapshotId))}>
                <img src={flagIcon} alt="" width={11} height={11} />
                <span>{b.label}</span>
                <em>#{b.seq}</em>
              </button>
            ))}
          </div>
        )}
        {menu === "branches" && (
          <div className={styles.menu}>
            {branches.map((b) => (
              <button key={b.id} type="button" disabled={b.id === project?.branchId} onClick={() => (setMenu(null), void actions.switchBranch(b.id))}>
                <span className={cx(styles.branchDot, b.id === project?.branchId && styles.branchCurrent)} />
                <span>{b.name}</span>
                <em>{b.id === project?.branchId ? "current" : b.state.replace("_", " ")}</em>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.timeline}>
        <span className={styles.track} />
        {t.segments.map((s) => (
          <span key={s.phase} className={styles.segment} data-phase={s.phase} style={{ left: pct(s.start), width: pct(Math.max(0, s.end - s.start)) }} />
        ))}
        {t.segments.map((s) => (
          <span key={`l-${s.phase}`} className={styles.segmentLabel} style={{ left: pct(s.start) }}>
            {PHASE_INFO[s.phase].name}
          </span>
        ))}
        {t.ticks.map((k, i) => (
          <button
            key={k.id}
            type="button"
            className={styles.tickHit}
            style={{ left: pct(k.at) }}
            onClick={() => void playback.open(k.id)}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            aria-label={`Snapshot ${i + 1}`}
          >
            <span className={styles.tick} style={{ opacity: k.kind === "run" ? 1 : 0.55 }} />
          </button>
        ))}
        {others.map((b) => {
          const forkAt = t.ticks.find((k) => k.id === b.forkedFromSnapshotId)?.at;
          if (forkAt === undefined) return null;
          return (
            <span key={b.id} className={styles.branch} style={{ left: pct(forkAt), width: "9%" }}>
              <svg className={styles.branchCurve} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
                <path d="M0 32 C 18 32, 22 2, 40 2 L 100 2" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className={styles.branchLabel}>
                {b.name} branch · {b.state.replace("_", " ")}
              </span>
            </span>
          );
        })}
        {t.bookmarks.map((b) => (
          <span key={b.label + b.at} className={styles.bookmark} style={{ left: pct(b.at) }}>
            <span className={styles.flag}>
              <img src={flagIcon} alt="" width={11} height={11} />
              {b.label}
            </span>
            <span className={styles.stem} />
          </span>
        ))}
        {t.playhead && (
          <span className={styles.playhead} style={{ left: pct(t.playhead.at) }}>
            <span className={styles.knob} />
            <span className={styles.time}>{t.playhead.time}</span>
          </span>
        )}
        {hover !== null && line[hover] && (
          <span className={styles.hoverThumb} style={{ left: pct(t.ticks[hover]!.at) }}>
            <SnapshotThumb snap={line[hover]!} />
            <span>
              #{hover + 1} · {hhmm(line[hover]!.createdAt)}
              {line[hover]!.label ? ` · ${line[hover]!.label}` : ""}
            </span>
          </span>
        )}
        {bookmarkOpen && t.playhead && <BookmarkField at={t.playhead.at} />}
      </div>
    </>
  );
}

/** ⌘B: a field drops out of the timeline at the playhead with a name suggested from the last run. */
function BookmarkField({ at }: { at: number }) {
  const setBookmarkOpen = useUi((s) => s.setBookmarkOpen);
  const graph = useProject((s) => s.graph);
  const lastRuns = useProject((s) => s.lastRuns);
  const line = branchLine();
  const lastLabel = [...line].reverse().find((s) => s.label)?.label;
  const lastRun = Object.values(lastRuns).sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))[0];
  const suggestion = lastLabel ?? (lastRun ? `${graph.nodes[lastRun.nodeId]?.title ?? "Run"} done` : "Checkpoint");
  return (
    <span className={styles.bookmarkField} style={{ left: pct(at) }}>
      <input
        autoFocus
        defaultValue={suggestion}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") setBookmarkOpen(false);
          if (e.key === "Enter") {
            const label = e.currentTarget.value.trim();
            setBookmarkOpen(false);
            if (label) void actions.snapshot(label);
          }
        }}
        onBlur={() => setBookmarkOpen(false)}
      />
      <span>↵</span>
    </span>
  );
}

function PlaybackControls() {
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const runsOnly = usePlayback((s) => s.runsOnly);
  const index = usePlayback((s) => s.index);
  const bookmarks = useProject((s) => s.bookmarks);
  const list = frames();
  const start = Math.max(0, Math.min(index - 4, list.length - 9));
  const strip = list.slice(start, start + 9);
  const mark = new Map(bookmarks.map((b) => [b.snapshotId, b.label]));
  return (
    <div className={styles.playback}>
      <div className={styles.controls}>
        <button type="button" className={styles.play} aria-label={playing ? "Pause" : "Play"} onClick={() => (playing ? playback.pause() : void playback.play())}>
          {playing ? <span className={styles.pause} /> : <img src={playIcon} alt="" width={12} height={12} />}
        </button>
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={cx(styles.chip, speed === s && styles.chipOn)} onClick={() => playback.setSpeed(s)}>
            {s === 0.5 ? "0.5×" : `${s}×`}
          </button>
        ))}
        <button type="button" className={cx(styles.chip, runsOnly && styles.chipOn)} onClick={() => playback.toggleRunsOnly()}>
          Runs only
        </button>
        <span className={styles.hint}>Scrub to rebuild the canvas. ⇧← ⇧→ jump between bookmarks. Space plays at 2×.</span>
      </div>
      <div className={styles.strip}>
        {strip.map((snap, i) => {
          const at = start + i;
          return (
            <button key={snap.id} type="button" className={cx(styles.frame, at === index && styles.frameOn)} onClick={() => void playback.seek(at)}>
              <span className={styles.frameThumb}>
                <SnapshotThumb snap={snap} width={118} height={50} />
              </span>
              <span className={styles.frameMeta}>
                <span>#{at + 1}</span>
                <span>{hhmm(snap.createdAt)}</span>
              </span>
              {mark.get(snap.id) && (
                <span className={styles.frameMark}>
                  <img src={flagIcon} alt="" width={9} height={9} /> {mark.get(snap.id)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
