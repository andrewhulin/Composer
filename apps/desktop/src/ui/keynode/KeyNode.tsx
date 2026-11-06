import { useState } from "react";
import { PHASE_INFO, type Phase } from "@composer/core";
import { ArrowRight, ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, IconButton, Icon, Textarea, cx } from "../primitives";
import { useKey, type KeyStatus } from "../workspace/useKey";
import styles from "./KeyNode.module.css";

const STATUS: Record<KeyStatus, string> = { empty: "Empty", draft: "Draft", locked: "Locked", newer: "Newer draft" };

/**
 * The key node: every workspace ends in this one typed output, pinned top right in every phase.
 * Its prompt preview is exactly what the next phase's prompt will read, and it can be edited.
 */
export function KeyNode({ phase }: { phase: Phase }) {
  const key = useKey(phase);
  const open = useUi((s) => s.keyOpen);
  const setOpen = useUi((s) => s.setKeyOpen);
  const loop = useProject((s) => s.loop);
  const [editing, setEditing] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState(true);
  if (!key) return null;
  const { output, handoff, status, latest } = key;
  const info = PHASE_INFO[phase];
  const blocked = handoff.missing.length > 0;
  const readOnly = output.loop !== loop;

  const lock = () => {
    if (phase === "define") void actions.lockStatement(output.id);
    else void actions.lock(output.id);
  };

  return (
    <section className={cx(styles.dock, !open && styles.folded)} data-phase={phase} data-tour="key-node" aria-label="Key node">
      <header className={styles.head}>
        <span className={styles.index}>{info.index}</span>
        <span className={styles.kicker}>KEY</span>
        <span className={styles.title}>{handoff.title}</span>
        <span className={cx(styles.status, styles[`s_${status}`])}>{status === "locked" || status === "newer" ? `v${latest?.version ?? ""} · ${STATUS[status]}` : STATUS[status]}</span>
        <IconButton icon={open ? Minus : Plus} label={open ? "Fold key node" : "Open key node"} variant="secondary" size="sm" onClick={() => setOpen(!open)} />
      </header>
      {open && (
        <>
          <dl className={styles.fields}>
            {handoff.fields.map((f) => (
              <div key={f.key} className={cx(styles.field, !f.value && f.required && styles.missing)}>
                <dt>
                  {f.label}
                  {f.required && <i aria-label="required">*</i>}
                </dt>
                <dd className={cx(f.long && styles.long)}>{f.value || (f.required ? "missing" : "none")}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.target}>
            <Icon icon={ArrowRight} size="sm" />
            {key.target}
          </div>

          <div className={styles.previewHead}>
            <button type="button" className={styles.previewToggle} onClick={() => setShowDoc(!showDoc)}>
              <Icon icon={showDoc ? ChevronDown : ChevronRight} size="sm" />
              Prompt preview
            </button>
            <span className={styles.previewMeta}>{key.live ? "live from the next prompt" : "as the next prompt will read it"}</span>
          </div>
          {showDoc && editing === null && (
            <>
              <pre className={styles.doc} data-tour="key-preview">
                {key.doc}
              </pre>
              <div className={styles.row}>
                {!readOnly && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(handoff.text)}>
                    Edit handoff
                  </Button>
                )}
                {key.handEdit && (
                  <Button variant="secondary" size="sm" onClick={() => actions.setDraft(output.id, { text: undefined })}>
                    Reset to Claude's
                  </Button>
                )}
                <span className={styles.fill} />
                <span className={styles.tokens}>~{Math.ceil(key.doc.length / 4)} tok</span>
              </div>
            </>
          )}
          {editing !== null && (
            <div className={styles.edit}>
              <Textarea mono size="sm" value={editing} onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => e.stopPropagation()} rows={10} aria-label="Handoff text" />
              <p className={styles.hint}>{status === "locked" ? "Saving makes a new version; the next phase moves to it." : "Your edit ships with the lock."}</p>
              <div className={styles.row}>
                <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <span className={styles.fill} />
                <Button
                  variant="phase"
                  size="sm"
                  onClick={() => {
                    void actions.reviseHandoff(output.id, editing, status === "locked" ? latest?.id : undefined);
                    setEditing(null);
                  }}
                >
                  Save handoff
                </Button>
              </div>
            </div>
          )}

          {!readOnly && editing === null && (
            <footer className={styles.footer}>
              {blocked && <span className={styles.blocked}>Needs {handoff.missing.join(", ").toLowerCase()}</span>}
              <span className={styles.fill} />
              {phase === "validate" ? (
                <>
                  <button type="button" className={styles.holds} disabled={blocked} onClick={() => void actions.lock(output.id, "holds")}>
                    Holds → Share
                  </button>
                  <button type="button" className={styles.misses} disabled={blocked} onClick={() => void actions.lock(output.id, "misses")}>
                    <Icon icon={RotateCcw} size="sm" />
                    Misses
                  </button>
                </>
              ) : (
                <Button variant="phase" size="sm" disabled={blocked || status === "locked" || status === "empty"} onClick={lock}>
                  {status === "locked" ? "Locked" : status === "newer" ? `Lock v${(latest?.version ?? 0) + 1}` : `Lock ${handoff.title.toLowerCase()}`}
                </Button>
              )}
            </footer>
          )}
        </>
      )}
    </section>
  );
}
