import { useEffect, useState } from "react";
import { deleteSecret, getSecret, setSecret, SECRET } from "../../platform/secrets";
import { toast, useProject } from "../../store/project";
import { parseNotionId } from "../../requests/queue";
import { flushRequests, QUEUE_LINK, refreshRequests, useRequests } from "../../requests/store";
import styles from "./SettingsDialog.module.css";

/** Where ⌘K → Request a feature sends to: a Notion database, through an integration token in Keychain. */
export function RequestsSection() {
  const repo = useProject((s) => s.repo);
  const connected = useRequests((s) => s.connected);
  const pending = useRequests((s) => s.pending);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
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

  const saveToken = async () => {
    if (!token.trim()) return;
    await setSecret(SECRET.notion, token.trim());
    setToken("");
    setHasToken(true);
    toast("Notion token saved to Keychain", "success");
    await refreshRequests();
    if (useRequests.getState().connected && useRequests.getState().pending) await sendWaiting();
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
        ⌘K → Request a feature adds a Proposed row to a Notion database. Make an integration at notion.so/profile/integrations, share the database with it (••• → Connections), then paste its token and the database link here.
      </p>
      <div className={styles.connector}>
        <div className={styles.connectorHead}>
          <span className={styles.connectorName}>Notion</span>
          <span className={styles.connectorState}>{connected ? "connected" : hasToken ? "needs the database link" : "needs a token"}</span>
        </div>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="password"
            placeholder={hasToken ? "•••••••• saved" : "Integration token (ntn_…)"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveToken();
              if (e.key !== "Escape") e.stopPropagation();
            }}
          />
          <button type="button" className={styles.secondary} onClick={() => void saveToken()} disabled={!token.trim()}>
            Save
          </button>
          {hasToken && (
            <button
              type="button"
              className={styles.secondary}
              onClick={async () => {
                await deleteSecret(SECRET.notion);
                setHasToken(false);
                await refreshRequests();
              }}
            >
              Remove
            </button>
          )}
        </div>
        {link !== null && (
          <label className={styles.pathRow}>
            <span>Database link</span>
            <input
              className={styles.input}
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
            <button type="button" className={styles.secondary} disabled={sending} onClick={() => void sendWaiting()}>
              {sending ? "Sending…" : "Send now"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
