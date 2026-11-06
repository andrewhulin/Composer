import { lazy, Suspense, useMemo } from "react";
import { PHASE_INFO, PHASE_SURFACE, type Phase, type Graph, type ClaudeNode, type GraphNode, type HypothesisNode, type Id, type OutputNode, type SourceContent, type SourceNode, type TextArtifact } from "@composer/core";
import { hashOf } from "@composer/core";
import { incoming, templateRefs, type AssembledPrompt, type Frame, type InsightsData, type PrototypeData, type StatementData, type StrategyData, type VerdictData, type StoryData, type PrData } from "@composer/engine";
import { actions, latestVersionOf, previewPrompt, useProject } from "../../store/project";
import { useUi, type InspectorTab } from "../../store/ui";
import { useDisplayGraph, usePlaybackActive } from "../../store/display";
import { useDebounced } from "../../hooks/useDebounced";
import { ago, useNow } from "../../hooks/useNow";
import { Pilcrow } from "lucide-react";
import { Button, Kbd, Tabs, type TabItem } from "../primitives";
import { Dot } from "../primitives/Dot";
import { cx } from "../primitives/cx";
import { formatTokens } from "../primitives/format";
import { ContextChip, type Chip } from "./ContextChip";
import { InstructionEditor } from "./InstructionEditor";
import { InsightsCard } from "./InsightsCard";
import { StatementCard } from "./StatementCard";
import { PrototypeView } from "./PrototypeView";
import { StrategyView, VerdictView } from "./ValidateViews";
import { openFoundations, score, useCraft } from "../../store/craft";
// Share pulls in Remotion; load it only when a release story or PR is on screen.
const StoryView = lazy(() => import("./ShareViews").then((m) => ({ default: m.StoryView })));
const PrView = lazy(() => import("./ShareViews").then((m) => ({ default: m.PrView })));
import { NodeTab } from "./NodeTab";
import { RunEvals } from "./RunEvals";
import { SkillReview } from "./SkillReview";
import { PromptTab } from "./PromptTab";
import { countKey, partialField } from "./partial";
import styles from "./Inspector.module.css";

