import type { GraphNode, NodeKind, PortType } from "@composer/core";

export interface InputPort {
  id: string;
  label: string;
  accepts: readonly PortType[];
  many: boolean;
}

export interface OutputPort {
  id: string;
  type: PortType;
}

/** Ports per node kind, from Figma 02 · Nodes. */
export const PORTS: Record<NodeKind, { inputs: InputPort[]; outputs: OutputPort[] }> = {
  source: { inputs: [], outputs: [{ id: "out", type: "context" }] },
  claude: {
    inputs: [
      { id: "context", label: "context", accepts: ["context", "phase_output", "text"], many: true },
      { id: "hypothesis", label: "hypothesis", accepts: ["hypothesis"], many: false },
    ],
    outputs: [{ id: "out", type: "text" }],
  },
  hypothesis: {
    inputs: [{ id: "evidence", label: "evidence", accepts: ["phase_output", "text"], many: true }],
    outputs: [{ id: "out", type: "hypothesis" }],
  },
  output: {
    inputs: [{ id: "text", label: "text", accepts: ["text"], many: false }],
    outputs: [{ id: "out", type: "phase_output" }],
  },
};

export function inputPorts(node: GraphNode): InputPort[] {
  if (node.kind === "output" && node.mode === "inlet") return [];
  return PORTS[node.kind].inputs;
}

export function outputType(node: GraphNode): PortType {
  return PORTS[node.kind].outputs[0]!.type;
}

const TYPE_NAME: Record<PortType, string> = {
  context: "Context",
  phase_output: "A locked output",
  hypothesis: "A hypothesis",
  text: "Claude text",
};

/** Why a wire of `type` can't go into `target`. Wording follows Figma 05 · Interaction patterns. */
export function mismatchReason(type: PortType, target: GraphNode): string {
  const what = TYPE_NAME[type];
  if (target.kind === "source") return "Sources don't take inputs. Wire into a Claude node instead.";
  if (target.kind === "output" && target.mode === "inlet") return "Inlets are locked. They bring a finished phase in; nothing wires into them.";
  if (target.kind === "hypothesis") {
    if (type === "context") return "Context can't feed a hypothesis. Wire it into a Claude node instead.";
    if (type === "hypothesis") return "Hypotheses don't feed each other. Swap a variable to fork the chain instead.";
  }
  if (target.kind === "output") {
    if (type === "context") return "Context can't be a phase output. Run it through a Claude node first.";
    if (type === "hypothesis") return "A hypothesis can't be a phase output. Draft the statement with a Claude node.";
    if (type === "phase_output") return "That output is already locked. Wire it into a Claude node as context.";
  }
  return `${what} can't go into ${target.title}.`;
}

/** Picks the input port on `target` that accepts `type`, or explains why none does. */
export function matchPort(type: PortType, target: GraphNode): { port: InputPort } | { reason: string } {
  const port = inputPorts(target).find((p) => p.accepts.includes(type));
  return port ? { port } : { reason: mismatchReason(type, target) };
}
