import {
  canonicalJson,
  emptyGraph,
  fromManifest,
  hashOf,
  toManifest,
  type Graph,
  type Hash,
  type HypothesisBlock,
  type HypothesisStatus,
  type Id,
  type IdFactory,
  type Manifest,
  type OutputVersion,
  type Phase,
} from "@composer/core";
import type { Row, SqlDriver, SqlValue, Statement } from "./driver";

export interface Clock {
  now(): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export interface ProjectRow {
  id: Id;
  name: string;
  activePhase: Phase;
  loop: number;
  branchId: Id;
  seq: number;
  workingManifest: Hash | null;
  createdAt: string;
  updatedAt: string;
  /** Set when archived from Home. Archived projects keep everything and can be restored. */
  archivedAt: string | null;
}

/** What a Home card shows about a project beyond its row. */
export interface ProjectCover {
  /** The newest locked key output, any phase. */
  latest?: { phase: Phase; contentHash: Hash; createdAt: string };
  /** The newest prototype a Build run produced, locked or not. */
  prototypeHash?: Hash;
}

/** Old id to new id, for the rows a duplicate copies. */
interface IdMaps {
  family: Map<Id, Id>;
  version: Map<Id, Id>;
  block: Map<Id, Id>;
  run: Map<Id, Id>;
}

export type SnapshotKind = "run" | "lock" | "swap" | "fork" | "manual" | "init";

export interface SnapshotRow {
  id: Id;
  projectId: Id;
  branchId: Id;
  parentId: Id | null;
  seq: number;
  manifestHash: Hash;
  kind: SnapshotKind;
  causeId: Id | null;
  label: string | null;
  phase: Phase;
  createdAt: string;
}

export interface BranchRow {
  id: Id;
  projectId: Id;
  name: string;
  headSnapshotId: Id | null;
  forkedFromSnapshotId: Id | null;
  state: "active" | "merged_back" | "retired";
  createdAt: string;
}

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export interface RunRow {
  id: Id;
  projectId: Id;
  nodeId: Id;
  recipe: string;
  status: RunStatus;
  localKey: Hash;
  envKey: Hash;
  inputManifestHash: Hash | null;
  promptHash: Hash | null;
  reportHash: Hash | null;
  outputHash: Hash | null;
  stopReason: string | null;
  model: string;
  effort: string;
  templateVersionId: Id | null;
  ruleIds: string[];
  foundationIds: string[];
  usage: Record<string, number> | null;
  error: string | null;
  startedSeq: number;
  endedSeq: number | null;
  startedAt: string;
  endedAt: string | null;
}


export type FoundationSlot = "design_system" | "philosophy";

export interface FoundationRow {
  id: Id;
  slot: FoundationSlot;
  version: string;
  contentHash: Hash;
  /** What changed in this version, in the designer's terms. */
  changelog: { kind: string; title: string; text: string } | null;
  parentId: Id | null;
  createdAt: string;
}

export type ProposalTarget = "design_system" | "philosophy" | "rule";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "deferred";

export interface ProposalRow<D = unknown> {
  id: Id;
  targetKind: ProposalTarget;
  targetId: Id | null;
  baseVersion: string | null;
  diff: D;
  diffHash: Hash;
  rationale: string;
  evidence: unknown[];
  status: ProposalStatus;
  resolvedVersionId: Id | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CraftRuleRow {
  id: Id;
  lineageId: Id;
  phase: Phase;
  version: number;
  body: string;
  status: "active" | "retired";
  proposalId: Id | null;
  createdAt: string;
}

export type PickSource = "variants" | "rerun" | "replay";

/** A pairwise pick: the designer saw two outputs of the same brief and preferred one. */
export interface PickRow {
  id: Id;
  projectId: Id | null;
  phase: Phase;
  winnerRunId: Id;
  loserRunId: Id;
  source: PickSource;
  note: string | null;
  createdAt: string;
}

/** A past brief kept to replay against proposed rule and principle changes. */
export interface ReplayCaseRow {
  id: Id;
  projectId: Id | null;
  phase: Phase;
  recipe: string;
  runId: Id;
  name: string;
  promptHash: Hash;
  outputHash: Hash;
  retired: boolean;
  createdAt: string;
}

export interface ReplayResultRow {
  id: Id;
  proposalId: Id;
  caseId: Id;
  outputHash: Hash | null;
  status: "done" | "error";
  error: string | null;
  pick: "baseline" | "candidate" | "same" | null;
  createdAt: string;
}

export interface ScoredRunRow {
  run: RunRow;
  score: number;
  note: string | null;
}

const str = (v: SqlValue | undefined): string => (v == null ? "" : String(v));
const strOrNull = (v: SqlValue | undefined): string | null => (v == null ? null : String(v));
const json = <T>(v: SqlValue | undefined, fallback: T): T => (v == null ? fallback : (JSON.parse(String(v)) as T));

/** Every read and write the app does, over a SqlDriver. Blobs are immutable and content-addressed. */
export class Repo {
  constructor(
    readonly db: SqlDriver,
    readonly ids: IdFactory,
    readonly clock: Clock = systemClock,
  ) {}

  // ── blobs ──────────────────────────────────────────────────────────────

  blobStatements(entries: { hash: Hash; value: unknown; kind: string }[]): Statement[] {
    return entries.map((b) => {
      const data = canonicalJson(b.value);
      return { sql: "INSERT OR IGNORE INTO blob (hash, kind, size, data, created_at) VALUES (?, ?, ?, ?, ?)", params: [b.hash, b.kind, data.length, data, this.clock.now()] };
    });
  }

  async putBlob(value: unknown, kind: string): Promise<Hash> {
    const hash = hashOf(value);
    await this.db.tx(this.blobStatements([{ hash, value, kind }]));
    return hash;
  }

  async getBlob<T = unknown>(hash: Hash): Promise<T | undefined> {
    const [row] = await this.db.all("SELECT data FROM blob WHERE hash = ?", [hash]);
    return row ? (JSON.parse(str(row.data)) as T) : undefined;
  }

