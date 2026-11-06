import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { ClaudeNode, OutputNote } from "@composer/core";
import type { StatementForm as Form } from "@composer/engine";
import { actions } from "../../store/project";
import { Icon, IconButton, cx } from "../primitives";
import styles from "./Workspace.module.css";

export const LINES: { key: keyof Form; label: string; hint: string }[] = [
  { key: "believe", label: "We believe", hint: "the change, and why it should work" },
  { key: "whom", label: "For whom", hint: "a specific person, not “users”" },
  { key: "know_when", label: "We'll know when", hint: "a signal you can measure, with a number" },
];

/**
 * The statement in its fixed form. Editable in Define; read-only when pinned above the Validate
 * scorecard. A line can carry a designer's note to Claude for the next draft.
 */
export function StatementForm({ form, onChange, claude, readOnly, size = "hero" }: { form: Form; onChange?: (patch: Partial<Form>) => void; claude?: ClaudeNode; readOnly?: boolean; size?: "hero" | "pinned" }) {
  const [noting, setNoting] = useState<keyof Form | null>(null);
  const [note, setNote] = useState("");
  const notesFor = (k: keyof Form): OutputNote[] => (claude?.notes ?? []).filter((n) => n.anchor.kind === "field" && n.anchor.field === k);
  return (
    <div className={cx(styles.form, size === "pinned" && styles.formPinned)}>
      {LINES.map((l) => (
        <div key={l.key} className={styles.line}>
          <label className={styles.lineLabel} htmlFor={readOnly ? undefined : `line-${l.key}`}>
            {l.label}
          </label>
          {readOnly ? (
            <p className={styles.lineText}>{form[l.key] || <span className={styles.placeholder}>not set</span>}</p>
          ) : (
            <textarea
              id={`line-${l.key}`}
              className={styles.lineInput}
              value={form[l.key]}
              placeholder={l.hint}
              rows={l.key === "whom" ? 1 : 2}
              onChange={(e) => onChange?.({ [l.key]: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}
          {!readOnly && claude && (
            <button type="button" className={styles.noteBtn} title="Note for Claude's next draft" aria-label={`Note on ${l.label}`} onClick={() => setNoting(noting === l.key ? null : l.key)}>
              <Icon icon={MessageSquare} size="sm" />
              {notesFor(l.key).length ? <i>{notesFor(l.key).length}</i> : null}
            </button>
          )}
          {!readOnly && notesFor(l.key).length > 0 && (
            <ul className={styles.lineNotes}>
              {notesFor(l.key).map((n) => (
                <li key={n.id}>
                  {n.text}
                  <IconButton icon={X} label="Remove note" size="sm" className={styles.noteRemove} onClick={() => claude && actions.removeNote(claude.id, n.id)} />
                </li>
              ))}
            </ul>
          )}
          {noting === l.key && claude && (
            <form
              className={styles.noteForm}
              onSubmit={(e) => {
                e.preventDefault();
                actions.addNote(claude.id, { kind: "field", field: l.key, quote: form[l.key].slice(0, 120) }, note);
                setNote("");
                setNoting(null);
              }}
            >
              <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="What should the next draft do with this line?" />
              <button type="submit" disabled={!note.trim()}>
                Pin
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
