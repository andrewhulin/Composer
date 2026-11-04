import { PHASE_INFO, type HypothesisBlock, type OutputVersion, type SourceContent, type SourceNode } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Dot } from "../primitives/Dot";
import { cx } from "../primitives/cx";
import { PLATFORM_LABEL } from "../nodes/kinds";
import searchIcon from "../../assets/icons/search.svg";
import plusIcon from "../../assets/icons/plus.svg";
import styles from "./Sidebar.module.css";
import rowStyles from "./SourceRow.module.css";

const HYP_DOT: Record<HypothesisBlock["status"], string> = {
  draft: "var(--text-muted)",
  testing: "var(--signal-hypothesis)",
  held: "var(--signal-live)",
  failed: "var(--phase-define)",
  retired: "var(--signal-retired)",
};

/** 248px left panel: search, sources, memory, foundations, memory health. */
export function Sidebar() {
  const phase = useProject((s) => s.activePhase);
  const loop = useProject((s) => s.loop);
  const graph = useProject((s) => s.graph);
  const blobs = useProject((s) => s.blobs);
  const selection = useProject((s) => s.selection);
  const hypotheses = useProject((s) => s.hypotheses);
  const versions = useProject((s) => s.versions);
  const setAddMenuOpen = useUi((s) => s.setAddMenuOpen);

  const sources = Object.values(graph.nodes).filter((n): n is SourceNode => n.kind === "source" && n.loop === loop);
  const wiredHere = new Set(graph.edges.filter((e) => graph.nodes[e.to]?.phase === phase).map((e) => e.from));
  const latestByPhase = new Map<string, OutputVersion>();
  for (const v of Object.values(versions)) {
    const prev = latestByPhase.get(v.phase);
    if (v.loop === loop && (!prev || prev.version < v.version)) latestByPhase.set(v.phase, v);
  }
  const chain = Object.values(hypotheses);

  return (
    <aside className={styles.sidebar} data-phase={phase}>
      <div className={styles.search}>
        <img src={searchIcon} alt="" width={12} height={12} />
        <span className={styles.searchText}>Search sources and memory</span>
        <span className={styles.kbd}>⌘K</span>
      </div>

      <section className={styles.section}>
        <header className={styles.heading}>
          <span className="caps">Sources</span>
          <button type="button" aria-label="Add source" className={styles.add} onClick={() => setAddMenuOpen(true)}>
            <img src={plusIcon} alt="" width={12} height={12} />
          </button>
        </header>
        {sources.length === 0 && <p className={styles.empty}>Drop files or links on the canvas, or paste with ⌘V.</p>}
        {sources.map((s) => {
          const content = s.contentHash ? (blobs.get(s.contentHash) as SourceContent | undefined) : undefined;
          const count = content?.items.reduce((n, i) => n + i.units.length, 0) ?? 0;
          const wired = wiredHere.has(s.id);
          return (
            <button
              type="button"
              key={s.id}
              className={cx(rowStyles.row, selection === s.id && rowStyles.dragging)}
              onClick={() => {
                if (s.phase !== phase) void actions.setActivePhase(s.phase);
                actions.select(s.id);
              }}
            >
              <span className={cx(rowStyles.tile, wired && rowStyles.wired)}>{PLATFORM_LABEL[s.platform].slice(0, 1)}</span>
              <span className={rowStyles.name}>{s.title}</span>
              <span className={cx(rowStyles.count, wired && rowStyles.countWired)}>{s.weight === "mute" ? "muted" : count}</span>
            </button>
          );
        })}
      </section>

      <section className={styles.section}>
        <header className={styles.heading}>
          <span className="caps">Memory</span>
        </header>
        {chain.map((h) => (
          <div key={h.id} className={cx(styles.memoryRow, (h.status === "testing" || h.status === "draft") && styles.memoryActive)}>
            <Dot color={HYP_DOT[h.status]} size={7} />
            <span className={cx(styles.memoryLabel, h.status === "retired" && styles.retired)}>
              {h.label} · {h.statement.length > 32 ? `${h.statement.slice(0, 30)}…` : h.statement}
            </span>
            <span className={styles.meta}>{h.status}</span>
          </div>
        ))}
        <div className={styles.memoryRow}>
          <Dot color="var(--text-secondary)" size={7} />
          <span className={styles.memoryLabel}>Learned rules</span>
          <span className={styles.meta}>0</span>
        </div>
        {[...latestByPhase.values()].map((v) => (
          <div key={v.id} className={styles.memoryRow}>
            <Dot color={`var(--phase-${v.phase})`} size={7} />
            <span className={styles.memoryLabel}>
              {PHASE_INFO[v.phase].output} · {PHASE_INFO[v.phase].name}
            </span>
            <span className={styles.meta}>v{v.version}</span>
          </div>
        ))}
      </section>

      <section className={cx(styles.section, styles.foundations)}>
        <header className={styles.heading}>
          <span className="caps">Foundations</span>
        </header>
        <div className={styles.slot}>
          <span className={styles.tile} aria-hidden>
            <i style={{ left: 5, top: 5, background: "var(--phase-understand)" }} />
            <i style={{ left: 13, top: 5, background: "var(--phase-define)" }} />
            <i style={{ left: 5, top: 13, background: "var(--phase-build)" }} />
            <i style={{ left: 13, top: 13, background: "var(--phase-validate)" }} />
          </span>
          <div className={styles.slotText}>
            <span className={styles.slotTitle}>Design system</span>
            <span className={styles.slotMeta}>not slotted yet</span>
          </div>
        </div>
        <div className={styles.slot}>
          <span className={cx(styles.tile, styles.glyphTile)} aria-hidden>
            ¶
          </span>
          <div className={styles.slotText}>
            <span className={styles.slotTitle}>Design philosophy</span>
            <span className={styles.slotMeta}>not slotted yet</span>
          </div>
        </div>
      </section>

      <div className={styles.health}>
        <span className="caps">Memory</span>
        <span className={styles.healthTitle}>No rules learned yet</span>
        <p className={styles.healthBody}>Score runs after Validate and Composer proposes rules from what scored higher. Nothing applies until you keep it.</p>
      </div>
    </aside>
  );
}