  async getBlobs(hashes: Hash[]): Promise<Map<Hash, unknown>> {
    const out = new Map<Hash, unknown>();
    const unique = [...new Set(hashes)];
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const rows = await this.db.all(`SELECT hash, data FROM blob WHERE hash IN (${chunk.map(() => "?").join(",")})`, chunk);
      for (const r of rows) out.set(str(r.hash), JSON.parse(str(r.data)));
    }
    return out;
  }

  // ── projects and the working graph ───────────────────────────────────────

  async createProject(name: string): Promise<ProjectRow> {
    const id = this.ids();
    const branchId = this.ids();
    const now = this.clock.now();
    await this.db.tx([
      { sql: "INSERT INTO project (id, name, branch_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", params: [id, name, branchId, now, now] },
      { sql: "INSERT INTO branch (id, project_id, name, created_at) VALUES (?, ?, ?, ?)", params: [branchId, id, "main", now] },
    ]);
    return (await this.getProject(id))!;
  }

  async getProject(id: Id): Promise<ProjectRow | undefined> {
    const [r] = await this.db.all("SELECT * FROM project WHERE id = ?", [id]);
    return r ? toProject(r) : undefined;
  }

  /** Most recently edited first. Archived projects only when asked for. */
  async listProjects(opts: { archived?: boolean } = {}): Promise<ProjectRow[]> {
    const where = opts.archived ? "archived_at IS NOT NULL" : "archived_at IS NULL";
    return (await this.db.all(`SELECT * FROM project WHERE ${where} ORDER BY updated_at DESC`)).map(toProject);
  }

  /** Hides a project from Home. Nothing is deleted, and it doesn't count as an edit. */
  async archiveProject(id: Id): Promise<void> {
    await this.db.run("UPDATE project SET archived_at = ? WHERE id = ?", [this.clock.now(), id]);
  }

  async restoreProject(id: Id): Promise<void> {
    await this.db.run("UPDATE project SET archived_at = NULL WHERE id = ?", [id]);
  }

  /** For Home: each project's newest locked output and newest prototype. */
  async projectCovers(): Promise<Record<Id, ProjectCover>> {
    const out: Record<Id, ProjectCover> = {};
    const latest = await this.db.all(
      "SELECT v.project_id, v.phase, v.content_hash, v.created_at FROM output_version v WHERE v.created_at = (SELECT MAX(created_at) FROM output_version w WHERE w.project_id = v.project_id)",
    );
    for (const r of latest) out[str(r.project_id)] = { latest: { phase: str(r.phase) as Phase, contentHash: str(r.content_hash), createdAt: str(r.created_at) } };
    const protos = await this.db.all(
      "SELECT r.project_id, r.output_hash FROM run r WHERE r.recipe = 'prototype' AND r.status = 'succeeded' AND r.output_hash IS NOT NULL AND r.started_seq = (SELECT MAX(started_seq) FROM run q WHERE q.project_id = r.project_id AND q.recipe = 'prototype' AND q.status = 'succeeded' AND q.output_hash IS NOT NULL)",
    );
    for (const r of protos) (out[str(r.project_id)] ??= {}).prototypeHash = str(r.output_hash);
    return out;
  }

  /**
   * A new project holding a copy of another's current state: the working graph, its locked
   * outputs, hypotheses and latest runs. History (snapshots, bookmarks, decisions) and eval
   * evidence (scores, picks, replay cases) stay with the original, so nothing is counted twice.
   * Copied rows get new ids; `rekey` lets the caller refresh node keys that depend on them.
   */
  async duplicateProject(sourceId: Id, name: string, rekey: (before: Graph, after: Graph) => Graph = (_b, a) => a): Promise<ProjectRow> {
    const src = await this.getProject(sourceId);
    if (!src) throw new Error(`No project ${sourceId}`);
    const before = (await this.loadWorking(sourceId)) ?? emptyGraph();
    const [versions, blocks, runs] = await Promise.all([
      this.db.all("SELECT * FROM output_version WHERE project_id = ?", [sourceId]),
      this.db.all("SELECT * FROM hypothesis_block WHERE project_id = ?", [sourceId]),
      this.db.all("SELECT * FROM run WHERE project_id = ? AND status != 'running'", [sourceId]),
    ]);
    const maps: IdMaps = { family: new Map(), version: new Map(), block: new Map(), run: new Map() };
    const fresh = (m: Map<Id, Id>, id: Id) => m.get(id) ?? (m.set(id, this.ids()), m.get(id)!);
    for (const r of runs) fresh(maps.run, str(r.id));
    for (const r of blocks) fresh(maps.block, str(r.id));
    for (const r of versions) {
      fresh(maps.version, str(r.id));
      fresh(maps.family, str(r.family_id));
    }
    for (const n of Object.values(before.nodes)) if (n.kind === "output") fresh(maps.family, n.familyId);

    const id = this.ids();
    const branchId = this.ids();
    const now = this.clock.now();
    const mapped = (m: Map<Id, Id>, v: SqlValue | undefined) => (v == null ? null : (m.get(str(v)) ?? str(v)));
    const insert = (table: string, row: Row): Statement => {
      const cols = Object.keys(row);
      return { sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, params: cols.map((c) => row[c] as SqlValue) };
    };
    const after = rekey(before, remapGraph(before, maps));
    const { hash, statements } = this.graphStatements(after);
    await this.db.tx([
      ...statements,
      {
        sql: "INSERT INTO project (id, name, active_phase, loop, branch_id, working_manifest, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params: [id, name, src.activePhase, src.loop, branchId, hash, now, now],
      },
      { sql: "INSERT INTO branch (id, project_id, name, created_at) VALUES (?, ?, ?, ?)", params: [branchId, id, "main", now] },
      ...runs.map((r) => insert("run", { ...r, id: mapped(maps.run, r.id), project_id: id })),
      ...blocks.map((r) => insert("hypothesis_block", { ...r, id: mapped(maps.block, r.id), project_id: id, parent_id: mapped(maps.block, r.parent_id), snapshot_id: null })),
      ...versions.map((r) =>
        insert("output_version", { ...r, id: mapped(maps.version, r.id), project_id: id, family_id: mapped(maps.family, r.family_id), run_id: mapped(maps.run, r.run_id), snapshot_id: null }),
      ),
    ]);
    await this.snapshot({ projectId: id, graph: after, kind: "init", phase: src.activePhase, label: `Duplicated from ${src.name}` });
    return (await this.getProject(id))!;
  }

