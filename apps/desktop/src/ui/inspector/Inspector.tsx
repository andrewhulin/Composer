import { workspace } from "../../fixtures/workspace";
import { useUi, type InspectorTab } from "../../store/ui";
import { Dot } from "../primitives/Dot";
import { cx } from "../primitives/cx";
import { formatTokens } from "../primitives/format";
import { ContextChip } from "./ContextChip";
import { InstructionText, type RefTone } from "./InstructionText";
import styles from "./Inspector.module.css";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "prompt", label: "Prompt" },
  { id: "node", label: "Node" },
];

const toneOf = (name: string): RefTone => (name === "insights" ? "inlet" : /^H\d+$/.test(name) ? "hypothesis" : "plain");

/** 344px right panel: live preview of the selected node's output, prompt assembly, actions. */
export function Inspector() {
  const phase = useUi((s) => s.activePhase);
  const tab = useUi((s) => s.inspectorTab);
  const setTab = useUi((s) => s.setInspectorTab);
  const enabled = useUi((s) => s.chipEnabled);
  const toggleChip = useUi((s) => s.toggleChip);
  const { preview, chips, alwaysOn, budget } = workspace;

  const on = chips.filter((c) => enabled[c.id]);
  const used = on.reduce((sum, c) => sum + c.tokens, 0);
  const total = used + alwaysOn.tokens;

  return (
    <aside className={styles.inspector} data-phase={phase}>
      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cx(styles.tab, tab === t.id && styles.tabActive)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.scroll}>
        <section className={styles.preview}>
          <div className={styles.row}>
            <Dot color="var(--signal-live)" />
            <span className={styles.live}>LIVE</span>
            <span className={styles.fill} />
            <span className={styles.meta}>{preview.source}</span>
          </div>
          <article className={styles.paper}>
            <span className={styles.paperLabel}>{preview.label.toUpperCase()}</span>
            <h2 className={styles.paperHeadline}>{preview.headline}</h2>
            <div className={styles.paperBody}>
              {preview.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <span className={styles.paperFooter}>{preview.footer}</span>
          </article>
        </section>

        <section className={styles.prompt}>
          <div className={styles.row}>
            <span className="caps">Context</span>
            <span className={styles.metaSecondary}>
              {on.length} of {chips.length}
            </span>
            <span className={styles.fill} />
            <span className={styles.meta}>
              {formatTokens(total)} / {formatTokens(budget)}
            </span>
          </div>
          <div className={styles.budget} aria-label={`${formatTokens(total)} of ${formatTokens(budget)} tokens`}>
            {on.map((c) => (
              <span
                key={c.id}
                style={{
                  width: `max(4px, ${(c.tokens / budget) * 100}%)`,
                  background: c.dot === "inlet" ? "var(--phase-understand)" : "var(--text-secondary)",
                }}
              />
            ))}
          </div>
          <div className={styles.alwaysOn}>
            <span className={styles.alwaysLabel}>ALWAYS ON</span>
            <span className={styles.fill} />
            <span className={styles.pill}>
              <Dot color="var(--phase-understand)" size={5} />
              {alwaysOn.designSystem}
            </span>
            <span className={styles.pill}>
              <Dot color="var(--text-secondary)" size={5} />
              {alwaysOn.philosophy}
            </span>
          </div>
          {chips.map((c) => (
            <ContextChip key={c.id} chip={c} enabled={!!enabled[c.id]} onToggle={() => toggleChip(c.id)} />
          ))}
          <span className={cx("caps", styles.instructionLabel)}>Instruction</span>
          <div className={styles.instruction}>
            <InstructionText text={workspace.instruction} toneOf={toneOf} />
          </div>
        </section>
      </div>

      <footer className={styles.actions}>
        <button type="button" className={styles.run}>
          <span>Run node</span>
          <span className={styles.runKey}>⌘↵</span>
        </button>
        <button type="button" className={styles.snapshot}>
          <span>Snapshot</span>
          <span className={styles.snapshotKey}>⌘B</span>
        </button>
      </footer>
    </aside>
  );
}
