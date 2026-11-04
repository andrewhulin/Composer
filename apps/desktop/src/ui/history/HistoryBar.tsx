import { PHASE_INFO } from "@composer/core";
import { useProject } from "../../store/project";
import playIcon from "../../assets/icons/play.svg";
import backIcon from "../../assets/icons/step-back.svg";
import forwardIcon from "../../assets/icons/step-forward.svg";
import flagIcon from "../../assets/icons/flag.svg";
import { timelineFrom } from "./timeline";
import styles from "./HistoryBar.module.css";

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

/** 150px history: transport, snapshot position, and the phase-colored timeline. */
export function HistoryBar() {
  const snapshots = useProject((s) => s.snapshots);
  const bookmarks = useProject((s) => s.bookmarks);
  const activePhase = useProject((s) => s.activePhase);
  const branches = 1;
  const t = timelineFrom(snapshots, bookmarks, activePhase);
  const last = snapshots[snapshots.length - 1];
  const when = last ? new Date(last.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", " ·") : "no snapshots yet";

  return (
    <footer className={styles.history}>
      <div className={styles.transport}>
        <button type="button" className={styles.play} aria-label="Play history (arrives in M5)" disabled>
          <img src={playIcon} alt="" width={12} height={12} />
        </button>
        <button type="button" aria-label="Previous snapshot" className={styles.step} disabled>
          <img src={backIcon} alt="" width={14} height={14} />
        </button>
        <button type="button" aria-label="Next snapshot" className={styles.step} disabled>
          <img src={forwardIcon} alt="" width={14} height={14} />
        </button>
        <span className={styles.speed}>1×</span>
        <span className="caps">History</span>
        <span className={styles.position}>{snapshots.length ? `Snapshot ${snapshots.length} of ${snapshots.length}` : "Every run is recorded"}</span>
        <span className={styles.when}>{when}</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action}>
          Bookmarks <span>{bookmarks.length}</span>
        </button>
        <button type="button" className={styles.action}>
          Branches <span>{branches}</span>
        </button>
        <button type="button" className={styles.action}>
          Compare
        </button>
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
        {t.ticks.map((k) => (
          <span key={k.id} className={styles.tick} style={{ left: pct(k.at), opacity: k.kind === "run" ? 1 : 0.6 }} title={k.kind} />
        ))}
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
      </div>
    </footer>
  );
}