  async updateProject(id: Id, patch: Partial<Pick<ProjectRow, "name" | "activePhase" | "loop" | "branchId">>): Promise<void> {
    const fields: [string, SqlValue | undefined][] = [
      ["name", patch.name],
      ["active_phase", patch.activePhase],
      ["loop", patch.loop],
      ["branch_id", patch.branchId],
    ];
    const set = fields.filter(([, v]) => v !== undefined) as [string, SqlValue][];
    if (!set.length) return;
    const cols = set.map(([c]) => `${c} = ?`);
    const params = set.map(([, v]) => v);
    await this.db.run(`UPDATE project SET ${cols.join(", ")}, updated_at = ? WHERE id = ?`, [...params, this.clock.now(), id]);
  }

  private graphStatements(graph: Graph): { manifest: Manifest; hash: Hash; statements: Statement[] } {
    const { manifest, blobs } = toManifest(graph);
    const hash = hashOf(manifest);
    const statements = this.blobStatements([...blobs.map((b) => ({ ...b, kind: "node" })), { hash, value: manifest, kind: "manifest" }]);
    return { manifest, hash, statements };
  }

  /** Autosave of the canvas between snapshots. */
  async saveWorking(projectId: Id, graph: Graph): Promise<Hash> {
    const { hash, statements } = this.graphStatements(graph);
    await this.db.tx([...statements, { sql: "UPDATE project SET working_manifest = ?, updated_at = ? WHERE id = ?", params: [hash, this.clock.now(), projectId] }]);
    return hash;
  }

  async loadGraph(manifestHash: Hash): Promise<Graph> {
    const manifest = await this.getBlob<Manifest>(manifestHash);
    if (!manifest) throw new Error(`Missing manifest ${manifestHash}`);
    const blobs = await this.getBlobs(Object.values(manifest.nodes));
    return fromManifest(manifest, (h) => blobs.get(h));
  }

  async loadWorking(projectId: Id): Promise<Graph | undefined> {
    const p = await this.getProject(projectId);
    return p?.workingManifest ? this.loadGraph(p.workingManifest) : undefined;
  }

  // ── snapshots, branches, bookmarks ───────────────────────────────────────

  /** Records the graph as a snapshot on the project's current branch and moves the head. */
  async snapshot(input: { projectId: Id; graph: Graph; kind: SnapshotKind; phase: Phase; causeId?: Id; label?: string }): Promise<SnapshotRow> {
    const p = await this.getProject(input.projectId);
    if (!p) throw new Error(`No project ${input.projectId}`);
    const branch = await this.getBranch(p.branchId);
    const { hash, statements } = this.graphStatements(input.graph);
    const id = this.ids();
    const seq = p.seq + 1;
    const now = this.clock.now();
    await this.db.tx([
      ...statements,
      {
        sql: "INSERT INTO snapshot (id, project_id, branch_id, parent_id, seq, manifest_hash, kind, cause_id, label, phase, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [id, p.id, p.branchId, branch?.headSnapshotId ?? null, seq, hash, input.kind, input.causeId ?? null, input.label ?? null, input.phase, now],
      },
      { sql: "UPDATE branch SET head_snapshot_id = ? WHERE id = ?", params: [id, p.branchId] },
      { sql: "UPDATE project SET seq = ?, working_manifest = ?, updated_at = ? WHERE id = ?", params: [seq, hash, now, p.id] },
    ]);
    return (await this.getSnapshot(id))!;
  }

  async getSnapshot(id: Id): Promise<SnapshotRow | undefined> {
    const [r] = await this.db.all("SELECT * FROM snapshot WHERE id = ?", [id]);
    return r ? toSnapshot(r) : undefined;
  }

  /** All snapshots of a project in sequence order (the timeline). */
  async listSnapshots(projectId: Id): Promise<SnapshotRow[]> {
    return (await this.db.all("SELECT * FROM snapshot WHERE project_id = ? ORDER BY seq", [projectId])).map(toSnapshot);
  }

  /** Snapshots from the root to `snapshotId`, following parent links (the playback path). */
  async lineage(snapshotId: Id): Promise<SnapshotRow[]> {
    const out: SnapshotRow[] = [];
    let cur = await this.getSnapshot(snapshotId);
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? await this.getSnapshot(cur.parentId) : undefined;
    }
    return out;
  }

  async getBranch(id: Id): Promise<BranchRow | undefined> {
    const [r] = await this.db.all("SELECT * FROM branch WHERE id = ?", [id]);
    return r ? toBranch(r) : undefined;
  }

  async listBranches(projectId: Id): Promise<BranchRow[]> {
    return (await this.db.all("SELECT * FROM branch WHERE project_id = ? ORDER BY created_at", [projectId])).map(toBranch);
  }

  /** Starts a branch at `snapshotId` and makes it current. The old branch keeps its history. */
  async branchFrom(projectId: Id, snapshotId: Id, name: string): Promise<BranchRow> {
    const id = this.ids();
    const snap = await this.getSnapshot(snapshotId);
    if (!snap) throw new Error(`No snapshot ${snapshotId}`);
    await this.db.tx([
      { sql: "INSERT INTO branch (id, project_id, name, head_snapshot_id, forked_from_snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", params: [id, projectId, name, snapshotId, snapshotId, this.clock.now()] },
      { sql: "UPDATE project SET branch_id = ?, working_manifest = ?, updated_at = ? WHERE id = ?", params: [id, snap.manifestHash, this.clock.now(), projectId] },
    ]);
    return (await this.getBranch(id))!;
  }

