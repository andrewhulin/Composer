import { useEffect, useRef, useState } from "react";
import type { Hash, Id } from "@composer/core";
import { FIDELITIES, lintAgainstTokens, type Fidelity, type PrototypeData } from "@composer/engine";
import { actions, toast } from "../../store/project";
import { figmaPayload, prototypeUrl, serialize } from "../../build/runtime";
import { currentTokens, recordLint } from "../../store/craft";
import { cx } from "../primitives/cx";
import styles from "./PrototypeView.module.css";

const W = 390;
const H = 844;

/** The sandboxed prototype. Scripts run; nothing reaches Composer's origin, the network or storage. */
export function PrototypeFrame({ hash, html, width, onFrame }: { hash: Hash; html: string; width: number; onFrame?: (f: HTMLIFrameElement | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void prototypeUrl(hash, html).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [hash, html]);
  const scale = width / W;
  return (
    <div className={styles.device} style={{ width, height: H * scale }}>
      {url && (
        <iframe
          ref={onFrame}
          title="Prototype"
          src={url}
          sandbox="allow-scripts"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

/** Figma 07 · Build: fidelity, the prototype, and where it goes next. */
export function PrototypeView({ data, hash, claudeId }: { data: PrototypeData; hash: Hash; claudeId?: Id }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [large, setLarge] = useState(false);
  const [onSystem, setOnSystem] = useState<number | null | undefined>(undefined);
  const fidelity = data.fidelity;

  const check = async () => {
    if (!frame.current) return;
    try {
      const s = await serialize(frame.current);
      const lint = lintAgainstTokens(s.used, currentTokens());
      setOnSystem(lint.pct);
      // Each check is evidence: the same override across builds becomes a design-system proposal.
      if (lint.pct !== null) await recordLint(hash, data.title, lint);
    } catch {
      setOnSystem(undefined);
    }
  };

  const sendToFigma = async () => {
    if (!frame.current) return;
    try {
      const s = await serialize(frame.current);
      if (!s.tree.length) throw new Error("The prototype hasn't laid out yet. Open it large, then send again.");
      await navigator.clipboard.writeText(figmaPayload(s, currentTokens()));
      toast(`Copied ${s.tree.length} screen${s.tree.length === 1 ? "" : "s"} for Figma. In Figma, run Design Composer → Paste from Composer.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className={styles.view}>
      <span className="caps">Fidelity</span>
      <div className={styles.fidelity}>
        {(Object.keys(FIDELITIES) as Fidelity[]).map((f) => (
          <button
            key={f}
            type="button"
            className={cx(styles.fid, f === fidelity && styles.fidOn)}
            onClick={() => claudeId && actions.update(claudeId, { options: { fidelity: f } })}
            title={claudeId ? `Build ${FIDELITIES[f].toLowerCase()} next run` : undefined}
          >
            <span className={cx(styles.sketch, styles[`sketch_${f}`])} />
            {FIDELITIES[f]}
            {f === fidelity && <i />}
          </button>
        ))}
      </div>
      <PrototypeFrame hash={hash} html={data.html} width={316} onFrame={(f) => (frame.current = f)} />
      <p className={styles.title}>{data.title}</p>
      <p className={styles.rationale}>{data.rationale}</p>
      <div className={styles.screens}>
        {data.screens.map((s) => (
          <span key={s.name} title={s.purpose}>
            {s.name}
          </span>
        ))}
      </div>
      <span className="caps">Build in</span>
      <div className={styles.targets}>
        <button type="button" onClick={() => setLarge(true)}>
          Code prototype <em>open large</em>
        </button>
        <button type="button" onClick={() => void sendToFigma()}>
          Figma <em>send frames</em>
        </button>
        <button type="button" onClick={() => void check()}>
          On-system <em>{onSystem === undefined ? "check" : onSystem === null ? "slot a design system" : `${onSystem}%`}</em>
        </button>
      </div>
      {large && (
        <div className={styles.overlay} onPointerDown={() => setLarge(false)}>
          <div onPointerDown={(e) => e.stopPropagation()}>
            <PrototypeFrame hash={hash} html={data.html} width={Math.min(390, Math.round((window.innerHeight - 120) * (W / H)))} />
            <p className={styles.overlayHint}>{data.title} · esc or click outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
