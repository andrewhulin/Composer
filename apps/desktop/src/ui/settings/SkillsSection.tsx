import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { FolderOpen, GitBranch, LibraryBig, RefreshCw, Trash2, Upload } from "lucide-react";
import { PHASES, PHASE_INFO, type Phase } from "@composer/core";
import type { SkillRow } from "@composer/data";
import type { SkillFile } from "@composer/engine";
import {
  applyUpdate,
  cancelPending,
  checkForUpdate,
  importFiles,
  importGit,
  installFromCatalog,
  installPending,
  loadCatalog,
  removeSkill,
  setGlobal,
  setMode,
  setOverride,
  setPhases,
  skillScores,
  toggleChoice,
  useSkills,
} from "../../store/skills";
import { toast } from "../../store/project";
import { inTauri } from "../../platform/env";
import { pickFolder, readFolder } from "../../platform/share";
import { Badge, Button, Chip, Icon, Input, Tabs, Toggle } from "../primitives";
import { cx } from "../primitives/cx";
import { BriefPanel } from "./BriefPanel";
import styles from "./Skills.module.css";

/** Reads a dropped folder (WebKit's directory entries), keeping paths relative to it. */
async function readDropped(e: DragEvent): Promise<{ files: SkillFile[]; label: string } | null> {
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x);
  if (!entries.length) return null;
  const files: SkillFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile && /\.(md|markdown|txt|json|ya?ml)$/i.test(entry.name)) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      files.push({ path: `${prefix}${entry.name}`, content: await file.text() });
    } else if (entry.isDirectory && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children: FileSystemEntry[] = [];
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        children.push(...batch);
      }
      for (const c of children) await walk(c, `${prefix}${entry.name}/`);
    }
  };
  for (const entry of entries) await walk(entry, "");
  // Paths start with the dropped folder's own name; drop it so SKILL.md at its top reads as the root.
  const top = entries.length === 1 && entries[0]!.isDirectory ? `${entries[0]!.name}/` : "";
  return { files: files.map((f) => ({ ...f, path: f.path.startsWith(top) ? f.path.slice(top.length) : f.path })), label: entries.map((x) => x.name).join(", ") };
}

