import { create } from "zustand";
import {
  PHASES,
  PHASE_INFO,
  emptyGraph,
  hashOf,
  nextPhase,
  phaseIndex,
  ulid,
  type ClaudeNode,
  type Graph,
  type GraphNode,
  type Hash,
  type HypothesisBlock,
  type Id,
  type OutputNode,
  type OutputVersion,
  type Phase,
  type SourceContent,
  type SourceNode,
  type TextArtifact,
  type Weight,
  WEIGHTS,
} from "@composer/core";
import {
  AbortError,
  allStatuses,
  buildPrompt,
  connect as connectNodes,
  disconnect as disconnectEdge,
  emptyEnv,
  envKeyFor,
  incoming,
  localKey,
  planPull,
  removeNode,
  RunError,
  runClaudeNode,
  Scheduler,
  updateNode as patchNode,
  addNode,
  type AssembledPrompt,
  type KeyEnv,
  type NodeStatus,
  type ProjectMemory,
  type RunDeps,
} from "@composer/engine";
import type { ProjectRow, Repo, RunRow, SnapshotRow } from "@composer/data";
import type { Booted } from "../app/boot";
import { newClaude, newSource, nextSourcePosition, phaseHasNodes, primaryClaude, scaffoldPhase } from "../app/scaffold";
import type { Ingested } from "../app/ingest";
import { AnthropicLlm } from "../llm/anthropic";
import { demoLlm } from "../llm/demo";
import type { LlmClient } from "@composer/engine";
import { getSecret, SECRET } from "../platform/secrets";

export interface LiveRun {
  runId: Id;
  status: "running" | "failed" | "cancelled";
  text: string;
  thinking: string;
  startedAt: number;
  error?: string;
  code?: string;
}

export interface Toast {
  id: string;
  text: string;
  tone: "info" | "error" | "success";
}

interface ProjectState {
  ready: boolean;
  repo?: Repo;
  project?: ProjectRow;
  graph: Graph;
  /** Content-addressed blobs the engine reads synchronously (source content, artifacts, versions). */
  blobs: Map<Hash, unknown>;
  versions: Record<Id, OutputVersion>;
  hypotheses: Record<Id, HypothesisBlock>;
  snapshots: SnapshotRow[];
  bookmarks: { snapshotId: Id; label: string; seq: number }[];
  lastRuns: Record<Id, RunRow>;
  live: Record<Id, LiveRun>;
  selection: Id | null;
  activePhase: Phase;
  loop: number;
  env: KeyEnv;
  toasts: Toast[];
  /** Node id that should shake (a bounced wire). */
  shake: { id: Id; at: number } | null;
}

export const useProject = create<ProjectState>(() => ({
  ready: false,
  graph: emptyGraph(),
  blobs: new Map(),
  versions: {},
  hypotheses: {},
  snapshots: [],
  bookmarks: [],
  lastRuns: {},
  live: {},
  selection: null,
  activePhase: "understand",
  loop: 1,
  env: emptyEnv,
  toasts: [],
  shake: null,
}));

const get = useProject.getState;
const set = useProject.setState;

const llm: LlmClient =
  import.meta.env.DEV && new URLSearchParams(location.search).has("fake") ? demoLlm() : new AnthropicLlm(() => getSecret(SECRET.anthropic));

// ── persistence ────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { repo, project, graph } = get();
    if (repo && project) repo.saveWorking(project.id, graph).catch((e) => toast(`Couldn't save: ${String(e)}`, "error"));
  }, 500);
}

function setGraph(graph: Graph) {
  set({ graph });
  scheduleSave();
}

export function toast(text: string, tone: Toast["tone"] = "info") {
  const id = ulid();
  set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 6000 : 3500);
}

async function refreshHistory() {
  const { repo, project } = get();
  if (!repo || !project) return;
  const [snapshots, bookmarks] = await Promise.all([repo.listSnapshots(project.id), repo.listBookmarks(project.id)]);
  set({ snapshots, bookmarks });
}