  async setBranchState(id: Id, state: BranchRow["state"], reason: string, projectId: Id): Promise<void> {
    await this.db.tx([
      { sql: "UPDATE branch SET state = ? WHERE id = ?", params: [state, id] },
      this.decisionStatement(projectId, "branch_state", reason, { branchId: id, state }),
    ]);
  }

  /** Makes another branch current: the working graph becomes that branch's head. */
  async switchBranch(projectId: Id, branchId: Id): Promise<void> {
    const b = await this.getBranch(branchId);
    const head = b?.headSnapshotId ? await this.getSnapshot(b.headSnapshotId) : undefined;
    await this.db.tx([
      { sql: "UPDATE project SET branch_id = ?, working_manifest = COALESCE(?, working_manifest), updated_at = ? WHERE id = ?", params: [branchId, head?.manifestHash ?? null, this.clock.now(), projectId] },
    ]);
  }

  /** Moves the current branch head back to an earlier snapshot without deleting anything (undo of a fork). */
  async moveHead(projectId: Id, snapshotId: Id): Promise<void> {
    const p = await this.getProject(projectId);
    const snap = await this.getSnapshot(snapshotId);
    if (!p || !snap) return;
    await this.db.tx([
      { sql: "UPDATE branch SET head_snapshot_id = ? WHERE id = ?", params: [snapshotId, p.branchId] },
      { sql: "UPDATE project SET working_manifest = ?, updated_at = ? WHERE id = ?", params: [snap.manifestHash, this.clock.now(), projectId] },
    ]);
  }

  async bookmark(snapshotId: Id, label: string): Promise<void> {
    await this.db.run("INSERT OR REPLACE INTO bookmark (snapshot_id, label, created_at) VALUES (?, ?, ?)", [snapshotId, label, this.clock.now()]);
  }

  async removeBookmark(snapshotId: Id): Promise<void> {
    await this.db.run("DELETE FROM bookmark WHERE snapshot_id = ?", [snapshotId]);
  }

  async listBookmarks(projectId: Id): Promise<{ snapshotId: Id; label: string; seq: number }[]> {
    const rows = await this.db.all("SELECT b.snapshot_id, b.label, s.seq FROM bookmark b JOIN snapshot s ON s.id = b.snapshot_id WHERE s.project_id = ? ORDER BY s.seq", [projectId]);
    return rows.map((r) => ({ snapshotId: str(r.snapshot_id), label: str(r.label), seq: Number(r.seq) }));
  }

  // ── runs ─────────────────────────────────────────────────────────────────

