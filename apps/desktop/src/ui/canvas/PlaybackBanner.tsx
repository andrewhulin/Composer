import { frames, playback, usePlayback } from "../../store/playback";
import { Button, Dot } from "../primitives";
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
      <Dot color="var(--phase-validate)" size={9} />
      <span className={styles.label}>PLAYBACK</span>
      <span className={styles.where}>
        Snapshot {index + 1} of {list.length} · {when} · read-only
        {snap.label ? ` · ${snap.label}` : ""}
      </span>
      <span className={styles.fill} />
      <Button variant="primary" onClick={() => void playback.branchFromHere()}>
        Branch from here
      </Button>
      <Button variant="secondary" shortcut="esc" onClick={() => playback.close()}>
        Exit
      </Button>
    </div>
  );
}
