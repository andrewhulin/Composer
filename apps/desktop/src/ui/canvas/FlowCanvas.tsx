import { useCallback, useEffect, useMemo, useRef, type DragEvent } from "react";
import {
  ReactFlow,
  MiniMap,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { PHASES, type GraphNode, type Id } from "@composer/core";
import { canConnect } from "@composer/engine";
import { actions, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { ingestFile, ingestText, ingestUrl, isUrl } from "../../app/ingest";
import { ClaudeNodeView } from "../nodes/ClaudeNodeView";
import { SourceNodeView } from "../nodes/SourceNodeView";
import { HypothesisNodeView } from "../nodes/HypothesisNodeView";
import { OutputNodeView } from "../nodes/OutputNodeView";
import { WireEdge } from "./WireEdge";
import { DropHint, RegionNode } from "./RegionNode";
import styles from "./FlowCanvas.module.css";

const nodeTypes = {
  source: SourceNodeView,
  claude: ClaudeNodeView,
  hypothesis: HypothesisNodeView,
  output: OutputNodeView,
  region: RegionNode,
  drop: DropHint,
};
const edgeTypes = { wire: WireEdge };

/** Horizontal offset of each phase when every phase is on one canvas (Focus off). */
const REGION_W = 1400;

const MINIMAP_COLOR: Record<string, string> = {
  source: "#a29e94",
  claude: "#eeedea",
  hypothesis: "#e3c25a",
  output: "#e05a4e",
};

export function FlowCanvas() {
  const graph = useProject((s) => s.graph);
  const selection = useProject((s) => s.selection);
  const activePhase = useProject((s) => s.activePhase);
  const loop = useProject((s) => s.loop);
  const focus = useUi((s) => s.focus);
  const tool = useUi((s) => s.tool);
  const setZoom = useUi((s) => s.setZoom);
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const offset = useCallback((n: GraphNode) => (focus ? 0 : PHASES.indexOf(n.phase) * REGION_W), [focus]);
  const visible = useCallback((n: GraphNode) => n.loop === loop && (!focus || n.phase === activePhase), [focus, activePhase, loop]);

  const nodes = useMemo<FlowNode[]>(() => {
    const out: FlowNode[] = [];
    if (!focus) {
      PHASES.forEach((p, i) =>
        out.push({ id: `region:${p}`, type: "region", position: { x: i * REGION_W - 40, y: -80 }, data: { phase: p }, draggable: false, selectable: false, zIndex: -1 }),
      );
    }
    const hasSources = Object.values(graph.nodes).some((n) => n.kind === "source" && n.phase === activePhase && n.loop === loop);
    if (focus && activePhase === "understand" && !hasSources) {
      out.push({ id: "drop-hint", type: "drop", position: { x: 72, y: 96 }, data: {}, draggable: false, selectable: false });
    }
    for (const n of Object.values(graph.nodes)) {
      if (!visible(n)) continue;
      out.push({
        id: n.id,
        type: n.kind,
        position: { x: n.position.x + offset(n), y: n.position.y },
        data: {},
        selected: n.id === selection,
        zIndex: n.id === selection ? 10 : 1,
      });
    }
    return out;
  }, [graph.nodes, selection, focus, activePhase, loop, offset, visible]);

  const edges = useMemo<FlowEdge[]>(
    () =>
      graph.edges
        .filter((e) => graph.nodes[e.from] && graph.nodes[e.to] && visible(graph.nodes[e.from]!) && visible(graph.nodes[e.to]!))
        .map((e) => ({ id: e.id, source: e.from, target: e.to, sourceHandle: e.fromPort, targetHandle: e.toPort, type: "wire" })),
    [graph.edges, graph.nodes, visible],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          const n = useProject.getState().graph.nodes[c.id];
          if (n) actions.move(c.id, { x: Math.round(c.position.x - offset(n)), y: Math.round(c.position.y) });
        } else if (c.type === "select") {
          if (c.selected && !c.id.startsWith("region:") && c.id !== "drop-hint") actions.select(c.id);
          else if (!c.selected && useProject.getState().selection === c.id) actions.select(null);
        } else if (c.type === "remove") actions.remove([c.id]);
      }
    },
    [offset],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) if (c.type === "remove") actions.disconnect(c.id);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) actions.connect(c.source, c.target, c.targetHandle ?? undefined);
  }, []);

  const isValidConnection = useCallback(
    (c: Connection | FlowEdge) => !!c.source && !!c.target && canConnect(useProject.getState().graph, c.source, c.target, c.targetHandle ?? undefined).ok,
    [],
  );

  const onConnectEnd = useCallback((_e: MouseEvent | TouchEvent, state: { isValid: boolean | null; fromNode: { id: string } | null; toNode: { id: string } | null; toHandle: { id?: string | null } | null }) => {
    // Released on a node that can't take the wire: say why and shake it.
    if (state.isValid === false && state.fromNode && state.toNode) {
      actions.connect(state.fromNode.id, state.toNode.id, state.toHandle?.id ?? undefined);
    }
  }, []);

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    const id = sel.find((n) => !n.id.startsWith("region:") && n.id !== "drop-hint")?.id;
    if (id && id !== useProject.getState().selection) actions.select(id);
  }, []);

  const dropPoint = (e: { clientX: number; clientY: number }) => {
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const phaseOffset = focus ? 0 : PHASES.indexOf(useProject.getState().activePhase) * REGION_W;
    return { x: Math.round(p.x - phaseOffset), y: Math.round(p.y) };
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list") || e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const at = dropPoint(e);
    const files = [...e.dataTransfer.files];
    try {
      if (files.length) {
        let dy = 0;
        for (const f of files) {
          await actions.addSource(await ingestFile(f), { x: at.x, y: at.y + dy });
          dy += 112;
        }
        return;
      }
      const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (uri) await addFromText(uri, at);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    }
  };

  // ⌘V anywhere outside a text field: a link becomes a link source, anything else a quote or note.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      try {
        if (files.length) for (const f of files) await actions.addSource(await ingestFile(f));
        else await addFromText(text);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), "error");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Keep the selected node's phase in view when switching phases.
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.18, maxZoom: 1, duration: 220 }), 30);
    return () => clearTimeout(t);
  }, [activePhase, focus, flow]);

  return (
    <div ref={wrapper} className={styles.flow} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd as never}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => actions.select(null)}
        onMove={(_, vp) => setZoom(vp.zoom)}
        connectionRadius={24}
        snapToGrid
        snapGrid={[8, 8]}
        panOnDrag={tool === "pan" ? true : [1, 2]}
        selectionOnDrag={tool === "select"}
        panOnScroll
        zoomOnPinch
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        defaultEdgeOptions={{ type: "wire" }}
      >
        <MiniMap
          className={styles.minimap}
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(n) => MINIMAP_COLOR[n.type ?? ""] ?? "transparent"}
          nodeBorderRadius={2}
          maskColor="rgba(10, 10, 11, 0.55)"
          style={{ width: 150, height: 96 }}
        />
      </ReactFlow>
    </div>
  );
}

async function addFromText(text: string, at?: { x: number; y: number }) {
  const t = text.trim();
  if (isUrl(t)) {
    toast(`Fetching ${new URL(t).hostname}…`);
    await actions.addSource(await ingestUrl(t), at);
  } else {
    await actions.addSource(ingestText(t), at);
  }
}

export type { Id };
