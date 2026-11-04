import { useEffect, useState } from "react";
import { deleteSecret, getSecret, setSecret, SECRET } from "../../platform/secrets";
import { useUi } from "../../store/ui";
import { toast } from "../../store/project";
import { AnthropicLlm } from "../../llm/anthropic";
import styles from "./SettingsDialog.module.css";

/** ⌘, — the Anthropic API key (stored in Keychain) and a connection check. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (open) void getSecret(SECRET.anthropic).then((k) => setHasKey(!!k));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (!value.trim()) return;
    await setSecret(SECRET.anthropic, value.trim());
    setValue("");
    setHasKey(true);
    toast("API key saved to Keychain", "success");
  };

  const check = async () => {
    setChecking(true);
    try {
      const llm = new AnthropicLlm(() => getSecret(SECRET.anthropic));
      const n = await llm.countTokens({ model: "claude-opus-5-5", maxTokens: 1, effort: "low", system: [{ type: "text", text: "ping" }], messages: [{ role: "user", content: "ping" }] });
      toast(`Connected · Claude Opus 5.5 counted ${n} tokens`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.scrim} onPointerDown={() => setOpen(false)}>
      <div className={styles.dialog} role="dialog" aria-label="Settings" onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.title}>Settings</span>
          <button type="button" className={styles.close} onClick={() => setOpen(false)}>
            esc
          </button>
        </header>
        <section className={styles.section}>
          <span className="caps">Anthropic API key</span>
          <p className={styles.note}>
            Every Claude node runs on Claude Opus 5.5 with this key. It lives in your macOS Keychain under com.andrewhulin.composer and is never written to disk or the repo.
          </p>
          <div className={styles.row}>
            <input
              className={styles.input}
              type="password"
              autoFocus
              placeholder={hasKey ? "•••••••••••••••• saved in Keychain" : "sk-ant-…"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setOpen(false);
                e.stopPropagation();
              }}
            />
            <button type="button" className={styles.primary} onClick={() => void save()} disabled={!value.trim()}>
              Save
            </button>
          </div>
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={() => void check()} disabled={!hasKey || checking}>
              {checking ? "Checking…" : "Check connection"}
            </button>
            {hasKey && (
              <button
                type="button"
                className={styles.secondary}
                onClick={async () => {
                  await deleteSecret(SECRET.anthropic);
                  setHasKey(false);
                }}
              >
                Remove key
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
