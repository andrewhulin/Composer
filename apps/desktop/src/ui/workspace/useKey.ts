import { useMemo } from "react";
import { PHASE_INFO, nextPhase, type ClaudeNode, type Graph, type Id, type OutputNode, type OutputVersion, type Phase, type TextArtifact } from "@composer/core";
import { docBlock, handoffDoc, handoffTarget, incoming, toHandoff, type AssembledPrompt, type DefineDraft, type Handoff, type VerdictData } from "@composer/engine";
import { previewPrompt, useProject } from "../../store/project";
import { keySource } from "../../app/scaffold";

export type KeyStatus = "empty" | "draft" | "locked" | "newer";

export interface KeyState {
  output: OutputNode;
  source?: ClaudeNode;
  /** The artifact feeding the key node right now. */
  artifact?: TextArtifact;
  latest?: OutputVersion;
  handoff: Handoff;
  status: KeyStatus;
  /** Where the handoff goes once locked, e.g. "Goes to Build". */
  target: string;
  /** The handoff as the next phase's prompt reads it: from the live prompt when the next phase already points here. */
  doc: string;
  /** True when `doc` came from the next node's assembled prompt, so trimming shows too. */
  live: boolean;
  /** A hand edit of the handoff, waiting to ship with the next lock. */
  handEdit?: string;
}

/** The text of a prompt's user turn. */
export function userText(p: AssembledPrompt | undefined): string {
  const c = p?.messages[0]?.content;
  if (!c) return "";
  return typeof c === "string" ? c : c.map((b) => ("text" in b ? b.text : "")).join("\n");
}

/** The phase's key node: the one Output in output mode. */
export function keyOutput(graph: Graph, phase: Phase, loop: number): OutputNode | undefined {
  return Object.values(graph.nodes).find((n): n is OutputNode => n.kind === "output" && n.mode === "output" && n.phase === phase && n.loop === loop);
}

/** The inlet in the next phase that reads this key node, and the Claude node it feeds. */
function consumerOf(graph: Graph, out: OutputNode): { inlet: OutputNode; claude?: ClaudeNode } | undefined {
  const inlet = Object.values(graph.nodes).find((n): n is OutputNode => n.kind === "output" && n.mode === "inlet" && n.familyId === out.familyId);
  if (!inlet) return;
  const to = graph.edges.find((e) => e.from === inlet.id)?.to;
  const claude = to ? graph.nodes[to] : undefined;
  return { inlet, ...(claude?.kind === "claude" ? { claude } : {}) };
}

/** Everything the key node dock and the workspaces show about a phase's single output. */
export function useKey(phase: Phase): KeyState | undefined {
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const blobs = useProject((s) => s.blobs);
  const versions = useProject((s) => s.versions);
  return useMemo(() => {
    const output = keyOutput(graph, phase, loop);
    if (!output) return undefined;
    const source = keySource(graph, output.id);
    const out = source ? graph.outputs[source.id] : undefined;
    const artifact = out ? (blobs.get(out.hash) as TextArtifact | undefined) : undefined;
    const latest = Object.values(versions)
      .filter((v) => v.familyId === output.familyId)
      .sort((a, b) => b.version - a.version)[0];
    const locked = latest ? (blobs.get(latest.contentHash) as TextArtifact | undefined) : undefined;
    const draft = phase === "define" ? (output.draft as Partial<DefineDraft> | undefined) : undefined;
    const base = toHandoff(phase, artifact ?? locked, draft);
    const handEdit = output.draft?.text;
    const handoff: Handoff = handEdit ? { ...base, text: handEdit } : base;
    const status: KeyStatus = !latest ? (artifact || (draft && Object.keys(draft).length) ? "draft" : "empty") : locked && locked.text === handoff.text ? "locked" : "newer";
    const verdict = phase === "validate" ? (((locked ?? artifact)?.data as VerdictData | undefined)?.verdict) : undefined;
    const target = handoffTarget(phase, verdict);
    const consumer = consumerOf(graph, output);
    let doc = "";
    let live = false;
    if (consumer?.claude && latest && consumer.inlet.versionId === latest.id && status === "locked") {
      const block = docBlock(userText(previewPrompt(graph, consumer.claude.id)), consumer.inlet.alias);
      if (block) {
        doc = block;
        live = true;
      }
    }
    if (!doc) doc = handoffDoc(phase, handoff.text, latest && status === "locked" ? `${PHASE_INFO[phase].name.toLowerCase()} v${latest.version}` : `${PHASE_INFO[phase].name.toLowerCase()} draft`);
    return { output, ...(source ? { source } : {}), ...(artifact ? { artifact } : {}), ...(latest ? { latest } : {}), handoff, status, target, doc, live, ...(handEdit ? { handEdit } : {}) };
  }, [graph, loop, blobs, versions, phase]);
}

/** The Claude node feeding a key node, if it is one. */
export function feedOf(graph: Graph, outputId: Id): ClaudeNode | undefined {
  const e = incoming(graph, outputId)[0];
  const n = e ? graph.nodes[e.from] : undefined;
  return n?.kind === "claude" ? n : undefined;
}

export const nextName = (phase: Phase) => {
  const n = nextPhase(phase);
  return n ? PHASE_INFO[n].name : "outside Composer";
};
