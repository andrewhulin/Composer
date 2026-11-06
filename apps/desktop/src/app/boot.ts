import { ulid } from "@composer/core";
import { migrate, Repo, type ProjectRow } from "@composer/data";
import { openDb } from "../platform/db";

export interface Booted {
  repo: Repo;
  project: ProjectRow;
  interrupted: number;
}

/** The setting that remembers which project was open last. */
export const LAST_PROJECT = "last_project";

/**
 * Opens storage, applies migrations, settles runs a previous session left open, and loads the
 * project that was open last (or the latest), so Home can hand it back in one keystroke.
 */
export async function boot(): Promise<Booted> {
  const db = await openDb();
  await migrate(db);
  const repo = new Repo(db, () => ulid());
  const interrupted = await repo.interruptOrphanedRuns();
  const lastId = await repo.getSetting<string>(LAST_PROJECT);
  const last = lastId ? await repo.getProject(lastId) : undefined;
  const [latest] = await repo.listProjects();
  const project = (last && !last.archivedAt ? last : latest) ?? (await repo.createProject("Untitled problem"));
  return { repo, project, interrupted };
}
