import { PHASE_INFO } from "@composer/core";
import { workspace } from "../../fixtures/workspace";
import playIcon from "../../assets/icons/play.svg";
import backIcon from "../../assets/icons/step-back.svg";
import forwardIcon from "../../assets/icons/step-forward.svg";
import flagIcon from "../../assets/icons/flag.svg";
import styles from "./HistoryBar.module.css";

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;

/** 150px history: transport, snapshot position, and the phase-colored timeline. */
export function HistoryBar() {
  const { snapshot, history, timeline } = workspace;
  return (
    <footer className={styles.history}>
      <div className={styles.transport}>
        <button type="button" className={styles.play} aria-label="Play history">
          <img src={playIcon} alt="" width={12} height={12} />
        </button>
        <button type="button" aria-label="Previous snapshot" className={styles.step}>
          <img src={backIcon} alt="" width={14} height={14} />
        </button>
        <button type="button" aria-label="Next snapshot" className={styles.step}>
          <img src={forwardIcon} alt="" width={14} height={14} />
        </button>
        <span className={styles.speed}>1×</span>
        <span className="caps">History</span>
        <span className={styles.position}>
          Snapshot {snapshot.current} of {snapshot.total}
        </span>
        <span className={styles.when}>{snapshot.when}</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action}>
          Bookmarks <span>{history.bookmarks}</span>
        </button>
        <button type="button" className={styles.action}>
          Branches <span>{history.branches}</span>
        </button>
        <button type="button" className={styles.action}>
          Compare
        </button>
      </div>

      <div className={styles.timeline}>
        <span className={styles.track} />
        {timeline.segments.map((s) => (
          <span
            key={s.phase}
            className={styles.segment}
            data-phase={s.phase}
            style={{ left: pct(s.start), width: pct(s.end - s.start) }}
          />
        ))}
        {timeline.segments.map((s) => (
          <span key={`l-${s.phase}`} className={styles.segmentLabel} style={{ left: pct(s.start) }}>
            {PHASE_INFO[s.phase].name}
          </span>
        ))}
        {timeline.ticks.map((t) => (
          <span key={t} className={styles.tick} style={{ left: pct(t) }} />
        ))}
        {timeline.branches.map((b) => (
          <span key={b.label} className={styles.branch} style={{ left: pct(b.from), width: pct(b.to - b.from) }}>
            <svg className={styles.branchCurve} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
              <path d="M0 32 C 18 32, 22 2, 40 2 L 100 2" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className={styles.branchLabel}>{b.label}</span>
            {b.retired && <span className={styles.branchX}>×</span>}
          </span>
        ))}
        {timeline.bookmarks.map((b) => (
          <span key={b.label} className={styles.bookmark} style={{ left: pct(b.at) }}>
            <span className={styles.flag}>
              <img src={flagIcon} alt="" width={11} height={11} />
              {b.label}
            </span>
            <span className={styles.stem} />
          </span>
        ))}
        <span className={styles.playhead} style={{ left: pct(timeline.playhead.at) }}>
          <span className={styles.knob} />
          <span className={styles.time}>{timeline.playhead.time}</span>
        </span>
      </div>
    </footer>
  );
}
