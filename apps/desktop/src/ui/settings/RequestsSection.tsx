import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { getSecret, SECRET } from "../../platform/secrets";
import { useUi } from "../../store/ui";
import { toast, useProject } from "../../store/project";
import { parseNotionId } from "../../requests/queue";
import { flushRequests, QUEUE_LINK, refreshRequests, useRequests } from "../../requests/store";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Field";
import styles from "./Settings.module.css";

/** Where ⌘K → Request a feature sends to: a Notion database, through an integration token in Keychain. */
export function RequestsSection() {
  const repo = useProject((s) => s.repo);
  const connected = useRequests((s) => s.connected);
  const pending = useRequests((s) => s.pending);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void getSecret(SECRET.notion).then((t) => setHasToken(!!t));
    void repo?.getSetting<string>(QUEUE_LINK).then((v) => setLink(v ?? ""));
    void refreshRequests();
  }, [repo]);

  const sendWaiting = async () => {
    setSending(true);
    const r = await flushRequests();
    setSending(false);
    if (r.sent.length) toast(`Sent ${r.sent.length} waiting ${r.sent.length === 1 ? "request" : "requests"} to the Dev queue`, "success");
    if (r.error) toast(r.error, "error");
  };


  const saveLink = async (value: string) => {
    await repo?.setSetting(QUEUE_LINK, value);
    setLink(value);
    await refreshRequests();
    if (useRequests.getState().connected && useRequests.getState().pending) await sendWaiting();
  };

  const linkOk = !link || !!parseNotionId(link);

  return (
    <section className={styles.section}>
      <span className="caps">Feature requests</span>
      <p className={styles.note}>
        ⌘K → Request a feature adds a Proposed row to a Notion database. Connect Notion in Connectors, share the database with the integration (••• → Connections), then paste the database link here.
      </p>
      <div className={styles.connector}>
        <div className={styles.connectorHead}>
          <span className={styles.connectorState}>{connected ? "Connected to Notion" : hasToken ? "Notion is connected · add the database link" : "Notion isn't connected yet"}</span>
          {!hasToken && (
            <Button variant="secondary" size="sm" icon={Plug} onClick={() => useUi.getState().openSettings("connectors", "notion")}>
              Connect Notion
            </Button>
          )}
        </div>
        {link !== null && (
          <label className={styles.pathRow}>
            <span>Database link</span>
            <Input
              className={styles.input}
              size="sm"
              mono
              placeholder="https://www.notion.so/…/Dev-queue-…"
              defaultValue={link}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim();
                if (value !== link) void saveLink(value);
              }}
              onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
            />
            {!linkOk && <span className={styles.help}>That doesn't look like a Notion database link.</span>}
          </label>
        )}
        <div className={styles.updateStatus}>
          <span className={styles.updateText}>{pending ? `${pending} ${pending === 1 ? "request" : "requests"} waiting to send` : "Nothing waiting to send"}</span>
          {pending > 0 && connected && (
            <Button variant="secondary" disabled={sending} onClick={() => void sendWaiting()}>
              {sending ? "Sending…" : "Send now"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
