import { ulid } from "@composer/core";
import { migrate, Repo, type ProjectRow } from "@composer/data";
import { openDb } from "../platform/db";

export interface Booted {
  repo: Repo;
  project: ProjectRow;
  interrupted: number;
}

/** Opens storage, applies migrations, settles runs a previous session left open, picks a project. */
export async function boot(): Promise<Booted> {
  const db = await openDb();
  await migrate(db);
  const repo = new Repo(db, () => ulid());
  const interrupted = await repo.interruptOrphanedRuns();
  const [latest] = await repo.listProjects();
  const project = latest ?? (await repo.createProject("Untitled problem"));
  return { repo, project, interrupted };
}