const TABS: TabItem<InspectorTab>[] = [
  { value: "preview", label: "Preview" },
  { value: "prompt", label: "Prompt" },
  { value: "node", label: "Node" },
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
  const workspace = useWorkspaceShown(phase);
  const keyFeed = useProject((s) => (workspace && !node ? keyFeedId(s.graph, phase, s.loop) : undefined));
  const claudeId = node?.kind === "claude" ? node.id : node?.kind === "output" && node.mode === "output" ? incoming(graph, node.id)[0]?.from : keyFeed;
  const claude = claudeId ? (graph.nodes[claudeId] as ClaudeNode | undefined) : undefined;
  const settled = useDebounced(graph, 200);
  const prompt = useMemo(() => (claudeId ? previewPrompt(settled, claudeId) : undefined), [settled, claudeId]);

  return (
    <aside className={styles.inspector} data-phase={phase}>
      <Tabs label="Inspector" items={TABS} value={tab} onChange={setTab} className={styles.tabs} />
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

/** True while Define or Validate shows its workspace rather than the graph. */
function useWorkspaceShown(phase: Phase): boolean {
  const showGraph = useUi((s) => s.showGraph);
  const focus = useUi((s) => s.focus);
  return focus && !showGraph && PHASE_SURFACE[phase] !== "canvas";
}

/** In a workspace with nothing selected, the inspector follows the Claude node feeding the key node. */
function keyFeedId(graph: Graph, phase: Phase, loop: number): Id | undefined {
  const out = Object.values(graph.nodes).find((n) => n.kind === "output" && n.mode === "output" && n.phase === phase && n.loop === loop);
  return out ? incoming(graph, out.id)[0]?.from : undefined;
}

/** The release story a PR node was written from, so its PR can carry that story's rendered GIF. */
function storyHashFor(graph: Graph, _s: unknown, node: GraphNode): string | null {
  const from = graph.edges.filter((e) => e.to === node.id).map((e) => graph.nodes[e.from]);
  const story = from.find((n): n is ClaudeNode => n?.kind === "claude" && n.recipe === "release_story");
  return story ? (graph.outputs[story.id]?.hash ?? null) : null;
}

/** 1–5, how close this run is to what you'd ship. Scores feed the improvement loop. */
function ScoreRun({ runId }: { runId: Id }) {
  const value = useCraft((c) => c.scores[runId]);
  return (
    <div className={styles.score} data-tour="score">
      <span className={styles.scoreLabel}>Score</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={cx(styles.scoreDot, value !== undefined && n <= value && styles.scoreOn)} aria-label={`Score ${n} of 5`} onClick={() => void score(runId, n)}>
          {n}
        </button>
      ))}
      <span className={styles.scoreHint}>{value ? "kept for the improvement loop" : "how close to what you'd ship?"}</span>
    </div>
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
        {PHASE_SURFACE[s.activePhase] !== "canvas" ? (
          <p className={styles.workspaceNote}>
            {PHASE_SURFACE[s.activePhase] === "writing" ? "Writing workspace." : "Scorecard."} The key node, top right, shows exactly what the next phase will read. Below and in the Prompt tab is what Claude reads for the draft. Press <Kbd>G</Kbd> for the graph underneath.
          </p>
        ) : (
          <p className={styles.emptyText}>{info.purpose} Select a node to preview it. Its output renders here as it streams.</p>
        )}
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
        <p className={styles.emptyText}>{claude ? (
            <>
              Not run yet. Press <Kbd>⌘↵</Kbd> to run this step.
            </>
          ) : (
            "Nothing here yet. Run the Claude node that feeds it."
          )}</p>
      ) : artifact.artifact === "testable_statement" && artifact.data ? (
        <StatementCard
          data={artifact.data as StatementData}
          frame={((recipeNode?.options.frame as Frame | undefined) ?? (artifact.data as StatementData).frame) as Frame}
          {...(recipeNode ? { claudeId: recipeNode.id } : {})}
          {...(outputFor && node.kind !== "output" ? { outputId: outputFor } : outputNode?.mode === "output" ? { outputId: outputNode.id } : {})}
        />
      ) : artifact.artifact === "test_strategy" && artifact.data ? (
        <StrategyView data={artifact.data as StrategyData} />
      ) : artifact.artifact === "verdict" && artifact.data ? (
        <VerdictView
          data={artifact.data as VerdictData}
          {...(outputFor ? { outputId: outputFor } : {})}
        />
      ) : artifact.artifact === "release_story" && artifact.data ? (
        <Suspense fallback={<p className={styles.emptyText}>Loading the release story…</p>}>
          <StoryView data={artifact.data as StoryData} hash={hashOf(artifact)} />
        </Suspense>
      ) : artifact.artifact === "pr_description" && artifact.data ? (
        <Suspense fallback={null}>
          <PrView data={artifact.data as PrData} hash={hashOf(artifact)} storyHash={storyHashFor(graph, null, node)} />
        </Suspense>
      ) : artifact.artifact === "prototype" && artifact.data ? (
        <PrototypeView data={artifact.data as PrototypeData} hash={hashOf(artifact)} {...(recipeNode ? { claudeId: recipeNode.id } : {})} />
      ) : artifact.artifact === "weighted_context" && artifact.data ? (
        <InsightsCard data={artifact.data as InsightsData} label={`Weighted context${versionLabel ? ` · ${versionLabel}` : ""}`} />
      ) : (
        <article className={styles.paper}>
          <pre className={styles.paperText}>{artifact.text}</pre>
        </article>
      )}
      {artifact && at && live?.status !== "running" && <span className={styles.meta}>Rendered {ago(at, now)}</span>}
      {claude && !playing && s.lastRuns[claude.id]?.status === "succeeded" && live?.status !== "running" && (
        <>
          <ScoreRun runId={s.lastRuns[claude.id]!.id} />
          <RunEvals key={s.lastRuns[claude.id]!.id} claude={claude} runId={s.lastRuns[claude.id]!.id} />
          <SkillReview claude={claude} runId={s.lastRuns[claude.id]!.id} />
        </>
      )}
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
  const craft = useCraft();
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
        {craft.ds || craft.philosophy ? (
          <>
            {craft.ds && (
              <Button variant="secondary" size="sm" onClick={() => openFoundations()}>
                {craft.ds.content.name} v{craft.ds.content.version}
              </Button>
            )}
            {craft.philosophy && (
              <Button variant="secondary" size="sm" icon={Pilcrow} onClick={() => openFoundations()}>
                rev {craft.philosophy.content.rev}
              </Button>
            )}
            {(craft.rules.filter((r) => r.phase === claude.phase).length > 0) && <span className={styles.pillMuted}>{craft.rules.filter((r) => r.phase === claude.phase).length} rules</span>}
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => openFoundations()}>
            No foundations slotted
          </Button>
        )}
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
  const output = node?.kind === "output" && node.mode === "output" && node.phase !== "validate" ? node : undefined;
  return (
    <footer className={styles.actions}>
      {output ? (
        <Button variant="primary" className={styles.run} shortcut="⌘L" onClick={() => void actions.lock(output.id)} data-tour="primary-action">
          Lock {output.title.toLowerCase()}
        </Button>
      ) : claudeId && node?.kind === "claude" ? (
        running ? (
          <Button variant="secondary" className={styles.run} shortcut="⌘." onClick={() => actions.cancel(claudeId)}>
            Cancel run
          </Button>
        ) : (
          <Button variant="primary" className={styles.run} shortcut="⌘↵" onClick={() => actions.run(claudeId)} data-tour="primary-action">
            Run node
          </Button>
        )
      ) : (
        <Button variant="primary" className={styles.run} shortcut="esc" disabled={!node} onClick={() => node && actions.select(null)}>
          {node ? "Deselect" : "Select a node"}
        </Button>
      )}
      <Button variant="secondary" shortcut="⌘B" onClick={() => useUi.getState().setBookmarkOpen(true)}>
        Snapshot
      </Button>
    </footer>
  );
}
