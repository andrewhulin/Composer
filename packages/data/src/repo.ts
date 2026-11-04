import {
  canonicalJson,
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

  async listProjects(): Promise<ProjectRow[]> {
    return (await this.db.all("SELECT * FROM project ORDER BY updated_at DESC")).map(toProject);
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
  };
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
