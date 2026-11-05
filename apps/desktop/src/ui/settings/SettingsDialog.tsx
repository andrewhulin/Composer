import { useEffect, useState } from "react";
import { deleteSecret, getSecret, setSecret, SECRET } from "../../platform/secrets";
import { useUi } from "../../store/ui";
import { toast, useProject } from "../../store/project";
import { AnthropicLlm } from "../../llm/anthropic";
import { CONNECTORS, type Connector } from "../../connectors";
import { rendererDefaultDir } from "../../platform/share";
import { UpdatesSection } from "./UpdatesSection";
import styles from "./SettingsDialog.module.css";

/** ⌘, — the Anthropic API key (stored in Keychain) and a connection check. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [rendererHint, setRendererHint] = useState<string | null>(null);

  useEffect(() => {
    if (open) void getSecret(SECRET.anthropic).then((k) => setHasKey(!!k));
    if (open) void rendererDefaultDir().then(setRendererHint);
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
        <section className={styles.section} data-tour="settings-key">
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
        <section className={styles.section} data-tour="settings-sources">
          <span className="caps">Sources</span>
          <p className={styles.note}>Paste or drop a link from any of these and Composer pulls it through the API. Tokens live in Keychain.</p>
          {CONNECTORS.map((c) => (
            <ConnectorRow key={c.platform} connector={c} />
          ))}
        </section>
        <section className={styles.section}>
          <span className="caps">Share</span>
          <p className={styles.note}>The release video renders with Remotion and the system Node. PRs open from a temporary worktree, so your checkout is never touched.</p>
          <PathSetting settingKey="renderer_dir" label="Renderer folder" placeholder={rendererHint ?? "…/Composer/packages/renderer"} />
          <PathSetting settingKey="pr_repo" label="Repository for PRs" placeholder="~/Documents/GitHub/your-app" />
        </section>
        <UpdatesSection />
      </div>
    </div>
  );
}

/** A folder path kept as a project setting; `~` expands to the home folder when used. */
function PathSetting({ settingKey, label, placeholder }: { settingKey: string; label: string; placeholder: string }) {
  const repo = useProject((s) => s.repo);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    void repo?.getSetting<string>(settingKey).then((v) => setValue(v ?? ""));
  }, [repo, settingKey]);
  if (value === null) return null;
  return (
    <label className={styles.pathRow}>
      <span>{label}</span>
      <input
        className={styles.input}
        placeholder={placeholder}
        defaultValue={value}
        onBlur={(e) => void repo?.setSetting(settingKey, e.currentTarget.value.trim())}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </label>
  );
}

/** Where Validate posts its feedback questions. */
function SlackChannel() {
  const repo = useProject((s) => s.repo);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    void repo?.getSetting<string>("slack_channel").then((v) => setValue(v ?? ""));
  }, [repo]);
  if (value === null) return null;
  return (
    <div className={styles.row}>
      <input
        className={styles.input}
        placeholder="Feedback channel ID (C0123…)"
        defaultValue={value}
        onBlur={(e) => void repo?.setSetting("slack_channel", e.currentTarget.value.trim())}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ConnectorRow({ connector }: { connector: Connector }) {
  const [has, setHas] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (connector.secret) void getSecret(connector.secret).then((k) => setHas(!!k));
  }, [connector.secret]);
  const save = async () => {
    if (!connector.secret || !value.trim()) return;
    await setSecret(connector.secret, value.trim());
    setValue("");
    setHas(true);
    toast(`${connector.label} token saved to Keychain`, "success");
  };
  return (
    <div className={styles.connector}>
      <div className={styles.connectorHead}>
        <span className={styles.connectorName}>{connector.label}</span>
        <span className={styles.connectorState}>{!connector.secret ? "no token needed" : has ? "connected" : connector.tokenRequired ? "needs a token" : "optional token"}</span>
      </div>
      {connector.tokenHelp && <span className={styles.help}>{connector.tokenHelp}</span>}
      {connector.platform === "slack" && <SlackChannel />}
      {connector.secret && (
        <div className={styles.row}>
          <input
            className={styles.input}
            type="password"
            placeholder={has ? "•••••••• saved" : "Paste token"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              e.stopPropagation();
            }}
          />
          <button type="button" className={styles.secondary} onClick={() => void save()} disabled={!value.trim()}>
            Save
          </button>
          {has && (
            <button
              type="button"
              className={styles.secondary}
              onClick={async () => {
                await deleteSecret(connector.secret!);
                setHas(false);
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
