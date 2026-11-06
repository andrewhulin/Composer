// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ulid } from "@composer/core";
import { foundationsBlock } from "@composer/engine";
import { migrate, Repo } from "@composer/data";
import { nodeSqliteDriver } from "@composer/data/node-sqlite";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

const DENSE = "---\nname: Dense lists\ndescription: Compact layouts for pro tools\n---\nKeep rows tight. DENSE-RAW-TEXT";
const AIRY = "---\nname: Airy lists\ndescription: Calm layouts with room\n---\nGive rows room. AIRY-RAW-TEXT";

/** The app over an in-memory database, with the scripted model (?fake) answering compiles. */
async function app() {
  vi.resetModules();
  history.replaceState(null, "", "/?fake");
  const db = nodeSqliteDriver();
  await migrate(db);
  const repo = new Repo(db, () => ulid());
  const a = await repo.createProject("A");
  const b = await repo.createProject("B");
  const project = await import("./project");
  const craft = await import("./craft");
  const skills = await import("./skills");
  await project.loadProject({ repo, project: a, interrupted: 0 });
  await craft.loadCraft();
  await skills.loadSkills();
  return { repo, a, b, ...project, ...craft, ...skills, s: () => skills.useSkills.getState() };
}

describe("the skills library", () => {
  it("imports a folder of skills, asking which to install", async () => {
    const t = await app();
    await t.importFiles([{ path: "dense/SKILL.md", content: DENSE }, { path: "dense/references/grid.md", content: "8px" }, { path: "airy/SKILL.md", content: AIRY }], "folder:/skills", "skills");
    expect(t.s().pending?.choices.map((c) => c.name)).toEqual(["Dense lists", "Airy lists"]);
    t.toggleChoice("airy");
    await t.installPending();
    expect(t.s().skills.map((x) => [x.id, x.kind, x.mode, x.source, x.files.map((f) => f.path)])).toEqual([["dense-lists", "craft", "always", "folder:/skills/dense", ["references/grid.md"]]]);
  });

  it("switches skills globally, per project and per phase, and remembers it", async () => {
    const t = await app();
    await t.importFiles([{ path: "SKILL.md", content: DENSE }], "folder:/dense", "dense");
    const id = "dense-lists";
    expect(t.activeSkills("build").map((x) => x.id)).toEqual([id]);
    await t.setOverride(id, false);
    expect(t.activeSkills("build")).toEqual([]);
    expect(await t.repo.getSetting(`skills:${t.a.id}`)).toEqual({ [id]: false });
    // Project B follows the global switch.
    await t.loadProject({ repo: t.repo, project: t.b, interrupted: 0 });
    await t.loadSkills();
    expect(t.activeSkills("build").map((x) => x.id)).toEqual([id]);
    await t.setPhases(id, ["build"]);
    expect(t.activeSkills("define")).toEqual([]);
    expect(t.activeSkills("build").map((x) => x.id)).toEqual([id]);
    await t.setGlobal(id, false);
    expect((await t.repo.getSkill(id))?.enabled).toBe(false);
  });
});

describe("the Craft Brief", () => {
  async function compiled() {
    const t = await app();
    await t.importFiles([{ path: "a/SKILL.md", content: DENSE }, { path: "b/SKILL.md", content: AIRY }], "folder:/s", "s");
    await t.installPending();
    await t.compileBrief();
    return t;
  }

  it("compiles cited principles and lists the conflict between two skills", async () => {
    const t = await compiled();
    const c = t.s().candidate!;
    expect(c.general.map((p) => [...p.sources].sort())).toContainEqual(["airy-lists", "dense-lists"]);
    expect(c.conflicts.map((x) => x.topic)).toEqual(["Row density"]);
    expect(await t.repo.getSetting("craft_brief_candidate")).toEqual(c);
  });

  it("applies a resolution now, and doesn't ask again on the next compile", async () => {
    const t = await compiled();
    const key = t.s().candidate!.conflicts[0]!.key;
    await t.resolveConflict(key, { choice: "b" });
    expect(t.s().candidate!.conflicts).toEqual([]);
    expect(t.s().candidate!.general.map((p) => p.text)).toContain("Give list rows room: 12px apart.");
    await t.compileBrief();
    expect(t.s().candidate!.conflicts).toEqual([]);
    expect(t.s().candidate!.general.map((p) => p.text)).toContain("Give list rows room: 12px apart.");
  });

  it("goes live through a proposal, and runs carry it, recording the skills behind it", async () => {
    const t = await compiled();
    await t.resolveConflict(t.s().candidate!.conflicts[0]!.key, { choice: "a" });
    const p = await t.proposeBrief();
    expect(p?.targetKind).toBe("craft_brief");
    expect(t.s().candidate).toBeNull();
    await t.keepBrief(p!);
    const brief = t.s().brief!;
    expect(brief.row.version).toBe("v1");
    expect(t.useProject.getState().env.foundations).toContain(brief.row.id);
    const block = foundationsBlock(t.craftHooks.foundations("build"));
    expect(block).toContain('<craft_brief version="v1">');
    expect(block).toContain("Keep list rows dense: 4px apart.");
    expect(block).not.toContain("DENSE-RAW-TEXT");
    expect(block).not.toContain("AIRY-RAW-TEXT");
    expect(t.craftHooks.skillIds("build").sort()).toEqual(["skill:airy-lists@1", "skill:dense-lists@1"]);
    // A skill switched off in this project drops out of its runs.
    await t.setOverride("airy-lists", false);
    expect(t.craftHooks.skillIds("build")).toEqual(["skill:dense-lists@1"]);
    expect(t.isStale()).toBe(true);
  });
});
