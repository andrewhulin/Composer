import type { Graph, Id } from "@composer/core";
import { ancestors, incoming, topoOrder } from "./graph-ops";
import type { NodeStatus } from "./keys";

export interface RunPlan {
  /** Claude nodes to run, in topological order. */
  order: Id[];
  /** For each planned node, the planned nodes it must wait for. */
  waitsFor: Record<Id, Id[]>;
}

const needsRun = (s: NodeStatus | undefined) => s === "stale" || s === "never_run" || s === "stale_env";

/** ⌘↵: the node itself plus every stale Claude node upstream of it. */
export function planPull(graph: Graph, target: Id, statuses: Record<Id, NodeStatus>): RunPlan {
  const set = new Set<Id>([target]);
  for (const id of ancestors(graph, target)) if (graph.nodes[id]?.kind === "claude" && needsRun(statuses[id])) set.add(id);
  return planFor(graph, set);
}

/** "Fork and rerun": every Claude node in the blast radius. */
export function planPush(graph: Graph, ids: Iterable<Id>): RunPlan {
  return planFor(graph, new Set([...ids].filter((id) => graph.nodes[id]?.kind === "claude")));
}

function planFor(graph: Graph, set: Set<Id>): RunPlan {
  const order = topoOrder(graph, set);
  const waitsFor: Record<Id, Id[]> = {};
  for (const id of order) {
    const deps = new Set<Id>();
    for (const a of ancestors(graph, id)) if (set.has(a)) deps.add(a);
    waitsFor[id] = [...deps].filter((d) => incoming(graph, id).some((e) => e.from === d) || order.includes(d));
  }
  return { order, waitsFor };
}

export type JobOutcome = "succeeded" | "failed" | "cancelled" | "skipped";

export interface JobReport {
  outcomes: Record<Id, JobOutcome>;
  errors: Record<Id, unknown>;
}

export type RunNodeFn = (id: Id, signal: AbortSignal) => Promise<void>;

/**
 * Runs plans with a concurrency cap. A failure skips everything that depends on it.
 * Starting a node that is already running cancels the older run: the latest request wins.
 */
export class Scheduler {
  private running = new Map<Id, AbortController>();

  constructor(
    private readonly runNode: RunNodeFn,
    private readonly concurrency = 3,
  ) {}

  isRunning(id: Id): boolean {
    return this.running.has(id);
  }

  cancel(id: Id): void {
    this.running.get(id)?.abort();
  }

  cancelAll(): void {
    for (const c of this.running.values()) c.abort();
  }

  execute(plan: RunPlan): { done: Promise<JobReport>; cancel: () => void } {
    const outcomes: Record<Id, JobOutcome> = {};
    const errors: Record<Id, unknown> = {};
    const job = new AbortController();
    const pending = new Set(plan.order);
    const active = new Set<Id>();

    const done = new Promise<JobReport>((resolve) => {
      const finish = () => {
        if (pending.size === 0 && active.size === 0) resolve({ outcomes, errors });
      };
      const settle = (id: Id, outcome: JobOutcome) => {
        outcomes[id] = outcome;
        active.delete(id);
        if (outcome !== "succeeded") {
          for (const other of [...pending]) {
            if (dependsOn(plan, other, id)) {
              pending.delete(other);
              outcomes[other] = job.signal.aborted ? "cancelled" : "skipped";
            }
          }
        }
        pump();
        finish();
      };
      const pump = () => {
        for (const id of plan.order) {
          if (active.size >= this.concurrency) break;
          if (!pending.has(id)) continue;
          if (job.signal.aborted) {
            pending.delete(id);
            outcomes[id] = "cancelled";
            continue;
          }
          const deps = plan.waitsFor[id] ?? [];
          if (deps.some((d) => outcomes[d] === undefined)) continue;
          pending.delete(id);
          active.add(id);
          this.running.get(id)?.abort();
          const controller = new AbortController();
          this.running.set(id, controller);
          const onJobAbort = () => controller.abort();
          job.signal.addEventListener("abort", onJobAbort);
          this.runNode(id, controller.signal).then(
            () => settle(id, controller.signal.aborted ? "cancelled" : "succeeded"),
            (err: unknown) => {
              if (controller.signal.aborted) settle(id, "cancelled");
              else {
                errors[id] = err;
                settle(id, "failed");
              }
            },
          ).finally(() => {
            job.signal.removeEventListener("abort", onJobAbort);
            if (this.running.get(id) === controller) this.running.delete(id);
          });
        }
      };
      pump();
      finish();
    });

    return { done, cancel: () => job.abort() };
  }
}

function dependsOn(plan: RunPlan, id: Id, on: Id, seen = new Set<Id>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const deps = plan.waitsFor[id] ?? [];
  return deps.includes(on) || deps.some((d) => dependsOn(plan, d, on, seen));
}
