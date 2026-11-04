import { workspace, type MemoryRowData } from "../../fixtures/workspace";
import { useUi } from "../../store/ui";
import { Dot } from "../primitives/Dot";
import { cx } from "../primitives/cx";
import { SourceRow } from "./SourceRow";
import searchIcon from "../../assets/icons/search.svg";
import plusIcon from "../../assets/icons/plus.svg";
import styles from "./Sidebar.module.css";

const MEMORY_DOT: Record<MemoryRowData["dot"], string> = {
  hypothesis: "var(--signal-hypothesis)",
  retired: "var(--signal-retired)",
  rules: "var(--text-secondary)",
  understand: "var(--phase-understand)",
};

/** 248px left panel: search, sources, memory, foundations, memory health. */
export function Sidebar() {
  const phase = useUi((s) => s.activePhase);
  const { foundations, memoryHealth } = workspace;
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
          <button type="button" aria-label="Add source" className={styles.add}>
            <img src={plusIcon} alt="" width={12} height={12} />
          </button>
        </header>
        {workspace.sources.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}
      </section>

      <section className={styles.section}>
        <header className={styles.heading}>
          <span className="caps">Memory</span>
        </header>
        {workspace.memory.map((m) => (
          <div key={m.id} className={cx(styles.memoryRow, m.active && styles.memoryActive)}>
            <Dot color={MEMORY_DOT[m.dot]} size={7} />
            <span className={cx(styles.memoryLabel, m.retired && styles.retired)}>{m.label}</span>
            <span className={styles.meta}>{m.meta}</span>
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
            <span className={styles.slotTitle}>{foundations.designSystem.title}</span>
            <span className={styles.slotMeta}>{foundations.designSystem.meta}</span>
            <span className={cx(styles.badge, styles.badgeReview)}>{foundations.designSystem.badge}</span>
          </div>
        </div>
        <div className={styles.slot}>
          <span className={cx(styles.tile, styles.glyphTile)} aria-hidden>
            ¶
          </span>
          <div className={styles.slotText}>
            <span className={styles.slotTitle}>{foundations.philosophy.title}</span>
            <span className={styles.slotMeta}>{foundations.philosophy.meta}</span>
            <span className={styles.badge}>{foundations.philosophy.badge}</span>
          </div>
        </div>
      </section>

      <div className={styles.health}>
        <span className="caps">Memory</span>
        <span className={styles.healthTitle}>{memoryHealth.title}</span>
        <p className={styles.healthBody}>{memoryHealth.body}</p>
      </div>
    </aside>
  );
}
