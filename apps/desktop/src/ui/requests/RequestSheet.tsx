import { useEffect, useMemo, useState } from "react";
import { useUi } from "../../store/ui";
import { toast, useProject } from "../../store/project";
import { AREAS, AREA_FOR_PHASE, type Area } from "../../requests/queue";
import { describeContext, refreshRequests, submitRequest, useRequests } from "../../requests/store";
import { Button } from "../primitives/Button";
import { Chip } from "../primitives/Chip";
import { Input, Textarea } from "../primitives/Field";
import styles from "./RequestSheet.module.css";

/** ⌘K → Request a feature: a short form that lands as a Proposed row in the Dev queue in Notion. */
export function RequestSheet() {
  const open = useUi((s) => s.requestOpen);
  return open ? <RequestForm /> : null;
}

function RequestForm() {
  const close = () => useUi.getState().setRequestOpen(false);
  const phase = useProject((s) => s.activePhase);
  const connected = useRequests((s) => s.connected);
  const pending = useRequests((s) => s.pending);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [areas, setAreas] = useState<Area[]>([AREA_FOR_PHASE[phase]]);
  const [withContext, setWithContext] = useState(true);
  const [sending, setSending] = useState(false);
  const context = useMemo(() => describeContext(), []);

  useEffect(() => {
    void refreshRequests();
  }, []);

  const toggle = (a: Area) => setAreas((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));

  const send = async () => {
    if (!title.trim() || sending) return;
    setSending(true);
    try {
      const r = await submitRequest({ title, why, areas, context: withContext ? context : undefined });
      close();
      const row = r.sent.find((s) => s.id === r.id);
      if (row) toast(`Sent to the Dev queue${row.number ? ` as #${row.number}` : ""} · Proposed`, "success");
      else if (r.notConnected) toast("Saved. It goes to the Dev queue once Notion is connected in Settings.");
      else toast(`Saved here for now. ${r.error ?? ""} It'll send next time.`, "error");
    } catch (e) {
      setSending(false);
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className={styles.scrim} onPointerDown={close}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="Request a feature"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Enter" && e.metaKey) void send();
          e.stopPropagation();
        }}
      >
        <header className={styles.header}>
          <span className={styles.title}>Request a feature</span>
          <Button variant="ghost" size="sm" shortcut="esc" onClick={close} />
        </header>
        <div className={styles.body}>
          <label className={styles.field}>
            <span className="caps">What should Composer do?</span>
            <Input autoFocus maxLength={160} placeholder="Let me drag variants to reorder a round" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className="caps">Why, and how you'd use it</span>
            <Textarea
              className={styles.textarea}
              rows={4}
              placeholder="What you were trying to do, what got in the way, what done looks like."
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
          <div className={styles.field}>
            <span className="caps">Area</span>
            <div className={styles.areas}>
              {AREAS.map((a) => (
                <Chip key={a} selected={areas.includes(a)} onClick={() => toggle(a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </div>
          <label className={styles.context}>
            <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
            <span>
              Include where I am
              <span className={styles.contextText}>{context}</span>
            </span>
          </label>
        </div>
        <footer className={styles.footer}>
          <span className={styles.status}>
            {!connected ? (
              <>
                Notion isn't connected yet, so this waits here until it is.{" "}
                <button type="button" className={styles.link} onClick={() => (close(), useUi.getState().setSettingsOpen(true))}>
                  Set it up
                </button>
              </>
            ) : pending > 0 ? (
              `Goes to the Dev queue as Proposed, with ${pending} earlier ${pending === 1 ? "request" : "requests"} still waiting.`
            ) : (
              "Goes to the Dev queue in Notion as Proposed."
            )}
          </span>
          <Button variant="secondary" size="md" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" size="md" shortcut="⌘↵" disabled={!title.trim() || sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
