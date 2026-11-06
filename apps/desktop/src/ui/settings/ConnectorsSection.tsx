import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCw, TriangleAlert } from "lucide-react";
import { INTEGRATIONS, integration, type Integration, type IntegrationId, type TestResult } from "../../connections/registry";
import { isProblem, isRequired, statusLabel, type Status } from "../../connections/status";
import { checkAll, checkIntegration, connect, disconnect, testToken, useConnections } from "../../store/connections";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { openUrl } from "../../platform/share";
import { Badge, Button, Icon, Input, Logo, type Brand, type BadgeTone } from "../primitives";
import { cx } from "../primitives/cx";
import { Guide } from "./Guide";
import styles from "./Settings.module.css";

const BRAND: Record<IntegrationId, Brand> = {
  anthropic: "anthropic",
  linear: "linear",
  figma: "figma",
  arena: "arena",
  pinterest: "pinterest",
  slack: "slack",
  statsig: "statsig",
  notion: "notion",
  github: "github",
};

const TONE: Record<Status["kind"], BadgeTone> = {
  checking: "muted",
  not_connected: "neutral",
  optional: "muted",
  not_needed: "muted",
  connected: "live",
  unverified: "warn",
  error: "error",
  expired: "error",
};

/** Every service Composer connects to, its live status, and a step-by-step setup for each. */
export function ConnectorsSection() {
  const statuses = useConnections((s) => s.statuses);
  const graph = useProject((s) => s.graph);
  const selected = useUi((s) => s.settingsConnector);
  const select = useUi((s) => s.setSettingsConnector);
  const inUse = useMemo(() => new Set(Object.values(graph.nodes).flatMap((n) => (n.kind === "source" ? [n.platform] : []))), [graph]);

  useEffect(() => {
    void checkAll();
  }, []);

  // Open on the connector asked for, or the first one that needs attention, or Anthropic.
  const current = selected ?? INTEGRATIONS.find((i) => isRequired(i, inUse) && isProblem(statuses[i.id]))?.id ?? "anthropic";

  return (
    <div className={styles.connectors}>
      <ul className={styles.list} data-tour="settings-sources" aria-label="Connectors">
        {INTEGRATIONS.map((i) => {
          const s = statuses[i.id] ?? { kind: "checking" as const };
          const required = isRequired(i, inUse);
          return (
            <li key={i.id}>
              <button
                type="button"
                className={cx(styles.connectorRow, current === i.id && styles.connectorOn)}
                aria-current={current === i.id || undefined}
                onClick={() => select(i.id)}
                {...(i.id === "anthropic" ? { "data-tour": "settings-key" } : {})}
              >
                <span className={styles.logoTile}>
                  <Logo brand={BRAND[i.id]} size="md" />
                </span>
                <span className={styles.connectorText}>
                  <span className={styles.connectorName}>
                    {i.name}
                    {required && <span className={styles.required}>{i.alwaysRequired ? "Required" : "Used by this project"}</span>}
                  </span>
                  <span className={styles.gives}>{i.gives}</span>
                </span>
                <Badge tone={TONE[s.kind]} {...(required && isProblem(s) ? { icon: TriangleAlert } : {})}>
                  {statusLabel(s)}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
      <Stepper key={current} integration={integration(current)} status={statuses[current]} />
    </div>
  );
}

/** One connector's setup: numbered steps beside an animation, then the paste-and-test field. */
function Stepper({ integration: i, status }: { integration: Integration; status: Status | undefined }) {
  const last = i.steps.length;
  const connected = status?.kind === "connected" || status?.kind === "not_needed";
  const [step, setStep] = useState(connected ? last : 1);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const saved = status && status.kind !== "not_connected" && status.kind !== "optional" && status.kind !== "not_needed" && i.auth.kind === "token";
  const s = status ?? { kind: "checking" as const };

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (i.auth.kind === "token") {
        if (!token.trim()) return;
        const r = await connect(i.id, token);
        setResult(r);
        if (r.ok || r.unreachable) setToken("");
      } else {
        await checkIntegration(i.id);
        setResult(await testToken(i.id, ""));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.stepper} aria-label={`${i.name} setup`}>
      <header className={styles.stepperHead}>
        <span className={styles.logoTile}>
          <Logo brand={BRAND[i.id]} size="lg" />
        </span>
        <div className={styles.stepperTitle}>
          <h3>{i.name}</h3>
          <p>{i.gives}</p>
        </div>
        <Badge tone={TONE[s.kind]}>{statusLabel(s)}</Badge>
      </header>

      {(s.kind === "error" || s.kind === "expired" || s.kind === "unverified" || (s.kind === "not_connected" && s.reason)) && (
        <p className={cx(styles.notice, s.kind === "unverified" ? styles.noticeWarn : styles.noticeError)}>
          <Icon icon={TriangleAlert} size="sm" />
          {"reason" in s ? s.reason : ""}
        </p>
      )}

      <div className={styles.stepperBody}>
        <ol className={styles.steps}>
          {i.steps.map((st, n) => {
            const num = n + 1;
            const on = num === step;
            return (
              <li key={st.title} className={cx(styles.step, on && styles.stepOn, num < step && styles.stepDone)}>
                <button type="button" className={styles.stepHead} onClick={() => setStep(num)} aria-current={on ? "step" : undefined}>
                  <span className={styles.stepNum}>{String(num).padStart(2, "0")}</span>
                  <span>{st.title}</span>
                </button>
                {on && (
                  <div className={styles.stepDetail}>
                    <p>{st.detail}</p>
                    {st.link && (
                      <Button variant="secondary" size="sm" iconAfter={ExternalLink} onClick={() => void openUrl(st.link!.url)}>
                        {st.link.label}
                      </Button>
                    )}
                    {num === last && i.auth.kind === "token" && (
                      <div className={styles.pasteRow}>
                        <Input
                          className={styles.grow}
                          size="sm"
                          mono
                          type="password"
                          autoFocus
                          placeholder={saved ? "•••••••• saved in Keychain. Paste a new one to replace it" : i.auth.placeholder}
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void run()}
                          aria-label={`${i.name} token`}
                        />
                        <Button variant="primary" size="sm" onClick={() => void run()} disabled={busy || !token.trim()}>
                          {busy ? "Testing…" : "Test and save"}
                        </Button>
                      </div>
                    )}
                    {num === last && i.auth.kind === "cli" && (
                      <Button variant="primary" size="sm" icon={RotateCw} onClick={() => void run()} disabled={busy}>
                        {busy ? "Asking gh…" : "Test"}
                      </Button>
                    )}
                    {result && <ResultLine name={i.name} result={result} />}
                    {i.id === "slack" && num === last && <SlackChannel />}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className={styles.guideCol}>
          <Guide integration={i} step={step} />
          <div className={styles.stepNav}>
            <Button variant="ghost" size="sm" icon={ArrowLeft} disabled={step === 1} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <span className={styles.stepCount}>
              {step} / {last}
            </span>
            <Button variant="ghost" size="sm" iconAfter={ArrowRight} disabled={step === last} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {(s.kind === "connected" || saved) && (
        <footer className={styles.stepperFoot}>
          {s.kind === "connected" && (
            <span className={styles.success}>
              <Icon icon={Check} size="sm" />
              {statusLabel(s)}
              {i.auth.kind === "token" ? " · kept in your Keychain" : ""}
            </span>
          )}
          <span className={styles.grow} />
          <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => void checkIntegration(i.id)}>
            Check again
          </Button>
          {i.auth.kind === "token" && saved && (
            <Button variant="danger" size="sm" onClick={() => void disconnect(i.id)}>
              Disconnect
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

function ResultLine({ name, result }: { name: string; result: TestResult }) {
  if (result.ok) {
    return (
      <p className={cx(styles.result, styles.resultOk)}>
        <Icon icon={Check} size="sm" />
        {result.who ? `Works: connected as ${result.who}.` : `${name} accepted it.`}
      </p>
    );
  }
  return (
    <p className={cx(styles.result, result.unreachable ? styles.resultWarn : styles.resultBad)}>
      <Icon icon={TriangleAlert} size="sm" />
      {result.reason}
      {!result.unreachable && " Nothing was saved."}
    </p>
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
    <label className={styles.field}>
      <span>Feedback channel ID</span>
      <Input size="sm" mono placeholder="C0123…" defaultValue={value} onBlur={(e) => void repo?.setSetting("slack_channel", e.currentTarget.value.trim())} />
    </label>
  );
}