async function takeSnapshot(kind: "run" | "lock" | "swap" | "manual", causeId?: Id, label?: string): Promise<SnapshotRow | undefined> {
  const { repo, project, graph, activePhase } = get();
  if (!repo || !project) return;
  clearTimeout(saveTimer);
  const snap = await repo.snapshot({ projectId: project.id, graph, kind, phase: activePhase, ...(causeId ? { causeId } : {}), ...(label ? { label } : {}) });
  await refreshHistory();
  return snap;
}

// ── boot ───────────────────────────────────────────────────────────────────

export async function loadProject(booted: Booted) {
  const { repo, project } = booted;
  let graph = (await repo.loadWorking(project.id)) ?? emptyGraph();
  const [versions, hypotheses, runs] = await Promise.all([repo.listVersions(project.id), repo.listHypotheses(project.id), repo.runsForProject(project.id)]);
  const lastRuns: Record<Id, RunRow> = {};
  for (const r of runs) if (r.status !== "running") lastRuns[r.nodeId] = r;
  const hashes = [
    ...Object.values(graph.nodes).flatMap((n) => (n.kind === "source" && n.contentHash ? [n.contentHash] : [])),
    ...Object.values(graph.outputs).map((o) => o.hash),
    ...versions.map((v) => v.contentHash),
    ...runs.flatMap((r) => (r.reportHash ? [r.reportHash] : [])),
  ];
  const blobs = await repo.getBlobs(hashes);
  if (!phaseHasNodes(graph, "understand", project.loop)) {
    graph = scaffoldPhase(graph, "understand", project.loop);
    await repo.saveWorking(project.id, graph);
  }
  set({
    ready: true,
    repo,
    project,
    graph,
    blobs,
    versions: Object.fromEntries(versions.map((v) => [v.id, v])),
    hypotheses: Object.fromEntries(hypotheses.map((h) => [h.id, h])),
    lastRuns,
    activePhase: project.activePhase,
    loop: project.loop,
  });
  await refreshHistory();
  if (booted.interrupted) toast(`${booted.interrupted} run${booted.interrupted === 1 ? " was" : "s were"} interrupted when Composer last closed.`);
}

// ── selectors ──────────────────────────────────────────────────────────────

let statusCache: { graph: Graph; env: KeyEnv; value: Record<Id, NodeStatus> } | undefined;
export function statusesOf(graph: Graph, env: KeyEnv): Record<Id, NodeStatus> {
  if (statusCache?.graph !== graph || statusCache.env !== env) statusCache = { graph, env, value: allStatuses(graph, env) };
  return statusCache.value;
}

export function latestVersionOf(familyId: Id): OutputVersion | undefined {
  return Object.values(get().versions)
    .filter((v) => v.familyId === familyId)
    .sort((a, b) => b.version - a.version)[0];
}

/** Locked outputs of phases before the inlet, plus the hypothesis chain. */
function memoryFor(phase: Phase, loop: number): ProjectMemory {
  const { versions, blobs, hypotheses } = get();
  const latest = new Map<string, OutputVersion>();
  for (const v of Object.values(versions)) {
    const before = v.loop < loop || phaseIndex(v.phase) < phaseIndex(phase) - 1;
    if (!before) continue;
    const key = `${v.loop}:${v.phase}`;
    if (!latest.has(key) || latest.get(key)!.version < v.version) latest.set(key, v);
  }
  return {
    outputs: [...latest.values()]
      .sort((a, b) => a.loop - b.loop || phaseIndex(a.phase) - phaseIndex(b.phase))
      .map((v) => ({ phase: v.phase, label: PHASE_INFO[v.phase].output, version: v.version, text: (blobs.get(v.contentHash) as TextArtifact | undefined)?.text ?? "" })),
    chain: Object.values(hypotheses).map((h) => ({ label: h.label, statement: h.statement, status: h.status, ...(h.note ? { result: h.note } : {}) })),
  };
}

export function runDeps(phase: Phase): RunDeps {
  const s = get();
  return {
    llm,
    readBlob: (h) => s.blobs.get(h),
    env: s.env,
    foundations: {},
    rules: [],
    memory: memoryFor(phase, s.loop),
    block: (id) => s.hypotheses[id],
    version: (id) => {
      const v = s.versions[id];
      const content = v ? (s.blobs.get(v.contentHash) as TextArtifact | undefined) : undefined;
      return v && content ? { content, label: `${PHASE_INFO[v.phase].name} v${v.version}` } : undefined;
    },
  };
}

