// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ulid, type Graph } from "@composer/core";
import { source } from "@composer/core/testing";
import { migrate, Repo } from "@composer/data";
import { nodeSqliteDriver } from "@composer/data/node-sqlite";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

/** A fresh app (new module instances) over an in-memory database with two projects. */
async function app() {
  vi.resetModules();
  const db = nodeSqliteDriver();
  await migrate(db);
  const repo = new Repo(db, () => ulid());
  const a = await repo.createProject("Recap after a session");
  const b = await repo.createProject("Onboarding drop-off");
  const graphA: Graph = { nodes: { s: source("s", { title: "Interviews", phase: "understand" }) }, edges: [], outputs: {}, seq: 1 } as Graph;
  const graphB: Graph = { nodes: { t: source("t", { title: "Funnel export", phase: "understand" }) }, edges: [], outputs: {}, seq: 1 } as Graph;
  await repo.saveWorking(a.id, graphA);
  await repo.saveWorking(b.id, graphB);
  const project = await import("./project");
  const projects = await import("./projects");
  const { useUi } = await import("./ui");
  const comments = await import("./comments");
  await project.loadProject({ repo, project: (await repo.getProject(a.id))!, interrupted: 0 });
  await comments.loadComments();
  const state = () => project.useProject.getState();
  const titles = () => Object.values(state().graph.nodes).map((n) => n.title);
  return { repo, a, b, ...project, ...projects, useUi, ...comments, state, titles };
}

beforeEach(() => {
  history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("switching projects", () => {
  it("loads the other project's graph and leaves nothing of the first behind", async () => {
    const t = await app();
    expect(t.titles()).toContain("Interviews");
    t.actions.select("s");
    t.actions.move("s", { x: 400, y: 200 });
    t.useUi.setState({ studio: { nodeId: "s" }, compareOpen: true, variantsOpen: true });
    t.useProject.setState({ live: { s: { runId: "r1", status: "running", text: "", thinking: "", startedAt: 0 } } });
    expect(t.state().canUndo).toBe(true);

    await t.openProject(t.b.id);

    expect(t.state().project?.id).toBe(t.b.id);
    expect(t.titles()).toContain("Funnel export");
    expect(t.titles()).not.toContain("Interviews");
    expect(t.state().selection).toBeNull();
    expect(t.state().canUndo).toBe(false);
    expect(t.state().live).toEqual({});
    expect(t.useUi.getState()).toMatchObject({ studio: null, compareOpen: false, variantsOpen: false });
    expect(t.useProjects.getState().view).toBe("project");
    expect(t.state().toasts.map((x) => x.text)).toContain("Stopped 1 running step in the project you left.");
    expect(await t.repo.getSetting("last_project")).toBe(t.b.id);
  });

  it("saves an edit made just before switching, and it's there on the way back", async () => {
    const t = await app();
    t.actions.move("s", { x: 640, y: 320 });
    await t.openProject(t.b.id);
    expect((await t.repo.loadWorking(t.a.id))!.nodes.s?.position).toEqual({ x: 640, y: 320 });
    await t.openProject(t.a.id);
    expect(t.state().graph.nodes.s?.position).toEqual({ x: 640, y: 320 });
  });

  it("keeps canvas comments with the project they were written in", async () => {
    const t = await app();
    const note = t.comments.add({ x: 10, y: 10 });
    t.comments.update(note.id, { text: "Ask about week two" });
    await t.openProject(t.b.id);
    expect(t.useComments.getState().list).toEqual([]);
    expect(await t.repo.getSetting(`comments:${t.b.id}`)).toBeUndefined();
    await t.openProject(t.a.id);
    expect(t.useComments.getState().list.map((c) => c.text)).toEqual(["Ask about week two"]);
  });

  it("opening the open project just leaves Home", async () => {
    const t = await app();
    t.goHome();
    expect(t.useProjects.getState().view).toBe("home");
    t.actions.select("s");
    await t.openProject(t.a.id);
    expect(t.useProjects.getState().view).toBe("project");
    expect(t.state().selection).toBe("s");
  });
});

describe("Home's project actions", () => {
  it("lists projects newest edit first and starts a new one in Understand", async () => {
    const t = await app();
    await t.refreshHome();
    // Opening "Recap" scaffolded its Understand phase, which counts as its latest edit.
    expect(t.useProjects.getState().list.map((c) => c.project.name)).toEqual(["Recap after a session", "Onboarding drop-off"]);
    await t.createProject("  ");
    expect(t.state().project).toMatchObject({ name: "Untitled problem", activePhase: "understand" });
    expect(Object.values(t.state().graph.nodes).some((n) => n.phase === "understand")).toBe(true);
    await t.refreshHome();
    expect(t.useProjects.getState().list[0]?.project.name).toBe("Untitled problem");
  });

  it("renames, and the open project's title follows", async () => {
    const t = await app();
    await t.renameProject(t.a.id, "Recap, take two");
    expect(t.state().project?.name).toBe("Recap, take two");
    expect((await t.repo.getProject(t.a.id))?.name).toBe("Recap, take two");
  });

  it("duplicates the current state, comments included", async () => {
    const t = await app();
    const note = t.comments.add({ x: 1, y: 1 });
    t.comments.update(note.id, { text: "Copy me" });
    t.actions.move("s", { x: 88, y: 99 });
    await t.duplicateProject(t.a.id);
    const copy = t.useProjects.getState().list.find((c) => c.project.name === "Recap after a session copy");
    expect(copy).toBeDefined();
    expect((await t.repo.loadWorking(copy!.project.id))!.nodes.s?.position).toEqual({ x: 88, y: 99 });
    expect(await t.repo.getSetting(`comments:${copy!.project.id}`)).toEqual([expect.objectContaining({ text: "Copy me" })]);
  });

  it("archives the open project without deleting it, and restores it", async () => {
    const t = await app();
    t.goHome();
    await t.archiveProject(t.a.id);
    expect(t.state().project).toBeUndefined();
    expect(t.useProjects.getState().list.map((c) => c.project.id)).toEqual([t.b.id]);
    expect(t.useProjects.getState().archived.map((c) => c.project.id)).toEqual([t.a.id]);
    t.leaveHome();
    expect(t.useProjects.getState().view).toBe("home");
    await t.restoreProject(t.a.id);
    expect(t.useProjects.getState().list.map((c) => c.project.id).sort()).toEqual([t.a.id, t.b.id].sort());
    await t.openProject(t.a.id);
    expect(t.titles()).toContain("Interviews");
  });
});
