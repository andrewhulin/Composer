import { useMemo } from "react";
import { PHASE_INFO, type Graph, type ClaudeNode, type GraphNode, type HypothesisNode, type Id, type OutputNode, type SourceContent, type SourceNode, type TextArtifact } from "@composer/core";
import { incoming, templateRefs, type AssembledPrompt, type Frame, type InsightsData, type StatementData } from "@composer/engine";
import { actions, latestVersionOf, previewPrompt, useProject } from "../../store/project";
import { useUi, type InspectorTab } from "../../store/ui";
import { useDisplayGraph, usePlaybackActive } from "../../store/display";
import { useDebounced } from "../../hooks/useDebounced";
import { ago, useNow } from "../../hooks/useNow";
import { Dot } from "../primitives/Dot";
import { cx } from "../primitives/cx";
import { formatTokens } from "../primitives/format";
import { ContextChip, type Chip } from "./ContextChip";
import { InstructionEditor } from "./InstructionEditor";
import { InsightsCard } from "./InsightsCard";
import { StatementCard } from "./StatementCard";
import { NodeTab } from "./NodeTab";
import { PromptTab } from "./PromptTab";
import { countKey, partialField } from "./partial";
import styles from "./Inspector.module.css";

const TABS: { id: InspectorTab; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "prompt", label: "Prompt" },
  { id: "node", label: "Node" },
];

/** The artifact a node shows: a Claude node's latest output, or an Output node's draft or lock. */
function artifactFor(node: GraphNode | undefined, s: ReturnType<typeof useProject.getState>, graph: Graph): { artifact?: TextArtifact; versionLabel?: string; at?: string } {
  if (!node) return {};
  if (node.kind === "claude") {
    const out = graph.outputs[node.id];
    return { artifact: out ? (s.blobs.get(out.hash) as TextArtifact | undefined) : undefined, at: s.lastRuns[node.id]?.endedAt ?? undefined };
  }
  if (node.kind === "output") {
    if (node.mode === "inlet") {
      const v = node.versionId ? s.versions[node.versionId] : undefined;
      return { artifact: v ? (s.blobs.get(v.contentHash) as TextArtifact) : undefined, versionLabel: v ? `v${v.version}` : undefined };
    }
    const edge = incoming(graph, node.id)[0];
    const out = edge ? graph.outputs[edge.from] : undefined;
    const latest = latestVersionOf(node.familyId);
    if (out && out.hash !== latest?.contentHash) return { artifact: s.blobs.get(out.hash) as TextArtifact, versionLabel: "draft", at: s.lastRuns[edge!.from]?.endedAt ?? undefined };
    return { artifact: latest ? (s.blobs.get(latest.contentHash) as TextArtifact) : undefined, versionLabel: latest ? `v${latest.version}` : undefined };
  }
  return {};
}

/** 344px right panel: live preview of the selected node, its context, the instruction, and actions. */
export function Inspector() {
  const phase = useProject((s) => s.activePhase);
  const selection = useProject((s) => s.selection);
  const graph = useDisplayGraph();
  const playing = usePlaybackActive();
  const node = selection ? graph.nodes[selection] : undefined;
  const tab = useUi((s) => s.inspectorTab);
  const setTab = useUi((s) => s.setInspectorTab);
  const live = useProject((s) => (selection ? s.live[selection] : undefined));

  // The Claude node whose context and instruction the panel shows: the selection, or what feeds an Output.
  const claudeId = node?.kind === "claude" ? node.id : node?.kind === "output" && node.mode === "output" ? incoming(graph, node.id)[0]?.from : undefined;
  const claude = claudeId ? (graph.nodes[claudeId] as ClaudeNode | undefined) : undefined;
  const settled = useDebounced(graph, 200);
  const prompt = useMemo(() => (claudeId ? previewPrompt(settled, claudeId) : undefined), [settled, claudeId]);

  return (
    <aside className={styles.inspector} data-phase={phase}>
      <nav className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx(styles.tab, tab === t.id && styles.tabActive)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className={styles.scroll}>
        {tab === "preview" && (
          <>
            <Preview node={node} graph={graph} />
            {claude && prompt && !playing && <ContextSection claude={claude} prompt={prompt} />}
          </>
        )}
        {tab === "prompt" && (claude && prompt ? <PromptTab prompt={prompt} /> : <Empty text="Select a Claude node to see the exact prompt it sends." />)}
        {tab === "node" && (node ? <NodeTab node={node} /> : <Empty text="Select a node to edit it." />)}
      </div>
      {!playing && <Actions node={node} running={live?.status === "running"} claudeId={claudeId} />}
    </aside>
  );
}

