import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { healthIssues, healthLabel } from "../../connections/status";
import { useConnections } from "../../store/connections";
import { useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Icon } from "../primitives/Icon";
import styles from "./ConnectorHealth.module.css";

/** Shows when a connector this project needs is missing or broken. It opens that connector's setup. */
export function ConnectorHealth() {
  const statuses = useConnections((s) => s.statuses);
  const graph = useProject((s) => s.graph);
  const issues = useMemo(() => {
    const inUse = new Set(Object.values(graph.nodes).flatMap((n) => (n.kind === "source" ? [n.platform] : [])));
    return healthIssues(statuses, inUse);
  }, [graph, statuses]);
  const label = healthLabel(issues, statuses);
  if (!label) return null;
  return (
    <button type="button" className={styles.chip} onClick={() => useUi.getState().openSettings("connectors", issues[0]!.id)} title="Open its setup in Settings → Connectors">
      <Icon icon={TriangleAlert} size="sm" />
      {label}
    </button>
  );
}