/** The prompt a Claude node would send right now, for the inspector. */
export function previewPrompt(graph: Graph, nodeId: Id): AssembledPrompt | undefined {
  const node = graph.nodes[nodeId];
  if (node?.kind !== "claude") return;
  try {
    return buildPrompt(graph, nodeId, runDeps(node.phase));
  } catch {
    return undefined;
  }
}

// ── graph edits ────────────────────────────────────────────────────────────

export const actions = {
  select(id: Id | null) {
    set({ selection: id });
  },

  async setActivePhase(phase: Phase) {
    set({ activePhase: phase, selection: null });
    const { repo, project } = get();
    if (repo && project) await repo.updateProject(project.id, { activePhase: phase });
  },

  async renameProject(name: string) {
    const { repo, project } = get();
    if (!repo || !project || !name.trim()) return;
    await repo.updateProject(project.id, { name: name.trim() });
    set({ project: { ...project, name: name.trim() } });
  },

  /** Adds a source to the phase in focus and wires it into the phase's Claude node. */
  async addSource(ing: Ingested, position?: { x: number; y: number }) {
    const { repo, graph, activePhase, loop } = get();
    if (!repo) return;
    const hash = await repo.putBlob(ing.content, "context");
    set((s) => ({ blobs: new Map(s.blobs).set(hash, ing.content) }));
    const node = { ...newSource(graph, activePhase, loop, ing.platform, ing.title, hash, position ?? nextSourcePosition(graph, activePhase, loop)), config: ing.config ?? {} };
    let g = addNode<SourceNode>(graph, node);
    const target = primaryClaude(g, activePhase, loop);
    if (target) {
      const r = connectNodes(g, node.id, target.id, ulid);
      if (r.ok) g = r.graph;
    }
    setGraph(g);
    set({ selection: node.id });
  },

  /**
   * Fetches a connector source again. New content gets a new hash, so everything downstream goes
   * stale; unchanged content leaves the graph untouched.
   */
  async sync(id: Id) {
    const { repo, graph } = get();
    const node = graph.nodes[id];
    if (!repo || node?.kind !== "source") return;
    const { connectorFor, runConnector } = await import("../connectors");
    const { ingestUrl } = await import("../app/ingest");
    try {
      const connector = connectorFor(node.platform);
      const fresh = connector ? await runConnector(connector, node.config) : node.config.url ? await ingestUrl(node.config.url) : undefined;
      if (!fresh) return toast("This source has nothing to sync from.");
      const prev = node.contentHash ? (get().blobs.get(node.contentHash) as SourceContent | undefined) : undefined;
      const same = prev && hashOf({ ...prev, syncedAt: null }) === hashOf({ ...fresh.content, syncedAt: null });
      if (same) return toast(`${node.title} is up to date`);
      const hash = await repo.putBlob(fresh.content, "context");
      set((s) => ({ blobs: new Map(s.blobs).set(hash, fresh.content) }));
      setGraph(patchNode<SourceNode>(get().graph, id, { contentHash: hash }));
      toast(`${node.title} synced · downstream is stale`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  },

  /** A Claude step for the phase in focus, using the phase's recipe. */
  addClaude() {
    const { graph, activePhase, loop } = get();
    const recipeId = activePhase === "define" ? "draft_statement" : "synthesize_insights";
    const count = Object.values(graph.nodes).filter((n) => n.kind === "claude" && n.phase === activePhase && n.loop === loop).length;
    const node = newClaude(graph, activePhase, loop, recipeId, { x: 600, y: 248 + count * 220 });
    setGraph(addNode<ClaudeNode>(graph, node));
    set({ selection: node.id });
  },

  /** A new hypothesis block in the memory chain, as a node in the phase in focus. */
  async addHypothesis(statement = "We believe [who] will [behavior] if [because]. We will know when [metric].", vars: { key: string; value: string }[] = []) {
    const { repo, project, graph, activePhase, loop, hypotheses } = get();
    if (!repo || !project) return;
    const label = `H${Object.keys(hypotheses).length + 1}`;
    const block = await repo.createHypothesis({ projectId: project.id, label, statement, vars, status: "draft", confidence: 0.5 });
    set((s) => ({ hypotheses: { ...s.hypotheses, [block.id]: block } }));
    const id = ulid();
    const g = addNode(graph, { id, kind: "hypothesis", phase: activePhase, loop, title: "Hypothesis", alias: label, position: { x: 72, y: 560 }, lineageId: id, blockId: block.id } as Omit<GraphNode, "createdSeq">);
    let g2 = g;
    const target = primaryClaude(g, activePhase, loop);
    if (target) {
      const r = connectNodes(g, id, target.id, ulid);
      if (r.ok) g2 = r.graph;
    }
    setGraph(g2);
    set({ selection: id });
    return block;
  },

  async updateHypothesis(blockId: Id, patch: Partial<Pick<HypothesisBlock, "statement" | "vars" | "status" | "confidence">>) {
    const { repo, hypotheses } = get();
    const b = hypotheses[blockId];
    if (!repo || !b) return;
    // Blocks are immutable once tested; a draft can be edited in place.
    if (b.status !== "draft") {
      toast("Tested hypotheses can't be edited. Swap a variable to fork it instead.", "error");
      return;
    }
    const next = { ...b, ...patch };
    await repo.db.run("UPDATE hypothesis_block SET statement = ?, vars = ?, confidence = ? WHERE id = ?", [next.statement, JSON.stringify(next.vars), next.confidence, blockId]);
    set((s) => ({ hypotheses: { ...s.hypotheses, [blockId]: next } }));
  },

  /** Wires two nodes; on a mismatch the target shakes and the reason shows. */
  connect(from: Id, to: Id, toPort?: string): boolean {
    const r = connectNodes(get().graph, from, to, ulid, toPort);
    if (!r.ok) {
      set({ shake: { id: to, at: Date.now() } });
      toast(r.reason, "error");
      return false;
    }
    setGraph(r.graph);
    return true;
  },

  disconnect(edgeId: Id) {
    setGraph(disconnectEdge(get().graph, edgeId));
  },

  remove(ids: Id[]) {
    let g = get().graph;
    for (const id of ids) {
      const n = g.nodes[id];
      if (n?.kind === "output" && n.mode === "inlet") {
        toast("Inlets carry the previous phase's locked output and can't be deleted.", "error");
        continue;
      }
      g = removeNode(g, id);
    }
    setGraph(g);
    if (ids.includes(get().selection ?? "")) set({ selection: null });
  },

  move(id: Id, position: { x: number; y: number }) {
    setGraph(patchNode(get().graph, id, { position }));
  },

  update<T extends GraphNode>(id: Id, patch: Partial<T>) {
    setGraph(patchNode<T>(get().graph, id, patch));
  },

  setWeight(id: Id, weight: Weight) {
    setGraph(patchNode(get().graph, id, { weight }));
  },

  /** W cycles Mute → Light → Normal → Heavy. */
  cycleWeight(id: Id) {
    const n = get().graph.nodes[id];
    if (!n || (n.kind !== "source" && !(n.kind === "output" && n.mode === "inlet"))) return;
    const w = (n.weight ?? "normal") as Weight;
    actions.setWeight(id, WEIGHTS[(WEIGHTS.indexOf(w) + 1) % WEIGHTS.length]!);
  },

  togglePin(id: Id) {
    const n = get().graph.nodes[id];
    if (n?.kind === "source" || (n?.kind === "output" && n.mode === "inlet")) setGraph(patchNode(get().graph, id, { pinned: !n.pinned }));
  },

  /** The inspector chip toggle: include or exclude one wired input. */
  toggleInput(claudeId: Id, inputId: Id) {
    const n = get().graph.nodes[claudeId];
    if (n?.kind !== "claude") return;
    const disabled = n.disabledInputs.includes(inputId) ? n.disabledInputs.filter((x) => x !== inputId) : [...n.disabledInputs, inputId];
    setGraph(patchNode<ClaudeNode>(get().graph, claudeId, { disabledInputs: disabled }));
  },

  async snapshot(label?: string) {
    const snap = await takeSnapshot("manual", undefined, label);
    if (snap && label && get().repo) {
      await get().repo!.bookmark(snap.id, label);
      await refreshHistory();
    }
    toast(label ? `Bookmarked “${label}”` : `Snapshot ${snap?.seq ?? ""} saved`, "success");
  },

  // ── runs ─────────────────────────────────────────────────────────────────

  run(id: Id) {
    const { graph, env } = get();
    const node = graph.nodes[id];
    if (node?.kind !== "claude") return;
    const plan = planPull(graph, id, statusesOf(graph, env));
    scheduler.execute(plan);
  },

  cancel(id: Id) {
    scheduler.cancel(id);
  },

  // ── locking ──────────────────────────────────────────────────────────────

  /**
   * Locks an Output node: a new immutable version, a snapshot, and the next phase's inlet now
   * points at it (scaffolding that phase the first time).
   */
  async lock(outputId: Id) {
    const { repo, project, graph, loop } = get();
    const node = graph.nodes[outputId] as OutputNode | undefined;
    if (!repo || !project || node?.kind !== "output" || node.mode !== "output") return;
    const edge = incoming(graph, outputId)[0];
    const out = edge ? graph.outputs[edge.from] : undefined;
    const artifact = out ? (get().blobs.get(out.hash) as TextArtifact | undefined) : undefined;
    if (!out || !artifact) {
      toast("Run the Claude node first; there's nothing to lock yet.", "error");
      return;
    }
    const latest = latestVersionOf(node.familyId);
    if (latest?.contentHash === hashOf(artifact)) {
      toast(`v${latest.version} is already locked.`);
      return;
    }
    const version = await repo.lockOutput({ projectId: project.id, familyId: node.familyId, phase: node.phase, loop: node.loop, content: artifact, runId: out.runId });
    set((s) => ({ versions: { ...s.versions, [version.id]: version }, blobs: new Map(s.blobs).set(version.contentHash, artifact) }));

    const next = nextPhase(node.phase);
    let g = get().graph;
    if (next) {
      const inlets = Object.values(g.nodes).filter((n): n is OutputNode => n.kind === "output" && n.mode === "inlet" && n.familyId === node.familyId);
      if (inlets.length) for (const inlet of inlets) g = patchNode<OutputNode>(g, inlet.id, { versionId: version.id });
      else if (!phaseHasNodes(g, next, loop)) g = scaffoldPhase(g, next, loop, { familyId: node.familyId, versionId: version.id, phase: node.phase });
      set({ graph: g });
    }
    const snap = await takeSnapshot("lock", version.id, `${PHASE_INFO[node.phase].output} v${version.version} locked`);
    if (snap) await repo.setVersionSnapshot(version.id, snap.id);
    const advance = next && phaseHasNodes(get().graph, next, loop);
    toast(`${PHASE_INFO[node.phase].output} v${version.version} locked${advance ? ` · now in ${PHASE_INFO[next].name}` : ""}`, "success");
    if (advance) await actions.setActivePhase(next);
  },

  /**
   * Lock from the statement card. A hypothesis-frame statement also enters the memory chain as a
   * tested block, so later phases can hold work against it and swap its variables.
   */
  async lockStatement(outputId: Id) {
    const { graph, blobs } = get();
    const edge = incoming(graph, outputId)[0];
    const out = edge ? graph.outputs[edge.from] : undefined;
    const artifact = out ? (blobs.get(out.hash) as TextArtifact | undefined) : undefined;
    await actions.lock(outputId);
    const data = artifact?.data as { frame?: string; statement?: string; parts?: Record<string, string> } | undefined;
    if (data?.frame === "hypothesis" && data.statement && get().repo && get().project) {
      const { repo, project, hypotheses } = get();
      const label = `H${Object.keys(hypotheses).length + 1}`;
      const vars = (["who", "behavior", "because", "metric"] as const)
        .filter((k) => data.parts?.[k])
        .map((k) => ({ key: k === "who" ? "audience" : k === "metric" ? "signal" : k, value: data.parts![k]! }));
      const block = await repo!.createHypothesis({ projectId: project!.id, label, statement: data.statement, vars, status: "testing", confidence: 0.5 });
      set((s) => ({ hypotheses: { ...s.hypotheses, [block.id]: block } }));
      toast(`${label} entered the memory chain`, "success");
    }
  },
};



// ── execution ──────────────────────────────────────────────────────────────

const buffers = new Map<Id, { text: string; thinking: string }>();
let flushScheduled = false;
function flushSoon() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    set((s) => {
      const live = { ...s.live };
      for (const [id, b] of buffers) if (live[id]) live[id] = { ...live[id]!, text: b.text, thinking: b.thinking };
      return { live };
    });
  });
}

