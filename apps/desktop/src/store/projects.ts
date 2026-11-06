import { create } from "zustand";
import type { Hash, Id } from "@composer/core";
import type { ProjectRow } from "@composer/data";
import { carryFreshness } from "@composer/engine";
import { LAST_PROJECT } from "../app/boot";
import { coverOf, type Cover } from "../home/cover";
import { closeProject, loadProject, saveNow, toast, useProject } from "./project";
import { flushComments, loadComments } from "./comments";
import { playback, usePlayback } from "./playback";
import { useUi } from "./ui";

export interface HomeCard {
  project: ProjectRow;
  cover: Cover;
}

interface ProjectsState {
  /** Home on launch; a project once one is open. */
  view: "home" | "project";
  list: HomeCard[];
  archived: HomeCard[];
  loaded: boolean;
  /** A project is being opened: Home dims its cards until it's ready. */
  opening: Id | null;
  /** Home is showing the inline "name a new project" card. */
  creating: boolean;
}

export const useProjects = create<ProjectsState>(() => ({ view: "home", list: [], archived: [], loaded: false, opening: null, creating: false }));

const NEW_NAME = "Untitled problem";
const commentsKey = (id: Id) => `comments:${id}`;

const repo = () => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Storage isn't open yet.");
  return r;
};

/** Reloads Home's cards: every project, newest edit first, with its cover. */
export async function refreshHome() {
  const r = repo();
  await saveNow();
  const [live, archived, covers] = await Promise.all([r.listProjects(), r.listProjects({ archived: true }), r.projectCovers()]);
  const hashes = Object.values(covers).flatMap((c) => [c.prototypeHash, c.latest?.contentHash].filter((h): h is Hash => !!h));
  const blobs = await r.getBlobs([...new Set(hashes)]);
  const card = (project: ProjectRow): HomeCard => ({ project, cover: coverOf(covers[project.id], blobs) });
  useProjects.setState({ list: live.map(card), archived: archived.map(card), loaded: true });
}

export function goHome() {
  useProjects.setState({ view: "home" });
  void refreshHome().catch((e: unknown) => toast(`Couldn't load projects: ${String(e)}`, "error"));
}

/** Back to the open project, if there is one. */
export function leaveHome() {
  if (useProject.getState().project) useProjects.setState({ view: "project" });
}

// Panels, sheets and modes that belong to the project being left.
function resetTransientUi() {
  useUi.setState({
    studio: null,
    variantsOpen: false,
    compareOpen: false,
    addMenuOpen: false,
    bookmarkOpen: false,
    paletteOpen: false,
    showGraph: false,
    inspectorTab: "preview",
    tool: "select",
  });
}

/**
 * Opens a project: the open one comes straight back; another is loaded fresh after the current
 * one is saved and put down, so no selection, undo, run or playback carries across.
 */
export async function openProject(id: Id) {
  const r = repo();
  if (useProject.getState().project?.id === id) {
    useProjects.setState({ view: "project" });
    return;
  }
  useProjects.setState({ opening: id });
  try {
    const next = await r.getProject(id);
    if (!next) throw new Error("That project no longer exists.");
    if (usePlayback.getState().active) playback.close();
    await flushComments();
    const stopped = await closeProject();
    resetTransientUi();
    await loadProject({ repo: r, project: next, interrupted: 0 });
    await loadComments();
    await r.setSetting(LAST_PROJECT, id);
    useProjects.setState({ view: "project" });
    if (stopped) toast(`Stopped ${stopped} running step${stopped === 1 ? "" : "s"} in the project you left.`);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    useProjects.setState({ opening: null });
  }
}

/** Starts a project and drops straight into Understand. */
export async function createProject(name: string) {
  const project = await repo().createProject(name.trim() || NEW_NAME);
  await openProject(project.id);
}

export async function renameProject(id: Id, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await repo().updateProject(id, { name: trimmed });
  const open = useProject.getState().project;
  if (open?.id === id) useProject.setState({ project: { ...open, name: trimmed } });
  await refreshHome();
}

/** A copy of the project as it stands now, comments included; history stays with the original. */
export async function duplicateProject(id: Id) {
  const r = repo();
  await saveNow();
  await flushComments();
  const source = await r.getProject(id);
  if (!source) return;
  const copy = await r.duplicateProject(id, `${source.name} copy`, carryFreshness);
  const notes = await r.getSetting<unknown[]>(commentsKey(id));
  if (notes?.length) await r.setSetting(commentsKey(copy.id), notes);
  await refreshHome();
  toast(`Duplicated as “${copy.name}”.`, "success");
}

/** Archiving never deletes. The open project closes if it's the one archived. */
export async function archiveProject(id: Id) {
  const r = repo();
  if (useProject.getState().project?.id === id) {
    if (usePlayback.getState().active) playback.close();
    await flushComments();
    await closeProject();
    await loadComments();
    resetTransientUi();
  }
  await r.archiveProject(id);
  await refreshHome();
  toast("Archived. It's under Archived on Home whenever you want it back.");
}

export async function restoreProject(id: Id) {
  await repo().restoreProject(id);
  await refreshHome();
}
