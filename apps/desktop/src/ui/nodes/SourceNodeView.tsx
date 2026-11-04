import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { SourceContent, SourceNode } from "@composer/core";
import { useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import { KIND_BADGE, PLATFORM_LABEL } from "./kinds";
import { Port } from "./Port";
import { WeightPopover } from "./WeightPopover";
import styles from "./Node.module.css";
import own from "./SourceNodeView.module.css";

function summary(content: SourceContent | undefined): string {
  if (!content) return "not synced";
  const units = content.items.reduce((s, i) => s + i.units.length, 0);
  const kind = content.items[0]?.kind;
  if (kind === "transcript") return `${content.items.length} transcript${content.items.length > 1 ? "s" : ""}, ${units} lines`;
  if (content.items.length > 1) return `${content.items.length} items`;
  return `${units} ${units === 1 ? "passage" : "passages"}`;
}

/** A bar pattern derived from the text, so a transcript's waveform is stable but distinct. */
function bars(seed: string, n = 56): number[] {
  let h = 2166136261;
  return Array.from({ length: n }, (_, i) => {
    h ^= seed.charCodeAt(i % Math.max(1, seed.length)) + i;
    h = Math.imul(h, 16777619);
    return 8 + ((h >>> 0) % 28);
  });
}

/**
 * Node/Source. In Understand it is a context card sized by its weight (Collect → Weigh);
 * elsewhere it is the full source node with a visual preview when it has one.
 */
export const SourceNodeView = memo(function SourceNodeView({ id, selected }: NodeProps) {
  const node = useProject((s) => s.graph.nodes[id]) as SourceNode | undefined;
  const content = useProject((s) => (node?.contentHash ? (s.blobs.get(node.contentHash) as SourceContent | undefined) : undefined));
  const shake = useProject((s) => (s.shake?.id === id ? s.shake.at : 0));
  if (!node) return null;
  const first = content?.items[0];
  const badge = KIND_BADGE[first?.kind ?? "note"];
  const image = content?.items.find((i) => i.image)?.image;

  if (node.phase === "understand") {
    return (
      <div
        className={cx(own.card, own[node.weight], selected && own.selected, shake && styles.shake)}
        key={shake}
        style={{ ["--badge" as string]: badge.color, ["--badge-rgb" as string]: badge.rgb }}
      >
        {node.pinned && <span className={own.pinRing} aria-hidden />}
        <div className={own.cardHeader}>
          <span className={own.badge}>{badge.letter}</span>
          <span className={own.kind}>{badge.label}</span>
        </div>
        <p className={own.cardTitle}>{node.title}</p>
        {image && node.weight !== "mute" && <img className={own.thumb} src={image} alt="" draggable={false} />}
        <span className={own.meta}>
          {node.weight === "mute" ? "muted" : node.weight}
          {node.why ? ` · ${node.why}` : ""}
        </span>
        <Port nodeId={id} port="out" type="context" side="out" top={14} />
        {selected && <WeightPopover id={id} weight={node.weight} pinned={node.pinned} {...(node.why ? { why: node.why } : {})} />}
      </div>
    );
  }

  const quote = first?.kind === "transcript" ? (first.units.find((u) => u.starred) ?? first.units[0]) : undefined;
  return (
    <div className={cx(styles.node, own.full, selected && styles.selected, node.weight === "mute" && own.muted, shake && styles.shake)} key={shake}>
      <div className={styles.header}>
        <span className={cx(styles.glyph, own.glyph)}>{PLATFORM_LABEL[node.platform].slice(0, 1)}</span>
        <span className={styles.title}>{node.title}</span>
        <span className={styles.tag}>Source{node.weight !== "normal" ? ` · ${node.weight}` : ""}</span>
      </div>
      {image ? (
        <div className={own.previewWrap}>
          <div className={own.preview}>
            <img src={image} alt="" draggable={false} className={own.previewImg} />
            <Corners />
          </div>
        </div>
      ) : quote ? (
        <div className={own.previewWrap}>
          <div className={own.preview}>
            <div className={own.wave}>
              {bars(first!.title).map((h, i) => (
                <span key={i} style={{ height: h, background: i < 31 ? "var(--phase-understand)" : "#4a4a52" }} />
              ))}
            </div>
            <p className={own.quote}>“{quote.text.length > 60 ? `${quote.text.slice(0, 58)}…` : quote.text}”</p>
            {quote.label && <span className={own.quoteLabel}>{quote.label}</span>}
            <Corners />
          </div>
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.row}>
            <span className={styles.key}>items</span>
            <span className={styles.val}>{summary(content)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.key}>sync</span>
            <span className={styles.val}>{content?.syncedAt ? "frozen" : "—"}</span>
          </div>
        </div>
      )}
      {(image || quote) && (
        <div className={own.footer}>
          <span>{summary(content)}</span>
          <span>{PLATFORM_LABEL[node.platform]}</span>
        </div>
      )}
      <Port nodeId={id} port="out" type="context" side="out" top={14} />
    </div>
  );
});

function Corners() {
  return (
    <>
      <span className={cx(own.corner, own.tl)} />
      <span className={cx(own.corner, own.tr)} />
      <span className={cx(own.corner, own.bl)} />
      <span className={cx(own.corner, own.br)} />
    </>
  );
}
