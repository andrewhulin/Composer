import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { PHASE_INFO } from "@composer/core";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import {
  archiveProject,
  createProject,
  duplicateProject,
  leaveHome,
  openProject,
  refreshHome,
  renameProject,
  restoreProject,
  useProjects,
  type HomeCard,
} from "../../store/projects";
import { Badge, Button, IconButton, Input, Menu, MenuItem, PhaseHex, Popover } from "../primitives";
import { cx } from "../primitives/cx";
import { timeAgo } from "../primitives/format";
import { PrototypeFrame } from "../inspector/PrototypeView";
import styles from "./Home.module.css";

/** Over this many projects, Home offers a search field. */
const SEARCH_AT = 8;
const PLACEHOLDER = "Name the problem, e.g. Returning users can't see what changed";

/** Pick a project to work on, or start one. Shown at launch; ⇧⌘H from anywhere. */
export function Home() {
  const { list, archived, loaded, opening, creating } = useProjects();
  const setCreating = (on: boolean) => useProjects.setState({ creating: on });
  const current = useProject((s) => s.project?.id);
  const storage = useProject((s) => !!s.repo);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (storage) void refreshHome();
  }, [storage]);

  // ⌘N starts a project from Home.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.project.name.toLowerCase().includes(q)) : list;
  }, [list, query]);

  return (
    <div className={styles.home}>
      <header className={styles.bar} data-tauri-drag-region>
        <span className={styles.app} data-tauri-drag-region>
          Design Composer
        </span>
        <span className={styles.fill} data-tauri-drag-region />
        <Button variant="ghost" size="sm" icon={Search} shortcut="⌘K" onClick={() => useUi.getState().setPaletteOpen(true)}>
          Search
        </Button>
        {current && (
          <Button variant="ghost" size="sm" shortcut="esc" onClick={leaveHome}>
            Back to the open project
          </Button>
        )}
      </header>

      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={styles.title}>Projects</h1>
          {loaded && <span className={styles.count}>{list.length}</span>}
          <span className={styles.fill} />
          {list.length > SEARCH_AT && (
            <Input size="sm" className={styles.search} value={query} placeholder="Find a project" onChange={(e) => setQuery(e.target.value)} aria-label="Find a project" />
          )}
          <Button variant="primary" icon={Plus} shortcut="⌘N" onClick={() => setCreating(true)}>
            New project
          </Button>
        </div>

        <div className={styles.grid}>
          {creating && <NewCard onDone={() => setCreating(false)} />}
          {shown.map((c) => (
            <Card key={c.project.id} card={c} open={c.project.id === current} busy={opening === c.project.id} dim={!!opening && opening !== c.project.id} />
          ))}
        </div>
        {loaded && !list.length && !creating && (
          <div className={styles.empty}>
            <span className={styles.pixel}>No projects yet</span>
            <p>A project is one problem, carried from evidence to a release story.</p>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Start the first one
            </Button>
          </div>
        )}
        {query && !shown.length && <p className={styles.none}>No project matches “{query}”.</p>}

        {archived.length > 0 && (
          <section className={styles.archived}>
            <Button variant="ghost" size="sm" icon={showArchived ? ChevronDown : ChevronRight} onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
              Archived · {archived.length}
            </Button>
            {showArchived && (
              <div className={styles.grid}>
                {archived.map((c) => (
                  <Card key={c.project.id} card={c} archived />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/** Naming a new project inline. Enter starts it in Understand; Esc or an empty blur cancels. */
function NewCard({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    await createProject(name);
    onDone();
  };
  return (
    <div className={cx(styles.card, styles.newCard)}>
      <div className={cx(styles.cover, styles.coverEmpty)} data-phase="understand">
        <PhaseHex phase="understand" size="lg" />
        <span className={styles.pixel}>Starts in Understand</span>
      </div>
      <div className={styles.body}>
        <Input
          autoFocus
          value={name}
          disabled={busy}
          placeholder={PLACEHOLDER}
          aria-label="Project name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter") void start();
            if (e.key === "Escape") onDone();
            e.stopPropagation();
          }}
          onBlur={() => !name.trim() && !busy && onDone()}
        />
        <div className={styles.meta}>
          <span>Enter to start</span>
          <span>Esc to cancel</span>
        </div>
      </div>
    </div>
  );
}

function Card({ card, open, busy, dim, archived }: { card: HomeCard; open?: boolean; busy?: boolean; dim?: boolean; archived?: boolean }) {
  const { project } = card;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const phase = PHASE_INFO[project.activePhase];

  const meta = (
    <span className={styles.meta}>
      <span className={styles.phase} data-phase={project.activePhase}>
        <PhaseHex phase={project.activePhase} />
        {phase.name}
      </span>
      <span>Loop {project.loop}</span>
      <span title={new Date(project.updatedAt).toLocaleString()}>Edited {timeAgo(project.updatedAt)}</span>
    </span>
  );

  return (
    <article className={cx(styles.card, open && styles.open, dim && styles.dim, archived && styles.archivedCard)} aria-busy={busy || undefined}>
      <button type="button" className={styles.hit} disabled={archived || busy} onClick={() => void openProject(project.id)} aria-label={`Open ${project.name}`}>
        <Cover card={card} />
      </button>
      <div className={styles.body}>
        <div className={styles.nameRow}>
          {renaming ? (
            <Input
              autoFocus
              size="sm"
              defaultValue={project.name}
              aria-label="Rename project"
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setRenaming(false);
                e.stopPropagation();
              }}
              onBlur={(e) => {
                setRenaming(false);
                if (e.currentTarget.value.trim() && e.currentTarget.value.trim() !== project.name) void renameProject(project.id, e.currentTarget.value);
              }}
            />
          ) : (
            <button type="button" className={styles.name} disabled={archived || busy} onClick={() => void openProject(project.id)} onDoubleClick={() => !archived && setRenaming(true)} title={project.name}>
              {project.name}
            </button>
          )}
          {open && <Badge tone="live">Open</Badge>}
          {busy && <Badge tone="muted">Opening…</Badge>}
          {archived ? (
            <Button variant="ghost" size="sm" icon={ArchiveRestore} onClick={() => void restoreProject(project.id)}>
              Restore
            </Button>
          ) : (
            <span className={styles.menuAnchor}>
              <IconButton icon={MoreHorizontal} label="Project actions" size="sm" pressed={menu} onClick={() => setMenu(!menu)} />
              {menu && (
                <Popover padding="sm" className={styles.menu} onDismiss={() => setMenu(false)}>
                  <Menu label={`${project.name} actions`}>
                    <MenuItem icon={Pencil} onClick={() => (setMenu(false), setRenaming(true))}>
                      Rename
                    </MenuItem>
                    <MenuItem icon={Copy} hint="Current state, without history" onClick={() => (setMenu(false), void duplicateProject(project.id))}>
                      Duplicate
                    </MenuItem>
                    <MenuItem icon={Archive} hint="Hidden from Home, nothing deleted" onClick={() => (setMenu(false), void archiveProject(project.id))}>
                      Archive
                    </MenuItem>
                  </Menu>
                </Popover>
              )}
            </span>
          )}
        </div>
        {meta}
      </div>
    </article>
  );
}

/** The newest prototype, live and scaled; or the newest locked output as paper; or nothing yet. */
function Cover({ card }: { card: HomeCard }) {
  const { project, cover } = card;
  const id = <span className={styles.id}>{project.id.slice(-4)}</span>;
  if (cover?.kind === "prototype") {
    return (
      <span className={cx(styles.cover, styles.coverProto)} data-phase="build">
        {id}
        <span className={styles.device} aria-hidden>
          <PrototypeFrame hash={cover.hash} html={cover.html} width={148} />
        </span>
      </span>
    );
  }
  if (cover?.kind === "text") {
    const serif = cover.phase === "define" || cover.phase === "validate";
    return (
      <span className={cx(styles.cover, styles.coverPaper)} data-phase={cover.phase}>
        {id}
        <span className={styles.paperKicker}>{PHASE_INFO[cover.phase].output}</span>
        <span className={cx(styles.paperText, serif && styles.serif)}>{cover.text}</span>
      </span>
    );
  }
  return (
    <span className={cx(styles.cover, styles.coverEmpty)} data-phase={project.activePhase}>
      {id}
      <PhaseHex phase={project.activePhase} size="lg" />
      <span className={styles.pixel}>Nothing locked yet</span>
    </span>
  );
}

