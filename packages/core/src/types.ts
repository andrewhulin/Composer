import type { Hash } from "./canonical";
import type { Id } from "./ids";
import type { Phase } from "./phases";

/** The four port types from Figma 02 · Nodes. */
export type PortType = "context" | "phase_output" | "hypothesis" | "text";

/** How much the next prompt listens to a context node. */
export type Weight = "mute" | "light" | "normal" | "heavy";
export const WEIGHTS: readonly Weight[] = ["mute", "light", "normal", "heavy"];

export type NodeKind = "source" | "claude" | "hypothesis" | "output";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type SourcePlatform =
  | "file"
  | "image"
  | "link"
  | "paste"
  | "transcript"
  | "linear"
  | "figma"
  | "arena"
  | "pinterest"
  | "mobbin"
  | "60fps"
  | "request"
  | "data"
  | "slack"
  | "statsig"
  | "findings"
  | "video";

export type RecipeId =
  | "synthesize_insights"
  | "draft_statement"
  | "prototype"
  | "test_strategy"
  | "verdict"
  | "release_story"
  | "pr_description";

/** The weigh controls every context-carrying node has (sources and inlets). */
export interface Weighing {
  weight: Weight;
  /** Pinned items ride into every phase of the loop. */
  pinned: boolean;
  /** The designer's note on why this weight, e.g. "The brief we ship against." */
  why?: string;
}

interface NodeBase {
  id: Id;
  kind: NodeKind;
  phase: Phase;
  loop: number;
  title: string;
  /** Name used in instruction templates, e.g. `interviews` for `{interviews}`. */
  alias: string;
  position: { x: number; y: number };
  /** Per-project creation order; playback rebuilds nodes in this order. */
  createdSeq: number;
  /** Stable across loops when a source is carried forward. */
  lineageId: Id;
}

export interface SourceNode extends NodeBase, Weighing {
  kind: "source";
  platform: SourcePlatform;
  /** Blob of `SourceContent`, or null before the first sync. */
  contentHash: Hash | null;
  /** Connector settings: URL, board, ticket id, file path… */
  config: Record<string, string>;
}

export interface ClaudeNode extends NodeBase {
  kind: "claude";
  recipe: RecipeId;
  templateVersionId: Id;
  instruction: string;
  model: string;
  effort: Effort;
  /** Context budget in tokens (default 200k, as drawn in Figma). */
  budget: number;
  /** Wired inputs switched off with the inspector chip toggle. */
  disabledInputs: Id[];
  /** Recipe options, e.g. `{ frame: "problem_statement" }` or `{ fidelity: "wireframe" }`. */
  options: Record<string, string>;
  /** Feedback pinned to a spot on this node's output. Present notes ride into the next run. */
  notes?: OutputNote[];
  /** True when the designer chose the model by hand; otherwise the router picks it per recipe. */
  modelPinned?: boolean;
  /** The tier a low score or a wrong mark moved this node to, for its next runs. */
  escalation?: { model: string; reason: string };
}

/** Where on an output a note is pinned. */
export type NoteAnchor =
  | { kind: "point"; x: number; y: number; screen?: string | null; element?: string }
  | { kind: "field"; field: string; quote?: string };

/** Feedback pinned to one run's output: the designer's words on a specific spot. */
export interface OutputNote {
  id: Id;
  /** The run whose output the note was written against. */
  runId: Id;
  anchor: NoteAnchor;
  text: string;
  createdAt: string;
}

export interface HypothesisNode extends NodeBase {
  kind: "hypothesis";
  blockId: Id;
}

export interface OutputNode extends NodeBase, Partial<Weighing> {
  kind: "output";
  /** `output` ships this phase's artifact; `inlet` brings a locked version into the next phase. */
  mode: "output" | "inlet";
  familyId: Id;
  /** For inlets: the exact locked version consumed. */
  versionId?: Id;
  /** Writing workspaces: the designer's working draft of the key output, before it is locked. */
  draft?: Record<string, string>;
  /** Writing workspaces: ids of evidence the draft cites. */
  cites?: string[];
}

export type GraphNode = SourceNode | ClaudeNode | HypothesisNode | OutputNode;

export interface Edge {
  id: Id;
  from: Id;
  fromPort: string;
  to: Id;
  toPort: string;
  createdSeq: number;
}

/** The latest successful result of a node that runs (Claude nodes). */
export interface NodeOutput {
  runId: Id;
  hash: Hash;
  /** inputKey without the environment part. */
  localKey: Hash;
  envKey: Hash;
}

/** One atomic, never-split piece of a context item: an utterance, a comment, a paragraph. */
export interface Unit {
  text: string;
  /** e.g. "P07 · 14:22" for a transcript line. */
  label?: string;
  starred?: boolean;
}

export type ItemKind =
  | "quote"
  | "pin"
  | "ticket"
  | "screen"
  | "request"
  | "data"
  | "transcript"
  | "link"
  | "file"
  | "image"
  | "note";

export interface ContextItem {
  id: Id;
  kind: ItemKind;
  title: string;
  units: Unit[];
  url?: string;
  /** Asset hash of a thumbnail or the image itself. */
  media?: { asset: Hash; mime: string; width?: number; height?: number };
  /** A thumbnail to show on the node: a data: URL for local images, or a remote https: URL. */
  image?: string;
  author?: string;
  at?: string;
}

/** What a source node produces: frozen at sync time so it is a stable input. */
export interface SourceContent {
  v: 1;
  kind: "context";
  items: ContextItem[];
  syncedAt?: string;
  remoteVersion?: string;
}

/** What a Claude node produces. */
export interface TextArtifact {
  v: 1;
  kind: "text";
  /** Artifact contract, e.g. "weighted_context", "testable_statement". */
  artifact: string;
  text: string;
  data?: unknown;
  /** True when the designer edited this artifact by hand (a handoff edit or a direct tweak). */
  edited?: boolean;
}

export type HypothesisStatus = "draft" | "testing" | "held" | "failed" | "retired";

export interface HypothesisBlock {
  id: Id;
  projectId: Id;
  /** Chain label, e.g. "H2". */
  label: string;
  statement: string;
  vars: { key: string; value: string }[];
  status: HypothesisStatus;
  confidence: number;
  parentId?: Id;
  note?: string;
}

/** A locked phase output. Versions are immutable; locking again makes a new version. */
export interface OutputVersion {
  id: Id;
  projectId: Id;
  familyId: Id;
  phase: Phase;
  loop: number;
  version: number;
  contentHash: Hash;
  runId?: Id;
  snapshotId?: Id;
}
