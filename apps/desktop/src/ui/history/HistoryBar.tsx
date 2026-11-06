import { useState } from "react";
import { PHASE_INFO } from "@composer/core";
import { formatUsd } from "@composer/engine";
import { formatTokens } from "../primitives/format";
import { actions, useProject } from "../../store/project";
import { branchLine, frames, playback, usePlayback, type Speed } from "../../store/playback";
import { useUi } from "../../store/ui";
import { Flag, GitBranch, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Badge, Button, Chip, Icon, IconButton, Kbd, Menu, MenuItem, Popover, cx } from "../primitives";
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
  return <footer className={styles.history} data-tour="history">{active ? <PlaybackControls /> : <Timeline />}</footer>;
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
  const spend = useProject((s) => s.spend);

  return (
    <>
      <div className={styles.transport}>
        <button type="button" className={styles.play} aria-label="Play history" onClick={() => void playback.play()}>
          <Icon icon={Play} size="sm" fill="currentColor" />
        </button>
        <IconButton icon={SkipBack} label="Previous snapshot" onClick={() => void playback.step(-1)} />
        <IconButton icon={SkipForward} label="Next snapshot" onClick={() => void playback.step(1)} disabled />
        <Badge tone="muted" mono>
          1×
        </Badge>
        <span className="caps">History</span>
        <span className={styles.position}>{line.length ? `Snapshot ${line.length} of ${line.length}` : "Every run is recorded"}</span>
        <span className={styles.when}>{last ? fmt(last.createdAt) : ""}</span>
        {!!spend?.runs && (
          <span className={styles.cost} title="What this project's runs have cost, at list prices">
            {formatUsd(spend.usd)} · {formatTokens(spend.tokens)} tok{spend.cacheHitRate !== null ? ` · ${Math.round(spend.cacheHitRate * 100)}% cached` : ""}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" size="sm" aria-expanded={menu === "bookmarks"} pressed={menu === "bookmarks"} onClick={() => setMenu(menu === "bookmarks" ? null : "bookmarks")}>
          Bookmarks <span className={styles.count}>{bookmarks.length}</span>
        </Button>
        <Button variant="secondary" size="sm" aria-expanded={menu === "branches"} pressed={menu === "branches"} onClick={() => setMenu(menu === "branches" ? null : "branches")}>
          Branches <span className={styles.count}>{branches.length}</span>
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setCompareOpen(true)} disabled={line.length < 2}>
          Compare
        </Button>
        {menu === "bookmarks" && (
          <Popover padding="sm" className={styles.menu}>
            {bookmarks.length === 0 && <p className={styles.menuEmpty}>⌘B marks the moment that matters. Snapshots are automatic; bookmarks are yours.</p>}
            {bookmarks.length > 0 && (
              <Menu label="Bookmarks">
                {bookmarks.map((b) => (
                  <MenuItem key={b.snapshotId} icon={Flag} meta={`#${b.seq}`} className={styles.bookmarkItem} onClick={() => (setMenu(null), void playback.open(b.snapshotId))}>
                    {b.label}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </Popover>
        )}
        {menu === "branches" && (
          <Popover padding="sm" className={styles.menu}>
            <Menu label="Branches">
              {branches.map((b) => (
                <MenuItem
                  key={b.id}
                  icon={GitBranch}
                  hint={b.id === project?.branchId ? "current" : b.state.replace("_", " ")}
                  checked={b.id === project?.branchId}
                  disabled={b.id === project?.branchId}
                  onClick={() => (setMenu(null), void actions.switchBranch(b.id))}
                >
                  {b.name}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
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
              {/* eslint-disable-next-line no-restricted-syntax -- the branch curve is a data graphic */}
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
              <Icon icon={Flag} size="sm" />
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
      <Kbd>↵</Kbd>
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
          <Icon icon={playing ? Pause : Play} size="sm" fill="currentColor" />
        </button>
        {SPEEDS.map((s) => (
          <Chip key={s} size="sm" selected={speed === s} onClick={() => playback.setSpeed(s)}>
            {s === 0.5 ? "0.5×" : `${s}×`}
          </Chip>
        ))}
        <Chip size="sm" selected={runsOnly} onClick={() => playback.toggleRunsOnly()}>
          Runs only
        </Chip>
        <span className={styles.hint}>
          Scrub to rebuild the canvas. <Kbd boxed>⇧←</Kbd> <Kbd boxed>⇧→</Kbd> jump between bookmarks. <Kbd boxed>Space</Kbd> plays at 2×.
        </span>
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
                  <Icon icon={Flag} size="sm" /> {mark.get(snap.id)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
