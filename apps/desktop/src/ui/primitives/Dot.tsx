import styles from "./Dot.module.css";

/** A small status dot. `color` is any CSS color, usually a token. */
export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <span className={styles.dot} style={{ background: color, width: size, height: size }} />;
}
