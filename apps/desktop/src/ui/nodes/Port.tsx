import { Handle, Position, useConnection } from "@xyflow/react";
import type { Id, PortType } from "@composer/core";
import { canConnect } from "@composer/engine";
import { useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import { PORT_COLOR } from "./kinds";
import styles from "./Port.module.css";

interface PortProps {
  nodeId: Id;
  /** Input port id, or "out". */
  port: string;
  type: PortType;
  side: "in" | "out";
  top: number;
  /** Overrides the type color, e.g. a phase output colored by its phase. */
  color?: string;
}

/**
 * A typed port. While a wire is being dragged, every port that would accept it glows and the
 * rest dim, so the snap target is obvious before release (Figma 05 · Snap nodes).
 */
export function Port({ nodeId, port, type, side, top, color }: PortProps) {
  const connection = useConnection();
  const graph = useProject((s) => s.graph);
  let state: "idle" | "ok" | "no" = "idle";
  if (connection.inProgress && side === "in" && connection.fromNode && connection.fromNode.id !== nodeId) {
    state = canConnect(graph, connection.fromNode.id, nodeId, port).ok ? "ok" : "no";
  }
  return (
    <Handle
      type={side === "in" ? "target" : "source"}
      position={side === "in" ? Position.Left : Position.Right}
      id={port}
      className={cx(styles.port, side === "in" ? styles.in : styles.out, state === "ok" && styles.ok, state === "no" && styles.no)}
      style={{ top, ["--port-color" as string]: color ?? PORT_COLOR[type] }}
    />
  );
}
