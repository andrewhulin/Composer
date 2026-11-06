import { lazy, Suspense, type CSSProperties } from "react";
import { MousePointer2 } from "lucide-react";
import { GUIDE_ASSETS } from "../../connections/assets";
import type { Integration, Mock } from "../../connections/registry";
import { Icon } from "../primitives/Icon";
import { cx } from "../primitives/cx";
import styles from "./Guide.module.css";

const RiveGuide = lazy(() => import("./RiveGuide"));

/**
 * The animation beside a setup step. A guide.riv in assets/connectors/<id> wins; then a GIF,
 * image or MP4 for this step; then a coded mock of the provider's screen with a moving cursor.
 */
export function Guide({ integration, step }: { integration: Integration; step: number }) {
  const assets = GUIDE_ASSETS[integration.id];
  const label = `${integration.name} setup, step ${step}: ${integration.steps[step - 1]?.title ?? ""}`;
  if (assets?.riv) {
    return (
      <div className={styles.frame}>
        <Suspense fallback={<CodedGuide mock={integration.steps[step - 1]!.mock} label={label} />}>
          <RiveGuide src={assets.riv} step={step} label={label} />
        </Suspense>
      </div>
    );
  }
  const media = assets?.steps[step];
  if (media) {
    return (
      <div className={styles.frame}>
        {media.kind === "video" ? <video className={styles.media} src={media.url} autoPlay loop muted playsInline aria-label={label} /> : <img className={styles.media} src={media.url} alt={label} />}
      </div>
    );
  }
  return (
    <div className={styles.frame}>
      <CodedGuide key={`${integration.id}-${step}`} mock={integration.steps[step - 1]!.mock} label={label} />
    </div>
  );
}

/** A stand-in until a real animation is dropped in: the screen, the row to click, a cursor going there. */
function CodedGuide({ mock, label }: { mock: Mock; label: string }) {
  const target = mock.field ? 0 : (mock.target ?? 0);
  return (
    <div className={styles.window} role="img" aria-label={label}>
      <div className={styles.chrome}>
        <span className={styles.lights} aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className={styles.screen}>{mock.screen}</span>
      </div>
      <div className={styles.body} style={{ "--target": target } as CSSProperties}>
        {mock.field ? (
          <div className={styles.fieldRow}>
            <span className={cx(styles.fakeField, styles.hot)}>{mock.field}</span>
            <span className={styles.fakeButton}>Test</span>
          </div>
        ) : (
          (mock.items ?? []).map((item, i) => (
            <span key={item} className={cx(styles.item, i === target && styles.hot)}>
              {item}
            </span>
          ))
        )}
        <span className={styles.cursor} aria-hidden>
          <Icon icon={MousePointer2} size="lg" fill="currentColor" />
        </span>
      </div>
    </div>
  );
}
