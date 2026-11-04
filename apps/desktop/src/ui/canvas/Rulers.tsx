import styles from "./Rulers.module.css";

const START = 40;
const MINOR = 20;
const MAJOR = 200;

/** Top and right rulers from the technical overlay: minor ticks every 20, labelled majors every 200. */
export function Rulers({ width, height }: { width: number; height: number }) {
  const xs: number[] = [];
  for (let x = START; x <= width - 56; x += MINOR) xs.push(x);
  const ys: number[] = [];
  for (let y = START; y <= height - 20; y += MINOR) ys.push(y);
  const rightX = width - 36;
  return (
    <svg className={styles.rulers} width={width} height={height} aria-hidden>
      {xs.map((x) => {
        const major = (x - START) % MAJOR === 0;
        return <rect key={`x${x}`} x={x} y={0} width={1} height={major ? 8 : 4} className={styles.tick} />;
      })}
      {xs
        .filter((x) => (x - START) % MAJOR === 0)
        .map((x) => (
          <text key={`l${x}`} x={x + 4} y={8} className={styles.label}>
            {String(x - START).padStart(4, "0")}
          </text>
        ))}
      {ys.map((y) => {
        const major = (y - START) % MAJOR === 0;
        return (
          <rect key={`y${y}`} x={major ? rightX : rightX + 4} y={y} width={major ? 8 : 4} height={1} className={styles.tick} />
        );
      })}
    </svg>
  );
}