function Empty({ text }: { text: string }) {
  return <p className={styles.emptyText}>{text}</p>;
}

function Preview({ node, graph }: { node: GraphNode | undefined; graph: Graph }) {
  const s = useProject();
  const playing = usePlaybackActive();
  const live = node && !playing ? s.live[node.id] : undefined;
  const now = useNow(true, 5000);

  if (!node) {
    const info = PHASE_INFO[s.activePhase];
    return (
      <section className={styles.preview}>
        <div className={styles.row}>
          <span className="caps">{info.name}</span>
          <span className={styles.fill} />
          <span className={styles.meta}>One output → {info.output}</span>
        </div>
        <p className={styles.emptyText}>{info.purpose} Select a node to preview it. Its output renders here as it streams.</p>
      </section>
    );
  }

  if (node.kind === "source") return <SourcePreview node={node} />;
  if (node.kind === "hypothesis") return <HypothesisPreview node={node} />;

  const { artifact, versionLabel, at } = artifactFor(node, s, graph);
  const claude = node.kind === "claude" ? node : undefined;
  const outputNode = node.kind === "output" ? (node as OutputNode) : undefined;
  const feeding = outputNode && outputNode.mode === "output" ? (graph.nodes[incoming(graph, outputNode.id)[0]?.from ?? ""] as ClaudeNode | undefined) : undefined;
  const recipeNode = claude ?? feeding;
  const outputFor = playing ? undefined : claude ? Object.values(graph.nodes).find((n) => n.kind === "output" && n.mode === "output" && incoming(graph, n.id)[0]?.from === claude.id)?.id : outputNode?.mode === "output" ? outputNode.id : undefined;
  const title = node.kind === "output" ? `${node.mode === "inlet" ? "Inlet" : "Output"} · ${node.title}${versionLabel ? ` ${versionLabel}` : ""}` : `Claude · ${node.title}`;

  return (
    <section className={styles.preview}>
      <div className={styles.row}>
        <Dot color={live?.status === "running" ? "var(--text-primary)" : live?.status === "failed" ? "var(--phase-define)" : "var(--signal-live)"} />
        <span className={styles.live}>{live?.status === "running" ? "STREAMING" : live?.status === "failed" ? "FAILED" : "LIVE"}</span>
        <span className={styles.fill} />
        <span className={styles.meta}>{title}</span>
      </div>
      {live?.status === "running" ? (
        <Streaming text={live.text} thinking={live.thinking} recipe={recipeNode?.recipe} />
      ) : live?.status === "failed" ? (
        <p className={styles.error}>{live.error}</p>
      ) : !artifact ? (
        <p className={styles.emptyText}>{claude ? "Not run yet. Press ⌘↵ to run this step." : "Nothing here yet. Run the Claude node that feeds it."}</p>
      ) : artifact.artifact === "testable_statement" && artifact.data ? (
        <StatementCard
          data={artifact.data as StatementData}
          frame={((recipeNode?.options.frame as Frame | undefined) ?? (artifact.data as StatementData).frame) as Frame}
          {...(recipeNode ? { claudeId: recipeNode.id } : {})}
          {...(outputFor && node.kind !== "output" ? { outputId: outputFor } : outputNode?.mode === "output" ? { outputId: outputNode.id } : {})}
        />
      ) : artifact.artifact === "weighted_context" && artifact.data ? (
        <InsightsCard data={artifact.data as InsightsData} label={`Weighted context${versionLabel ? ` · ${versionLabel}` : ""}`} />
      ) : (
        <article className={styles.paper}>
          <pre className={styles.paperText}>{artifact.text}</pre>
        </article>
      )}
      {artifact && at && live?.status !== "running" && <span className={styles.meta}>Rendered {ago(at, now)}</span>}
    </section>
  );
}