/** Settings → Skills: the library, its switches, and the Craft Brief compiled from it. */
export function SkillsSection() {
  const skills = useSkills((s) => s.skills);
  const pending = useSkills((s) => s.pending);
  const [git, setGit] = useState("");
  const [dragging, setDragging] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [scores, setScores] = useState<Awaited<ReturnType<typeof skillScores>>>({});
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void skillScores().then(setScores).catch(() => undefined);
  }, [skills]);

  const chooseFolder = async () => {
    if (!inTauri()) return folderInput.current?.click();
    const path = await pickFolder("Choose a skill folder, or a folder of skills");
    if (!path) return;
    try {
      await importFiles(await readFolder(path), `folder:${path}`, path.split("/").pop() ?? path);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const read = await readDropped(e);
    if (read) await importFiles(read.files, `folder:${read.label}`, read.label);
  };

  return (
    <div className={styles.skills}>
      <section className={styles.block}>
        <div
          className={cx(styles.drop, dragging && styles.dropping)}
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => void onDrop(e)}
        >
          <Icon icon={Upload} size="lg" className={styles.dropIcon} />
          <div className={styles.dropText}>
            <strong>Drop a skill folder here</strong>
            <span>A folder with a SKILL.md at its top, or a folder of them. Reference files come along.</span>
          </div>
          <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => void chooseFolder()}>
            Choose folder…
          </Button>
          <input
            ref={folderInput}
            type="file"
            hidden
            {...({ webkitdirectory: "" } as object)}
            onChange={async (e) => {
              const list = [...(e.currentTarget.files ?? [])].filter((f) => /\.(md|markdown|txt|json|ya?ml)$/i.test(f.name));
              const files = await Promise.all(list.map(async (f) => ({ path: (f as File & { webkitRelativePath: string }).webkitRelativePath.split("/").slice(1).join("/"), content: await f.text() })));
              const label = (list[0] as (File & { webkitRelativePath: string }) | undefined)?.webkitRelativePath.split("/")[0] ?? "folder";
              e.currentTarget.value = "";
              if (files.length) await importFiles(files, `folder:${label}`, label);
            }}
          />
        </div>
        <div className={styles.row}>
          <Input
            className={styles.grow}
            size="sm"
            mono
            placeholder="owner/repo, a GitHub link, or npx skills add owner/repo --skill name"
            value={git}
            onChange={(e) => setGit(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && git.trim() && void importGit(git).then(() => setGit(""))}
            aria-label="Import from GitHub"
          />
          <Button variant="secondary" size="sm" icon={GitBranch} disabled={!git.trim()} onClick={() => void importGit(git).then(() => setGit(""))}>
            Import
          </Button>
          <Button variant={catalogOpen ? "primary" : "secondary"} size="sm" icon={LibraryBig} onClick={() => (setCatalogOpen(!catalogOpen), !useSkills.getState().catalog && void loadCatalog())}>
            UI Skills catalog
          </Button>
        </div>
        {pending && <PendingImport />}
        {catalogOpen && <Catalog />}
      </section>

      <BriefPanel />

      <section className={styles.block}>
        <header className={styles.blockHead}>
          <span className="caps">Library</span>
          <span className={styles.count}>{skills.length}</span>
        </header>
        {!skills.length && <p className={styles.empty}>No skills yet. Drop a folder, paste a repo, or pick from the catalog.</p>}
        <ul className={styles.list}>
          {skills.map((s) => (
            <SkillItem key={s.id} skill={s} score={scores[s.id]} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PendingImport() {
  const pending = useSkills((s) => s.pending)!;
  const n = pending.choices.filter((c) => c.selected).length;
  return (
    <div className={styles.pending}>
      <p>
        {pending.choices.length} skills in <strong>{pending.label}</strong>. Pick which to install.
      </p>
      <ul className={styles.choices}>
        {pending.choices.map((c) => (
          <li key={c.dir}>
            <label className={styles.choice}>
              <input type="checkbox" checked={c.selected} onChange={() => toggleChoice(c.dir)} />
              <span className={styles.choiceName}>{c.name}</span>
              <span className={styles.choiceDesc}>{c.description}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className={styles.row}>
        <Button variant="primary" size="sm" disabled={!n} onClick={() => void installPending()}>
          Install {n}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Catalog() {
  const catalog = useSkills((s) => s.catalog);
  const installed = useSkills((s) => new Set(s.skills.map((x) => x.source)));
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (catalog ?? []).filter((c) => words.every((w) => `${c.id} ${c.description}`.toLowerCase().includes(w))).slice(0, 60);
  }, [catalog, q]);
  return (
    <div className={styles.catalog}>
      <Input size="sm" placeholder={catalog ? `Search ${catalog.length} skills` : "Loading the catalog…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the catalog" autoFocus />
      <ul className={styles.catalogList}>
        {shown.map((c) => {
          const has = installed.has(`catalog:${c.id}`);
          return (
            <li key={c.id} className={styles.catalogItem}>
              <span className={styles.catalogText}>
                <span className={styles.choiceName}>{c.name}</span>
                <span className={styles.author}>by {c.author}</span>
                <span className={styles.choiceDesc}>{c.description}</span>
              </span>
              <Button variant={has ? "ghost" : "secondary"} size="sm" disabled={has} onClick={() => void installFromCatalog(c)}>
                {has ? "Installed" : "Install"}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>Third-party text: each install is pinned to the file as it is now, and updates show you a diff first.</p>
    </div>
  );
}

const KIND_LABEL: Record<SkillRow["kind"], string> = { craft: "Craft", motion: "Motion", systems: "Systems", audit: "Audit", exploration: "Exploration", router: "Router" };

function SkillItem({ skill, score }: { skill: SkillRow; score?: { with: number; withN: number; without: number; withoutN: number } }) {
  const override = useSkills((s) => s.overrides[skill.id]);
  const [update, setUpdate] = useState<{ before: string; after: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const thirdParty = skill.source.startsWith("git:") || skill.source.startsWith("catalog:");
  const on = override ?? skill.enabled;
  const togglePhase = (p: Phase) => void setPhases(skill.id, skill.phases.includes(p) ? skill.phases.filter((x) => x !== p) : [...skill.phases, p]);

  const check = async () => {
    setChecking(true);
    try {
      const u = await checkForUpdate(skill);
      setUpdate(u);
      if (!u) toast(`${skill.name} is up to date.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <li className={cx(styles.item, !on && styles.off)}>
      <div className={styles.itemHead}>
        <Toggle on={skill.enabled} onChange={() => void setGlobal(skill.id, !skill.enabled)} label={`${skill.name} on everywhere`} />
        <span className={styles.itemName}>{skill.name}</span>
        <Badge tone="neutral">{KIND_LABEL[skill.kind]}</Badge>
        <span className={styles.grow} />
        <span className={styles.meta}>
          v{skill.version} · {skill.tokens.toLocaleString()} tokens
        </span>
      </div>
      <p className={styles.desc}>{skill.description}</p>
      <div className={styles.controls}>
        <Tabs
          variant="segmented"
          size="sm"
          label="Mode"
          value={skill.mode}
          onChange={(m) => void setMode(skill.id, m)}
          items={[
            { value: "always", label: "Always on", title: "Its principles go into the Craft Brief" },
            { value: "on_demand", label: "On demand", title: "An action you run on a node, like a review" },
          ]}
        />
        <Tabs
          variant="segmented"
          size="sm"
          label="In this project"
          value={override === undefined ? "default" : override ? "on" : "off"}
          onChange={(v) => void setOverride(skill.id, v === "default" ? undefined : v === "on")}
          items={[
            { value: "default", label: "Project: default" },
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
        />
      </div>
      <div className={styles.phases} role="group" aria-label="Phases">
        <span className={styles.phasesLabel}>{skill.phases.length ? "Only in" : "Every phase ·"}</span>
        {PHASES.map((p) => (
          <Chip key={p} size="sm" selected={skill.phases.includes(p)} onClick={() => togglePhase(p)}>
            {PHASE_INFO[p].name}
          </Chip>
        ))}
      </div>
      <div className={styles.footer}>
        <span className={styles.meta}>
          {skill.source.replace(/^(folder|git|catalog):/, "")}
          {skill.author ? ` · by ${skill.author}` : ""}
          {skill.ref && /^[0-9a-f]{40}$/.test(skill.ref) ? ` · pinned ${skill.ref.slice(0, 7)}` : ""}
        </span>
        {score && score.withN > 0 && (
          <span className={styles.meta} title="Average score of scored runs that carried this skill, beside those that didn't">
            Runs with it {score.with.toFixed(1)} (n={score.withN}) · without {score.withoutN ? score.without.toFixed(1) : "–"} (n={score.withoutN})
          </span>
        )}
        <span className={styles.grow} />
        {thirdParty && (
          <Button variant="ghost" size="sm" icon={RefreshCw} disabled={checking} onClick={() => void check()}>
            {checking ? "Checking…" : "Check for update"}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => void removeSkill(skill.id)}>
          Remove
        </Button>
      </div>
      {update && (
        <div className={styles.update}>
          <p>The source changed since you installed it. Read the change before updating.</p>
          <div className={styles.diff}>
            <pre aria-label="Installed">{update.before}</pre>
            <pre aria-label="New">{update.after}</pre>
          </div>
          <div className={styles.row}>
            <Button variant="primary" size="sm" onClick={() => void applyUpdate(skill, update.after).then(() => setUpdate(null))}>
              Update to v{skill.version + 1}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setUpdate(null)}>
              Keep v{skill.version}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