  async startRun(run: Omit<RunRow, "status" | "endedSeq" | "endedAt" | "outputHash" | "stopReason" | "usage" | "error" | "promptHash" | "reportHash" | "startedAt">): Promise<void> {
    await this.db.run(
      `INSERT INTO run (id, project_id, node_id, recipe, status, local_key, env_key, input_manifest_hash, model, effort, template_version_id, rule_ids, foundation_ids, started_seq, started_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [run.id, run.projectId, run.nodeId, run.recipe, run.localKey, run.envKey, run.inputManifestHash, run.model, run.effort, run.templateVersionId, JSON.stringify(run.ruleIds), JSON.stringify(run.foundationIds), run.startedSeq, this.clock.now()],
    );
  }

  finishRunStatement(id: Id, f: { status: RunStatus; outputHash?: Hash; promptHash?: Hash; reportHash?: Hash; stopReason?: string | null; usage?: Record<string, number>; error?: string; endedSeq?: number }): Statement {
    return {
      sql: "UPDATE run SET status = ?, output_hash = ?, prompt_hash = ?, report_hash = ?, stop_reason = ?, usage = ?, error = ?, ended_seq = ?, ended_at = ? WHERE id = ?",
      params: [f.status, f.outputHash ?? null, f.promptHash ?? null, f.reportHash ?? null, f.stopReason ?? null, f.usage ? JSON.stringify(f.usage) : null, f.error ?? null, f.endedSeq ?? null, this.clock.now(), id],
    };
  }

  async finishRun(id: Id, f: Parameters<Repo["finishRunStatement"]>[1], blobs: { hash: Hash; value: unknown; kind: string }[] = []): Promise<void> {
    await this.db.tx([...this.blobStatements(blobs), this.finishRunStatement(id, f)]);
  }

  async getRun(id: Id): Promise<RunRow | undefined> {
    const [r] = await this.db.all("SELECT * FROM run WHERE id = ?", [id]);
    return r ? toRun(r) : undefined;
  }

  async runsForNode(nodeId: Id): Promise<RunRow[]> {
    return (await this.db.all("SELECT * FROM run WHERE node_id = ? ORDER BY started_seq", [nodeId])).map(toRun);
  }

  async runsForProject(projectId: Id): Promise<RunRow[]> {
    return (await this.db.all("SELECT * FROM run WHERE project_id = ? ORDER BY started_seq", [projectId])).map(toRun);
  }

  /** On boot: runs left `running` by a quit or crash become `interrupted`. */
  async interruptOrphanedRuns(): Promise<number> {
    const rows = await this.db.all("SELECT id FROM run WHERE status = 'running'");
    if (rows.length) await this.db.run("UPDATE run SET status = 'interrupted', ended_at = ? WHERE status = 'running'", [this.clock.now()]);
    return rows.length;
  }

  // ── locked outputs ───────────────────────────────────────────────────────

  async lockOutput(input: { projectId: Id; familyId: Id; phase: Phase; loop: number; content: unknown; runId?: Id; snapshotId?: Id }): Promise<OutputVersion> {
    const [r] = await this.db.all("SELECT MAX(version) AS v FROM output_version WHERE family_id = ?", [input.familyId]);
    const version = (r?.v == null ? 0 : Number(r.v)) + 1;
    const contentHash = hashOf(input.content);
    const id = this.ids();
    await this.db.tx([
      ...this.blobStatements([{ hash: contentHash, value: input.content, kind: "artifact" }]),
      {
        sql: "INSERT INTO output_version (id, project_id, family_id, phase, loop, version, content_hash, run_id, snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [id, input.projectId, input.familyId, input.phase, input.loop, version, contentHash, input.runId ?? null, input.snapshotId ?? null, this.clock.now()],
      },
      this.decisionStatement(input.projectId, "lock", `Locked ${input.phase} output v${version}`, { versionId: id }),
    ]);
    return (await this.getOutputVersion(id))!;
  }

  async getOutputVersion(id: Id): Promise<OutputVersion | undefined> {
    const [r] = await this.db.all("SELECT * FROM output_version WHERE id = ?", [id]);
    return r ? toVersion(r) : undefined;
  }

  async latestVersion(familyId: Id): Promise<OutputVersion | undefined> {
    const [r] = await this.db.all("SELECT * FROM output_version WHERE family_id = ? ORDER BY version DESC LIMIT 1", [familyId]);
    return r ? toVersion(r) : undefined;
  }

  async listVersions(projectId: Id): Promise<OutputVersion[]> {
    return (await this.db.all("SELECT * FROM output_version WHERE project_id = ? ORDER BY created_at", [projectId])).map(toVersion);
  }

  async setVersionSnapshot(versionId: Id, snapshotId: Id): Promise<void> {
    await this.db.run("UPDATE output_version SET snapshot_id = ? WHERE id = ?", [snapshotId, versionId]);
  }

  // ── hypothesis chain ─────────────────────────────────────────────────────

  async createHypothesis(b: Omit<HypothesisBlock, "id">, snapshotId?: Id): Promise<HypothesisBlock> {
    const id = this.ids();
    await this.db.run(
      "INSERT INTO hypothesis_block (id, project_id, label, parent_id, statement, vars, status, confidence, note, snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, b.projectId, b.label, b.parentId ?? null, b.statement, JSON.stringify(b.vars), b.status, b.confidence, b.note ?? null, snapshotId ?? null, this.clock.now()],
    );
    return (await this.getHypothesis(id))!;
  }

  async getHypothesis(id: Id): Promise<HypothesisBlock | undefined> {
    const [r] = await this.db.all("SELECT * FROM hypothesis_block WHERE id = ?", [id]);
    return r ? toBlock(r) : undefined;
  }

  async listHypotheses(projectId: Id): Promise<HypothesisBlock[]> {
    return (await this.db.all("SELECT * FROM hypothesis_block WHERE project_id = ? ORDER BY created_at", [projectId])).map(toBlock);
  }

  /** Status changes never delete; each one is logged as a decision. */
  async setHypothesisStatus(id: Id, status: HypothesisStatus, reason: string, note?: string): Promise<void> {
    const b = await this.getHypothesis(id);
    if (!b) return;
    await this.db.tx([
      { sql: "UPDATE hypothesis_block SET status = ?, note = COALESCE(?, note) WHERE id = ?", params: [status, note ?? null, id] },
      this.decisionStatement(b.projectId, "hypothesis_status", reason, { blockId: id, status }),
    ]);
  }

  // ── decisions, scores, links, token counts, settings ─────────────────────

  decisionStatement(projectId: Id | null, kind: string, statement: string, payload?: unknown, snapshotId?: Id): Statement {
    return {
      sql: "INSERT INTO decision (id, project_id, kind, statement, payload, snapshot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      params: [this.ids(), projectId, kind, statement, payload === undefined ? null : JSON.stringify(payload), snapshotId ?? null, this.clock.now()],
    };
  }

  async decide(projectId: Id | null, kind: string, statement: string, payload?: unknown, snapshotId?: Id): Promise<void> {
    await this.db.tx([this.decisionStatement(projectId, kind, statement, payload, snapshotId)]);
  }

  async listDecisions(projectId: Id): Promise<{ id: Id; kind: string; statement: string; payload: unknown; createdAt: string }[]> {
    const rows = await this.db.all("SELECT * FROM decision WHERE project_id = ? ORDER BY created_at, id", [projectId]);
    return rows.map((r) => ({ id: str(r.id), kind: str(r.kind), statement: str(r.statement), payload: json(r.payload, null), createdAt: str(r.created_at) }));
  }

  async score(runId: Id, value: number, note?: string, criterion?: string): Promise<void> {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("Scores are whole numbers from 1 to 5");
    await this.db.run("INSERT INTO score (id, run_id, value, criterion, note, created_at) VALUES (?, ?, ?, ?, ?, ?)", [this.ids(), runId, value, criterion ?? null, note ?? null, this.clock.now()]);
  }

  async scoresForRun(runId: Id): Promise<{ value: number; note: string | null }[]> {
    return (await this.db.all("SELECT value, note FROM score WHERE run_id = ? ORDER BY created_at", [runId])).map((r) => ({ value: Number(r.value), note: strOrNull(r.note) }));
  }

  async link(from: [string, Id], rel: string, to: [string, Id]): Promise<void> {
    await this.db.run("INSERT OR IGNORE INTO link (from_kind, from_id, rel, to_kind, to_id) VALUES (?, ?, ?, ?, ?)", [from[0], from[1], rel, to[0], to[1]]);
  }

  async linksTo(kind: string, id: Id): Promise<{ fromKind: string; fromId: Id; rel: string }[]> {
    return (await this.db.all("SELECT from_kind, from_id, rel FROM link WHERE to_kind = ? AND to_id = ?", [kind, id])).map((r) => ({ fromKind: str(r.from_kind), fromId: str(r.from_id), rel: str(r.rel) }));
  }

  async tokenCount(hash: Hash, family: string): Promise<number | undefined> {
    const [r] = await this.db.all("SELECT tokens FROM token_count WHERE hash = ? AND model_family = ?", [hash, family]);
    return r ? Number(r.tokens) : undefined;
  }

  async setTokenCount(hash: Hash, family: string, tokens: number): Promise<void> {
    await this.db.run("INSERT OR REPLACE INTO token_count (hash, model_family, tokens) VALUES (?, ?, ?)", [hash, family, tokens]);
  }

  // ── craft: foundations, proposals, rules, scores ─────────────────────────

  /** A new version of a slot. Content is a blob; earlier versions stay as they were. */
  async saveFoundation(slot: FoundationSlot, version: string, content: unknown, changelog: FoundationRow["changelog"], parentId: Id | null): Promise<FoundationRow> {
    const contentHash = hashOf(content);
    const row: FoundationRow = { id: this.ids(), slot, version, contentHash, changelog, parentId, createdAt: this.clock.now() };
    await this.db.tx([
      ...this.blobStatements([{ hash: contentHash, value: content, kind: slot }]),
      {
        sql: "INSERT INTO foundation_version (id, slot, version, content_hash, changelog, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [row.id, slot, version, contentHash, changelog ? JSON.stringify(changelog) : null, parentId, row.createdAt],
      },
      this.decisionStatement(null, "foundation", `${slot === "design_system" ? "Design system" : "Philosophy"} ${version}${changelog ? `: ${changelog.title}` : ""}`, { versionId: row.id }),
    ]);
    return row;
  }

  async listFoundations(slot: FoundationSlot): Promise<FoundationRow[]> {
    return (await this.db.all("SELECT * FROM foundation_version WHERE slot = ? ORDER BY rowid", [slot])).map(toFoundation);
  }

  async latestFoundation<T>(slot: FoundationSlot): Promise<{ row: FoundationRow; content: T } | undefined> {
    const [r] = await this.db.all("SELECT * FROM foundation_version WHERE slot = ? ORDER BY rowid DESC LIMIT 1", [slot]);
    if (!r) return undefined;
    const row = toFoundation(r);
    const content = await this.getBlob<T>(row.contentHash);
    return content === undefined ? undefined : { row, content };
  }

  async createProposal<D>(p: { targetKind: ProposalTarget; targetId?: Id | null; baseVersion?: string | null; diff: D; rationale: string; evidence?: unknown[] }): Promise<ProposalRow<D>> {
    const diffHash = hashOf(p.diff);
    const row: ProposalRow<D> = { id: this.ids(), targetKind: p.targetKind, targetId: p.targetId ?? null, baseVersion: p.baseVersion ?? null, diff: p.diff, diffHash, rationale: p.rationale, evidence: p.evidence ?? [], status: "pending", resolvedVersionId: null, createdAt: this.clock.now(), resolvedAt: null };
    await this.db.tx([
      ...this.blobStatements([{ hash: diffHash, value: p.diff, kind: "proposal_diff" }]),
      {
        sql: "INSERT INTO proposal (id, target_kind, target_id, base_version, diff_hash, rationale, evidence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
        params: [row.id, row.targetKind, row.targetId, row.baseVersion, diffHash, row.rationale, JSON.stringify(row.evidence), row.createdAt],
      },
    ]);
    return row;
  }

  /** Proposals, newest first, with their diffs. A diff already proposed and still pending isn't proposed twice. */
  async listProposals(status?: ProposalStatus): Promise<ProposalRow[]> {
    const rows = await this.db.all(`SELECT * FROM proposal ${status ? "WHERE status = ?" : ""} ORDER BY rowid DESC`, status ? [status] : []);
    const diffs = await this.getBlobs(rows.map((r) => str(r.diff_hash)));
    return rows.map((r) => toProposal(r, diffs.get(str(r.diff_hash))));
  }

  async resolveProposal(id: Id, status: Exclude<ProposalStatus, "pending">, reason: string, resolvedVersionId?: Id | null): Promise<void> {
    await this.db.tx([
      { sql: "UPDATE proposal SET status = ?, resolved_version_id = ?, resolved_at = ? WHERE id = ?", params: [status, resolvedVersionId ?? null, this.clock.now(), id] },
      this.decisionStatement(null, `proposal_${status}`, reason, { proposalId: id, versionId: resolvedVersionId ?? null }),
    ]);
  }

  async addRule(phase: Phase, body: string, proposalId: Id | null, lineageId?: Id): Promise<CraftRuleRow> {
    const id = this.ids();
    const lineage = lineageId ?? id;
    const [v] = await this.db.all("SELECT COALESCE(MAX(version), 0) AS v FROM craft_rule WHERE lineage_id = ?", [lineage]);
    const row: CraftRuleRow = { id, lineageId: lineage, phase, version: Number(v?.v ?? 0) + 1, body, status: "active", proposalId, createdAt: this.clock.now() };
    await this.db.tx([
      { sql: "INSERT INTO craft_rule (id, lineage_id, phase, version, body, status, proposal_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)", params: [row.id, row.lineageId, phase, row.version, body, proposalId, row.createdAt] },
      this.decisionStatement(null, "rule_kept", body, { ruleId: id, phase }),
    ]);
    return row;
  }

  async listRules(status: CraftRuleRow["status"] = "active"): Promise<CraftRuleRow[]> {
    return (await this.db.all("SELECT * FROM craft_rule WHERE status = ? ORDER BY rowid", [status])).map(toRule);
  }

  async retireRule(id: Id, reason: string): Promise<void> {
    await this.db.tx([{ sql: "UPDATE craft_rule SET status = 'retired' WHERE id = ?", params: [id] }, this.decisionStatement(null, "rule_retired", reason, { ruleId: id })]);
  }

  /** Every finished run with its latest score, across projects: the improvement loop's evidence. */
  async scoredRuns(): Promise<ScoredRunRow[]> {
    const rows = await this.db.all(
      `SELECT r.*, s.value AS score_value, s.note AS score_note FROM run r
       JOIN score s ON s.run_id = r.id
       WHERE s.rowid = (SELECT MAX(s2.rowid) FROM score s2 WHERE s2.run_id = r.id)
       ORDER BY r.started_seq`,
    );
    return rows.map((r) => ({ run: toRun(r), score: Number(r.score_value), note: strOrNull(r.score_note) }));
  }

  async latestScore(runId: Id): Promise<number | undefined> {
    const [r] = await this.db.all("SELECT value FROM score WHERE run_id = ? ORDER BY rowid DESC LIMIT 1", [runId]);
    return r ? Number(r.value) : undefined;
  }

  // ── evals: pairwise picks and the replay set ─────────────────────────────

  async addPick(p: { projectId: Id | null; phase: Phase; winnerRunId: Id; loserRunId: Id; source: PickSource; note?: string; statement?: string }): Promise<PickRow> {
    if (p.winnerRunId === p.loserRunId) throw new Error("A pick needs two different runs");
    const row: PickRow = { id: this.ids(), projectId: p.projectId, phase: p.phase, winnerRunId: p.winnerRunId, loserRunId: p.loserRunId, source: p.source, note: p.note ?? null, createdAt: this.clock.now() };
    await this.db.tx([
      {
        sql: "INSERT INTO pick (id, project_id, phase, winner_run_id, loser_run_id, source, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params: [row.id, row.projectId, row.phase, row.winnerRunId, row.loserRunId, row.source, row.note, row.createdAt],
      },
      this.decisionStatement(p.projectId, "pick", p.statement ?? `Preferred one ${p.phase} output over another`, { pickId: row.id, winner: p.winnerRunId, loser: p.loserRunId }),
    ]);
    return row;
  }

  async listPicks(phase?: Phase): Promise<PickRow[]> {
    const rows = await this.db.all(`SELECT * FROM pick ${phase ? "WHERE phase = ?" : ""} ORDER BY rowid`, phase ? [phase] : []);
    return rows.map((r) => ({
      id: str(r.id),
      projectId: strOrNull(r.project_id),
      phase: str(r.phase) as Phase,
      winnerRunId: str(r.winner_run_id),
      loserRunId: str(r.loser_run_id),
      source: str(r.source) as PickSource,
      note: strOrNull(r.note),
      createdAt: str(r.created_at),
    }));
  }

  /** Keeps a run's brief for replay. Keeping the same run twice renames it. */
  async keepReplayCase(c: Omit<ReplayCaseRow, "id" | "retired" | "createdAt">): Promise<ReplayCaseRow> {
    const [existing] = await this.db.all("SELECT id FROM replay_case WHERE run_id = ?", [c.runId]);
    const row: ReplayCaseRow = { ...c, id: existing ? str(existing.id) : this.ids(), retired: false, createdAt: this.clock.now() };
    if (existing) {
      await this.db.run("UPDATE replay_case SET name = ?, retired = 0 WHERE id = ?", [c.name, row.id]);
      return row;
    }
    await this.db.run(
      "INSERT INTO replay_case (id, project_id, phase, recipe, run_id, name, prompt_hash, output_hash, retired, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
      [row.id, row.projectId, row.phase, row.recipe, row.runId, row.name, row.promptHash, row.outputHash, row.createdAt],
    );
    return row;
  }

  async listReplayCases(phase?: Phase): Promise<ReplayCaseRow[]> {
    const rows = await this.db.all(`SELECT * FROM replay_case WHERE retired = 0 ${phase ? "AND phase = ?" : ""} ORDER BY rowid`, phase ? [phase] : []);
    return rows.map((r) => ({
      id: str(r.id),
      projectId: strOrNull(r.project_id),
      phase: str(r.phase) as Phase,
      recipe: str(r.recipe),
      runId: str(r.run_id),
      name: str(r.name),
      promptHash: str(r.prompt_hash),
      outputHash: str(r.output_hash),
      retired: Number(r.retired) === 1,
      createdAt: str(r.created_at),
    }));
  }

  async retireReplayCase(id: Id): Promise<void> {
    await this.db.run("UPDATE replay_case SET retired = 1 WHERE id = ?", [id]);
  }

  async saveReplayResult(r: { proposalId: Id; caseId: Id; outputHash?: Hash | null; status: ReplayResultRow["status"]; error?: string }, blobs: { hash: Hash; value: unknown; kind: string }[] = []): Promise<ReplayResultRow> {
    const row: ReplayResultRow = { id: this.ids(), proposalId: r.proposalId, caseId: r.caseId, outputHash: r.outputHash ?? null, status: r.status, error: r.error ?? null, pick: null, createdAt: this.clock.now() };
    await this.db.tx([
      ...this.blobStatements(blobs),
      { sql: "DELETE FROM replay_result WHERE proposal_id = ? AND case_id = ?", params: [row.proposalId, row.caseId] },
      {
        sql: "INSERT INTO replay_result (id, proposal_id, case_id, output_hash, status, error, pick, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
        params: [row.id, row.proposalId, row.caseId, row.outputHash, row.status, row.error, row.createdAt],
      },
    ]);
    return row;
  }

  async setReplayPick(id: Id, pick: ReplayResultRow["pick"]): Promise<void> {
    await this.db.run("UPDATE replay_result SET pick = ? WHERE id = ?", [pick, id]);
  }

  async replayResults(proposalId: Id): Promise<ReplayResultRow[]> {
    const rows = await this.db.all("SELECT * FROM replay_result WHERE proposal_id = ? ORDER BY rowid", [proposalId]);
    return rows.map((r) => ({
      id: str(r.id),
      proposalId: str(r.proposal_id),
      caseId: str(r.case_id),
      outputHash: strOrNull(r.output_hash),
      status: str(r.status) as ReplayResultRow["status"],
      error: strOrNull(r.error),
      pick: (strOrNull(r.pick) as ReplayResultRow["pick"]) ?? null,
      createdAt: str(r.created_at),
    }));
  }

  /** Decisions across every project, oldest first: what the philosophy learns from. */
  async allDecisions(limit = 200): Promise<{ kind: string; statement: string; createdAt: string }[]> {
    const rows = await this.db.all("SELECT kind, statement, created_at FROM decision ORDER BY rowid DESC LIMIT ?", [limit]);
    return rows.reverse().map((r) => ({ kind: str(r.kind), statement: str(r.statement), createdAt: str(r.created_at) }));
  }

  async settingsWithPrefix<T>(prefix: string): Promise<{ key: string; value: T }[]> {
    const rows = await this.db.all("SELECT key, value FROM setting WHERE key LIKE ? ORDER BY key", [`${prefix.replace(/[%_]/g, "")}%`]);
    return rows.map((r) => ({ key: str(r.key), value: JSON.parse(str(r.value)) as T }));
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const [r] = await this.db.all("SELECT value FROM setting WHERE key = ?", [key]);
    return r ? (JSON.parse(str(r.value)) as T) : undefined;
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.run("INSERT OR REPLACE INTO setting (key, value) VALUES (?, ?)", [key, JSON.stringify(value)]);
  }
}

function toProject(r: Row): ProjectRow {
  return {
    id: str(r.id),
    name: str(r.name),
    activePhase: str(r.active_phase) as Phase,
    loop: Number(r.loop),
    branchId: str(r.branch_id),
    seq: Number(r.seq),
    workingManifest: strOrNull(r.working_manifest),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    archivedAt: strOrNull(r.archived_at),
  };
}

/** The same graph with every id that points at a copied row swapped for the copy's id. */
function remapGraph(graph: Graph, maps: IdMaps): Graph {
  const to = (m: Map<Id, Id>, id: Id) => m.get(id) ?? id;
  const nodes: Graph["nodes"] = {};
  for (const [nid, n] of Object.entries(graph.nodes)) {
    if (n.kind === "hypothesis") nodes[nid] = { ...n, blockId: to(maps.block, n.blockId) };
    else if (n.kind === "output") nodes[nid] = { ...n, familyId: to(maps.family, n.familyId), ...(n.versionId ? { versionId: to(maps.version, n.versionId) } : {}) };
    else if (n.kind === "claude" && n.notes?.length) nodes[nid] = { ...n, notes: n.notes.map((note) => ({ ...note, runId: to(maps.run, note.runId) })) };
    else nodes[nid] = n;
  }
  const outputs: Graph["outputs"] = {};
  for (const [nid, o] of Object.entries(graph.outputs)) outputs[nid] = { ...o, runId: to(maps.run, o.runId) };
  return { ...graph, nodes, outputs };
}

function toSnapshot(r: Row): SnapshotRow {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    branchId: str(r.branch_id),
    parentId: strOrNull(r.parent_id),
    seq: Number(r.seq),
    manifestHash: str(r.manifest_hash),
    kind: str(r.kind) as SnapshotKind,
    causeId: strOrNull(r.cause_id),
    label: strOrNull(r.label),
    phase: str(r.phase) as Phase,
    createdAt: str(r.created_at),
  };
}

function toBranch(r: Row): BranchRow {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    name: str(r.name),
    headSnapshotId: strOrNull(r.head_snapshot_id),
    forkedFromSnapshotId: strOrNull(r.forked_from_snapshot_id),
    state: str(r.state) as BranchRow["state"],
    createdAt: str(r.created_at),
  };
}

function toRun(r: Row): RunRow {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    nodeId: str(r.node_id),
    recipe: str(r.recipe),
    status: str(r.status) as RunStatus,
    localKey: str(r.local_key),
    envKey: str(r.env_key),
    inputManifestHash: strOrNull(r.input_manifest_hash),
    promptHash: strOrNull(r.prompt_hash),
    reportHash: strOrNull(r.report_hash),
    outputHash: strOrNull(r.output_hash),
    stopReason: strOrNull(r.stop_reason),
    model: str(r.model),
    effort: str(r.effort),
    templateVersionId: strOrNull(r.template_version_id),
    ruleIds: json(r.rule_ids, []),
    foundationIds: json(r.foundation_ids, []),
    usage: json(r.usage, null),
    error: strOrNull(r.error),
    startedSeq: Number(r.started_seq),
    endedSeq: r.ended_seq == null ? null : Number(r.ended_seq),
    startedAt: str(r.started_at),
    endedAt: strOrNull(r.ended_at),
  };
}

function toVersion(r: Row): OutputVersion {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    familyId: str(r.family_id),
    phase: str(r.phase) as Phase,
    loop: Number(r.loop),
    version: Number(r.version),
    contentHash: str(r.content_hash),
    ...(r.run_id != null ? { runId: str(r.run_id) } : {}),
    ...(r.snapshot_id != null ? { snapshotId: str(r.snapshot_id) } : {}),
  };
}

function toBlock(r: Row): HypothesisBlock {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    label: str(r.label),
    statement: str(r.statement),
    vars: json(r.vars, []),
    status: str(r.status) as HypothesisStatus,
    confidence: Number(r.confidence),
    ...(r.parent_id != null ? { parentId: str(r.parent_id) } : {}),
    ...(r.note != null ? { note: str(r.note) } : {}),
  };
}

function toFoundation(r: Row): FoundationRow {
  return { id: str(r.id), slot: str(r.slot) as FoundationSlot, version: str(r.version), contentHash: str(r.content_hash), changelog: json(r.changelog, null), parentId: strOrNull(r.parent_id), createdAt: str(r.created_at) };
}

function toProposal(r: Row, diff: unknown): ProposalRow {
  return {
    id: str(r.id),
    targetKind: str(r.target_kind) as ProposalTarget,
    targetId: strOrNull(r.target_id),
    baseVersion: strOrNull(r.base_version),
    diff,
    diffHash: str(r.diff_hash),
    rationale: str(r.rationale),
    evidence: json(r.evidence, []),
    status: str(r.status) as ProposalStatus,
    resolvedVersionId: strOrNull(r.resolved_version_id),
    createdAt: str(r.created_at),
    resolvedAt: strOrNull(r.resolved_at),
  };
}

function toRule(r: Row): CraftRuleRow {
  return { id: str(r.id), lineageId: str(r.lineage_id), phase: str(r.phase) as Phase, version: Number(r.version), body: str(r.body), status: str(r.status) as CraftRuleRow["status"], proposalId: strOrNull(r.proposal_id), createdAt: str(r.created_at) };
}