function Streaming({ text, thinking, recipe }: { text: string; thinking: string; recipe?: string }) {
  const headline = recipe === "draft_statement" ? partialField(text, "statement") : recipe === "synthesize_insights" ? partialField(text, "summary") : undefined;
  const count = recipe === "synthesize_insights" ? countKey(text, "title") : 0;
  return (
    <div className={styles.streaming}>
      {thinking && !text && <p className={styles.thinking}>{thinking.slice(-480)}</p>}
      {headline ? (
        <article className={styles.paper}>
          <h2 className={styles.paperHeadline}>{headline}</h2>
          {count > 0 && <span className={styles.paperMeta}>{count} insight{count === 1 ? "" : "s"} drafted…</span>}
        </article>
      ) : text ? (
        <pre className={styles.raw}>{text.slice(-1200)}</pre>
      ) : (
        !thinking && <p className={styles.emptyText}>Assembling context…</p>
      )}
    </div>
  );
}

function SourcePreview({ node }: { node: SourceNode }) {
  const content = useProject((s) => (node.contentHash ? (s.blobs.get(node.contentHash) as SourceContent | undefined) : undefined));
  return (
    <section className={styles.preview}>
      <div className={styles.row}>
        <span className="caps">Source</span>
        <span className={styles.fill} />
        <span className={styles.meta}>
          {node.weight} · alias {"{"}
          {node.alias}
          {"}"}
        </span>
      </div>
      {content?.items.map((item) => (
        <article key={item.id} className={styles.sourceItem}>
          {item.image && <img src={item.image} alt="" className={styles.sourceImage} />}
          <p className={styles.sourceTitle}>{item.title}</p>
          {item.url && <p className={styles.meta}>{item.url}</p>}
          <div className={styles.units}>
            {item.units.slice(0, 24).map((u, i) => (
              <p key={i}>
                {u.label && <span>{u.label}</span>} {u.text}
              </p>
            ))}
            {item.units.length > 24 && <p className={styles.meta}>+ {item.units.length - 24} more</p>}
          </div>
        </article>
      ))}
    </section>
  );
}

function HypothesisPreview({ node }: { node: HypothesisNode }) {
  const block = useProject((s) => s.hypotheses[node.blockId]);
  if (!block) return <Empty text="This hypothesis block is missing." />;
  return (
    <section className={styles.preview}>
      <div className={styles.row}>
        <span className="caps">{block.label}</span>
        <span className={styles.fill} />
        <span className={styles.meta}>
          {block.status} · confidence {block.confidence.toFixed(2)}
        </span>
      </div>
      <article className={styles.paper}>
        <h2 className={styles.paperHeadline}>{block.statement}</h2>
        {block.vars.map((v) => (
          <p key={v.key} className={styles.paperBody}>
            {v.key}: {v.value}
          </p>
        ))}
      </article>
    </section>
  );
}

