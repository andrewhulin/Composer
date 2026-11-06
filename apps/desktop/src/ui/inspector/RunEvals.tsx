import { useEffect, useState } from "react";
import type { ClaudeNode, Id } from "@composer/core";
import type { RunRow } from "@composer/data";
import { actions, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Check } from "lucide-react";
import { Button } from "../primitives";
import styles from "./Inspector.module.css";

/**
 * Keyed by run id by its parent, so a new run starts with a fresh pick.
 *
 * Evals on one run, beside its score: a pairwise pick against the run before it (preferences are
 * sharper than scores), and keeping its brief for replay against proposed rule changes.
 */
export function RunEvals({ claude, runId }: { claude: ClaudeNode; runId: Id }) {
  const repo = useProject((s) => s.repo);
  const project = useProject((s) => s.project);
  const [prev, setPrev] = useState<RunRow | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [picked, setPicked] = useState<"better" | "same" | "worse" | null>(null);
  const [kept, setKept] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!repo) return;
    void repo.runsForNode(claude.id).then(async (runs) => {
      if (!alive) return;
      const done = runs.filter((r) => r.status === "succeeded" && r.outputHash);
      setRun(done.find((r) => r.id === runId) ?? null);
      const before = done.filter((r) => r.id !== runId && r.outputHash !== done.find((x) => x.id === runId)?.outputHash);
      setPrev(before.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null);
      const cases = await repo.listReplayCases(claude.phase);
      if (alive) setKept(cases.some((c) => c.runId === runId));
    });
    return () => {
      alive = false;
    };
  }, [repo, claude.id, claude.phase, runId]);

  const pick = async (p: "better" | "same" | "worse") => {
    setPicked(p);
    if (!prev || p === "same") return;
    const [w, l] = p === "better" ? [runId, prev.id] : [prev.id, runId];
    await actions.pick(w, l, claude.phase, "rerun", undefined, `${p === "better" ? "Preferred the new" : "Preferred the previous"} ${claude.title} run`);
  };

  const keep = async () => {
    if (!repo || !run?.promptHash || !run.outputHash) return toast("This run predates stored prompts, so it can't be replayed.", "error");
    await repo.keepReplayCase({ projectId: project?.id ?? null, phase: claude.phase, recipe: claude.recipe, runId, name: `${claude.title} · ${new Date().toLocaleDateString()}`, promptHash: run.promptHash, outputHash: run.outputHash });
    setKept(true);
    toast("Kept as a replay brief · proposed rules for this phase rerun it before you keep them", "success");
  };

  return (
    <div className={styles.evals}>
      {prev && (
        <div className={styles.evalRow}>
          <span className={styles.scoreLabel}>Vs last run</span>
          {(["better", "same", "worse"] as const).map((p) => (
            <Button key={p} variant={picked === p ? "tint" : "secondary"} size="sm" className={picked === p ? styles.chosen : undefined} onClick={() => void pick(p)} disabled={!!picked}>
              {p === "better" ? "Better" : p === "same" ? "Same" : "Worse"}
            </Button>
          ))}
        </div>
      )}
      <div className={styles.evalRow}>
        <Button
          variant={kept ? "tint" : "secondary"}
          size="sm"
          className={kept ? styles.chosen : undefined}
          iconAfter={kept ? Check : undefined}
          disabled={kept || !run?.promptHash}
          onClick={() => void keep()}
        >
          {kept ? "Replay brief" : "Keep as replay brief"}
        </Button>
        {claude.recipe === "prototype" && (
          <Button variant="secondary" size="sm" onClick={() => useUi.getState().setStudio({ nodeId: claude.id })}>
            Open studio
          </Button>
        )}
      </div>
    </div>
  );
}
