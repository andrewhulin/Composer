import { frames, playback, usePlayback } from "../../store/playback";
import styles from "./PlaybackBanner.module.css";

/** Figma 04 · Playback mode: where you are, read-only, and the two ways out. */
export function PlaybackBanner() {
  const index = usePlayback((s) => s.index);
  usePlayback((s) => s.runsOnly);
  const list = frames();
  const snap = list[index];
  if (!snap) return null;
  const when = new Date(snap.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", ",");
  return (
    <div className={styles.banner}>
      <span className={styles.dot} />
      <span className={styles.label}>PLAYBACK</span>
      <span className={styles.where}>
        Snapshot {index + 1} of {list.length} · {when} · read-only
        {snap.label ? ` · ${snap.label}` : ""}
      </span>
      <span className={styles.fill} />
      <button type="button" className={styles.primary} onClick={() => void playback.branchFromHere()}>
        Branch from here
      </button>
      <button type="button" className={styles.secondary} onClick={() => playback.close()}>
        Exit <span>esc</span>
      </button>
    </div>
  );
}
