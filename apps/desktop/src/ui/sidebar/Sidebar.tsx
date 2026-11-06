import { PHASE_INFO, type HypothesisBlock, type OutputVersion, type SourceContent, type SourceNode } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Dot } from "../primitives/Dot";
import { openFoundations, useCraft } from "../../store/craft";
import { cx } from "../primitives/cx";
import { PLATFORM_LABEL } from "../nodes/kinds";
import { Pilcrow, Plus, Search } from "lucide-react";
import { Icon } from "../primitives/Icon";
import { IconButton } from "../primitives/Button";
import { Kbd } from "../primitives/Kbd";
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
  const craft = useCraft();
  const pending = craft.proposals.filter((p) => p.status === "pending" && p.targetKind !== "router").length;
  const dsPending = craft.proposals.filter((p) => p.status === "pending" && p.targetKind === "design_system").length;
  const latestRule = craft.rules.at(-1);
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
      <button type="button" className={styles.search} onClick={() => useUi.getState().setPaletteOpen(true)}>
        <Icon icon={Search} size="sm" />
        <span className={styles.searchText}>Search sources and memory</span>
        <Kbd className={styles.kbd}>⌘K</Kbd>
      </button>

      <section className={styles.section}>
        <header className={styles.heading}>
          <span className="caps">Sources</span>
          <IconButton icon={Plus} label="Add source" size="sm" onClick={() => setAddMenuOpen(true)} />
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
          <div
            key={h.id}
            role="button"
            tabIndex={0}
            title="Place on the canvas"
            className={cx(styles.memoryRow, styles.clickable, (h.status === "testing" || h.status === "draft") && styles.memoryActive)}
            onClick={() => actions.placeHypothesis(h.id)}
          >
            <Dot color={HYP_DOT[h.status]} size={7} />
            <span className={cx(styles.memoryLabel, h.status === "retired" && styles.retired)}>
              {h.label} · {h.statement.length > 32 ? `${h.statement.slice(0, 30)}…` : h.statement}
            </span>
            <span className={styles.meta}>{h.status}</span>
          </div>
        ))}
        <button type="button" className={cx(styles.memoryRow, styles.clickable)} onClick={() => openFoundations()}>
          <Dot color="var(--text-secondary)" size={7} />
          <span className={styles.memoryLabel}>Learned rules</span>
          <span className={styles.meta}>{craft.rules.length}</span>
        </button>
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

      <section className={cx(styles.section, styles.foundations)} data-tour="foundations">
        <header className={styles.heading}>
          <span className="caps">Foundations</span>
        </header>
        <button type="button" className={styles.slot} onClick={() => openFoundations()}>
          <span className={styles.tile} aria-hidden>
            <i style={{ left: 6, top: 6, background: "var(--phase-understand)" }} />
            <i style={{ left: 18, top: 6, background: "var(--phase-define)" }} />
            <i style={{ left: 6, top: 18, background: "var(--phase-build)" }} />
            <i style={{ left: 18, top: 18, background: "var(--phase-validate)" }} />
          </span>
          <div className={styles.slotText}>
            <span className={styles.slotTitle}>{craft.ds ? craft.ds.content.name : "Design system"}</span>
            <span className={styles.slotMeta}>{craft.ds ? `v${craft.ds.content.version} · ${craft.ds.content.tokens.length} tokens${dsPending ? ` · ${dsPending} to review` : ""}` : "not slotted yet"}</span>
          </div>
        </button>
        <button type="button" className={styles.slot} onClick={() => openFoundations()}>
          <span className={cx(styles.tile, styles.glyphTile)} aria-hidden>
            <Icon icon={Pilcrow} size="md" />
          </span>
          <div className={styles.slotText}>
            <span className={styles.slotTitle}>Design philosophy</span>
            <span className={styles.slotMeta}>{craft.philosophy ? `rev ${craft.philosophy.content.rev} · ${craft.philosophy.content.principles.length} principles` : "not slotted yet"}</span>
          </div>
        </button>
      </section>

      <button type="button" className={styles.health} onClick={() => openFoundations()}>
        <span className="caps">Memory</span>
        {pending > 0 ? (
          <>
            <span className={styles.healthTitle}>{pending} {pending === 1 ? "proposal" : "proposals"} to review</span>
            <p className={styles.healthBody}>Drafted from your scored runs and calls. Nothing applies until you keep it.</p>
          </>
        ) : latestRule ? (
          <>
            <span className={styles.healthTitle}>Latest rule · {PHASE_INFO[latestRule.phase].name}</span>
            <p className={styles.healthBody}>{latestRule.body}</p>
          </>
        ) : (
          <>
            <span className={styles.healthTitle}>No rules learned yet</span>
            <p className={styles.healthBody}>
              Score runs after Validate and Composer proposes rules from what scored higher. Nothing applies until you keep it. {craft.scoredCount > 0 && `${craft.scoredCount} scored so far.`}
            </p>
          </>
        )}
      </button>
    </aside>
  );
}