function ContextSection({ claude, prompt }: { claude: ClaudeNode; prompt: AssembledPrompt }) {
  const graph = useProject((s) => s.graph);
  const r = prompt.report;
  const wired = incoming(graph, claude.id).filter((e) => e.toPort === "context");
  const chips: Chip[] = wired.map((e) => {
    const n = graph.nodes[e.from];
    const item = r.items.find((i) => i.alias === n?.alias);
    const isInlet = n?.kind === "output";
    return {
      id: e.from,
      label: n ? (isInlet ? `${n.title} · inlet` : n.title) : e.from,
      tokens: item?.used ?? 0,
      dot: isInlet ? "var(--phase-understand)" : n?.kind === "claude" ? "var(--text-primary)" : "var(--text-secondary)",
      enabled: !claude.disabledInputs.includes(e.from),
      ...(n && "weight" in n && n.weight ? { weight: n.weight } : {}),
    };
  });
  const enabled = chips.filter((c) => c.enabled).length;
  const pct = Math.min(100, (r.total / claude.budget) * 100);
  const refs = new Set(templateRefs(claude.instruction));
  return (
    <section className={styles.prompt}>
      <div className={styles.row}>
        <span className="caps">Context</span>
        <span className={styles.metaSecondary}>
          {enabled} of {chips.length}
        </span>
        <span className={styles.fill} />
        <span className={cx(styles.meta, r.overBudget && styles.over)}>
          {formatTokens(r.total)} / {formatTokens(claude.budget)}
        </span>
      </div>
      <div className={styles.budget}>
        <span style={{ width: `${Math.max(pct, 1)}%`, background: r.overBudget ? "var(--phase-define)" : "var(--phase-understand)" }} />
      </div>
      <div className={styles.shares}>
        {(["heavy", "normal", "light", "mute"] as const).map((w) => (
          <span key={w}>
            <i className={styles[`w_${w}`]} /> {w === "mute" ? "Muted" : w[0]!.toUpperCase() + w.slice(1)} {r.shares[w]}%
          </span>
        ))}
      </div>
      <div className={styles.alwaysOn}>
        <span className={styles.alwaysLabel}>ALWAYS ON</span>
        <span className={styles.fill} />
        <span className={styles.pillMuted}>No foundations slotted</span>
      </div>
      {chips.map((c) => (
        <ContextChip key={c.id} chip={c} onToggle={() => actions.toggleInput(claude.id, c.id)} onSelect={() => actions.select(c.id)} />
      ))}
      {chips.length === 0 && <p className={styles.emptyText}>Nothing wired in. Drop context on the canvas; it wires itself here.</p>}
      <span className={cx("caps", styles.instructionLabel)}>Instruction</span>
      <InstructionEditor
        value={claude.instruction}
        known={(name) => prompt.report.items.some((i) => i.alias === name) || name === "pins" || /^H\d+$/.test(name) || name in claude.options || name === "hypothesis"}
        tone={(name) => (graph.nodes[wired.find((e) => graph.nodes[e.from]?.alias === name)?.from ?? ""]?.kind === "output" ? "inlet" : /^H\d+$/.test(name) ? "hypothesis" : name in claude.options ? "option" : "plain")}
        onChange={(instruction) => actions.update<ClaudeNode>(claude.id, { instruction })}
      />
      {prompt.unknownRefs.length > 0 && (
        <p className={styles.warn}>
          {prompt.unknownRefs.map((r) => `{${r}}`).join(", ")} {prompt.unknownRefs.length === 1 ? "matches" : "match"} nothing wired in. Fix it to run.
        </p>
      )}
      {prompt.unreferenced.length > 0 && refs.size > 0 && (
        <p className={styles.hint}>
          Also included, not named in the instruction: {prompt.unreferenced.map((a) => `{${a}}`).join(", ")}
        </p>
      )}
    </section>
  );
}

function Actions({ node, running, claudeId }: { node: GraphNode | undefined; running: boolean; claudeId?: Id }) {
  const output = node?.kind === "output" && node.mode === "output" ? node : undefined;
  return (
    <footer className={styles.actions}>
      {output ? (
        <button type="button" className={styles.run} onClick={() => void actions.lock(output.id)}>
          <span>Lock {output.title.toLowerCase()}</span>
          <span className={styles.runKey}>⌘L</span>
        </button>
      ) : claudeId && node?.kind === "claude" ? (
        running ? (
          <button type="button" className={cx(styles.run, styles.cancel)} onClick={() => actions.cancel(claudeId)}>
            <span>Cancel run</span>
            <span className={styles.runKey}>⌘.</span>
          </button>
        ) : (
          <button type="button" className={styles.run} onClick={() => actions.run(claudeId)}>
            <span>Run node</span>
            <span className={styles.runKey}>⌘↵</span>
          </button>
        )
      ) : (
        <button type="button" className={styles.run} disabled={!node} onClick={() => node && actions.select(null)}>
          <span>{node ? "Deselect" : "Select a node"}</span>
          <span className={styles.runKey}>esc</span>
        </button>
      )}
      <button type="button" className={styles.snapshot} onClick={() => useUi.getState().setBookmarkOpen(true)}>
        <span>Snapshot</span>
        <span className={styles.snapshotKey}>⌘B</span>
      </button>
    </footer>
  );
}
