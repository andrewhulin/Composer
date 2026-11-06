import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Cpu, Download, Inbox, Plug, Puzzle, SlidersHorizontal, TriangleAlert, type LucideIcon } from "lucide-react";
import { INTEGRATIONS } from "../../connections/registry";
import { isProblem, isRequired, statusLabel } from "../../connections/status";
import { useConnections } from "../../store/connections";
import { openFoundations, useCraft } from "../../store/craft";
import { useProject } from "../../store/project";
import { useUi, type SettingsSection } from "../../store/ui";
import { rendererDefaultDir } from "../../platform/share";
import { tutorial } from "../../tutorial/store";
import { Badge, Button, Icon, Input } from "../primitives";
import { cx } from "../primitives/cx";
import { ConnectorsSection } from "./ConnectorsSection";
import { RequestsSection } from "./RequestsSection";
import { SkillsSection } from "./SkillsSection";
import { UpdatesSection } from "./UpdatesSection";
import styles from "./Settings.module.css";

const NAV: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "model", label: "Model and API", icon: Cpu },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "foundations", label: "Foundations", icon: BookOpen },
  { id: "updates", label: "Updates", icon: Download },
  { id: "requests", label: "Requests", icon: Inbox },
];

/** ⌘, — a full view with a left menu: general, the model, connectors, foundations, updates, requests. */
export function Settings() {
  const open = useUi((s) => s.settingsOpen);
  const section = useUi((s) => s.settingsSection);
  const setSection = useUi((s) => s.setSettingsSection);
  const close = () => useUi.getState().setSettingsOpen(false);
  const statuses = useConnections((s) => s.statuses);
  const graph = useProject((s) => s.graph);
  const problems = useMemo(() => {
    const inUse = new Set(Object.values(graph.nodes).flatMap((n) => (n.kind === "source" ? [n.platform] : [])));
    return INTEGRATIONS.filter((i) => isRequired(i, inUse) && isProblem(statuses[i.id])).length;
  }, [graph, statuses]);

  if (!open) return null;
  const title = NAV.find((n) => n.id === section)!.label;

  return (
    <div className={styles.settings} role="dialog" aria-label="Settings">
      <header className={styles.bar} data-tauri-drag-region>
        <span className={styles.app} data-tauri-drag-region>
          Settings
        </span>
        <span className={styles.grow} data-tauri-drag-region />
        <Button variant="ghost" size="sm" shortcut="esc" onClick={close}>
          Done
        </Button>
      </header>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={cx(styles.navItem, section === n.id && styles.navOn)} aria-current={section === n.id ? "page" : undefined} onClick={() => setSection(n.id)}>
              <Icon icon={n.icon} size="sm" />
              <span>{n.label}</span>
              {n.id === "connectors" && problems > 0 && (
                <Badge tone="warn" icon={TriangleAlert}>
                  {problems}
                </Badge>
              )}
            </button>
          ))}
        </nav>
        <main className={styles.content}>
          <h2 className={styles.heading}>{title}</h2>
          {section === "general" && <GeneralSection />}
          {section === "model" && <ModelSection />}
          {section === "connectors" && <ConnectorsSection />}
          {section === "skills" && <SkillsSection />}
          {section === "foundations" && <FoundationsSection />}
          {section === "updates" && <UpdatesSection />}
          {section === "requests" && <RequestsSection />}
        </main>
      </div>
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <section className={styles.section}>
      <span className="caps">{title}</span>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </section>
  );
}

function GeneralSection() {
  const [rendererHint, setRendererHint] = useState<string | null>(null);
  useEffect(() => {
    void rendererDefaultDir().then(setRendererHint);
  }, []);
  return (
    <>
      <Group title="Share" note="The release video renders with Remotion and the system Node. PRs open from a temporary worktree, so your checkout is never touched.">
        <PathSetting settingKey="renderer_dir" label="Renderer folder" placeholder={rendererHint ?? "…/Composer/packages/renderer"} />
        <PathSetting settingKey="pr_repo" label="Repository for PRs" placeholder="~/Documents/GitHub/your-app" />
      </Group>
      <Group title="Guide" note="The ten-minute guide: setup, then your first loop.">
        <div className={styles.row}>
          <Button variant="secondary" size="sm" onClick={() => (useUi.getState().setSettingsOpen(false), tutorial.restart())}>
            Start the guide from the beginning
          </Button>
        </div>
      </Group>
    </>
  );
}

function ModelSection() {
  const anthropic = useConnections((s) => s.statuses.anthropic);
  return (
    <>
      <Group title="Anthropic API key" note="Every Claude node runs with this key. It lives in your macOS Keychain under com.andrewhulin.composer and never touches disk or the repo.">
        <div className={styles.row}>
          <Badge tone={anthropic?.kind === "connected" ? "live" : isProblem(anthropic) ? "error" : "muted"}>{anthropic ? statusLabel(anthropic) : "Checking…"}</Badge>
          <Button variant="secondary" size="sm" icon={Plug} onClick={() => useUi.getState().openSettings("connectors", "anthropic")}>
            {anthropic?.kind === "connected" ? "Manage in Connectors" : "Set it up"}
          </Button>
        </div>
      </Group>
      <Group title="Model" note="Every node runs on Claude Opus 5.5 with adaptive thinking. Effort is set per step, and each node can override it on its Node tab." />
    </>
  );
}

function FoundationsSection() {
  const ds = useCraft((s) => s.ds);
  const philosophy = useCraft((s) => s.philosophy);
  return (
    <Group title="Always on" note="The design system and the philosophy ride along with every run, in the cached part of the prompt.">
      <dl className={styles.facts}>
        <dt>Design system</dt>
        <dd>{ds ? `${ds.row.version}` : "None slotted"}</dd>
        <dt>Philosophy</dt>
        <dd>{philosophy ? `rev ${philosophy.row.version}` : "None slotted"}</dd>
      </dl>
      <div className={styles.row}>
        <Button variant="secondary" size="sm" icon={BookOpen} onClick={() => (useUi.getState().setSettingsOpen(false), openFoundations())}>
          Open Foundations
        </Button>
      </div>
    </Group>
  );
}

/** A folder path kept as a setting; `~` expands to the home folder when used. */
function PathSetting({ settingKey, label, placeholder }: { settingKey: string; label: string; placeholder: string }) {
  const repo = useProject((s) => s.repo);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    void repo?.getSetting<string>(settingKey).then((v) => setValue(v ?? ""));
  }, [repo, settingKey]);
  if (value === null) return null;
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Input size="sm" mono placeholder={placeholder} defaultValue={value} onBlur={(e) => void repo?.setSetting(settingKey, e.currentTarget.value.trim())} />
    </label>
  );
}