async function runOne(id: Id, signal: AbortSignal): Promise<void> {
  const { repo, project, graph, env } = get();
  const node = graph.nodes[id] as ClaudeNode | undefined;
  if (!repo || !project || node?.kind !== "claude") return;
  const runId = ulid();
  const startGraph = graph;
  buffers.set(id, { text: "", thinking: "" });
  set((s) => ({ live: { ...s.live, [id]: { runId, status: "running", text: "", thinking: "", startedAt: Date.now() } } }));
  await repo.startRun({
    id: runId,
    projectId: project.id,
    nodeId: id,
    recipe: node.recipe,
    localKey: localKey(startGraph, id),
    envKey: envKeyFor(env, node.phase),
    inputManifestHash: null,
    model: node.model,
    effort: node.effort,
    templateVersionId: node.templateVersionId,
    ruleIds: [],
    foundationIds: env.foundations,
    startedSeq: (get().project?.seq ?? 0) + 1,
  });
  try {
    const outcome = await runClaudeNode(startGraph, id, runId, runDeps(node.phase), {
      signal,
      onText: (d) => {
        buffers.get(id)!.text += d;
        flushSoon();
      },
      onThinking: (d) => {
        buffers.get(id)!.thinking += d;
        flushSoon();
      },
    });
    const reportHash = hashOf(outcome.prompt.report);
    await repo.finishRun(
      runId,
      {
        status: "succeeded",
        outputHash: outcome.artifactHash,
        promptHash: outcome.promptHash,
        reportHash,
        stopReason: outcome.result.stopReason,
        usage: { ...outcome.result.usage },
      },
      [
        { hash: outcome.artifactHash, value: outcome.artifact, kind: "artifact" },
        { hash: reportHash, value: outcome.prompt.report, kind: "report" },
        { hash: outcome.promptHash, value: { system: outcome.prompt.system, messages: outcome.prompt.messages }, kind: "prompt" },
      ],
    );
    const g = get().graph;
    set((s) => {
      const { [id]: _done, ...live } = s.live;
      return {
        graph: { ...g, outputs: { ...g.outputs, [id]: outcome.output } },
        blobs: new Map(s.blobs).set(outcome.artifactHash, outcome.artifact).set(reportHash, outcome.prompt.report),
        live,
      };
    });
    const run = await repo.getRun(runId);
    if (run) set((s) => ({ lastRuns: { ...s.lastRuns, [id]: run } }));
    await takeSnapshot("run", runId);
  } catch (e) {
    const cancelled = e instanceof AbortError || signal.aborted;
    const message = e instanceof Error ? e.message : String(e);
    await repo.finishRun(runId, { status: cancelled ? "cancelled" : "failed", error: message });
    set((s) => ({
      live: {
        ...s.live,
        [id]: { ...s.live[id]!, status: cancelled ? "cancelled" : "failed", error: cancelled ? "Cancelled" : message, ...(e instanceof RunError ? { code: e.code } : {}) },
      },
    }));
    if (!cancelled) {
      toast(message, "error");
      throw e;
    }
  } finally {
    buffers.delete(id);
  }
}

const scheduler = new Scheduler(runOne, 3);

export function phasesWithOutputs(): Set<Phase> {
  const { versions, loop } = get();
  return new Set(Object.values(versions).filter((v) => v.loop === loop).map((v) => v.phase));
}

export { PHASES };
