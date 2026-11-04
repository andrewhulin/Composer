import { describe, expect, it } from "vitest";
import { claude, graphOf, source, wire } from "@composer/core/testing";
import { planPull, planPush, Scheduler } from "./scheduler";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("plans", () => {
  const g = graphOf(
    [source("s"), claude("a"), claude("b"), claude("c"), claude("d")],
    [wire("s", "a", "context"), wire("a", "b", "context"), wire("b", "c", "context"), wire("a", "d", "context")],
  );

  it("pull runs the node plus its stale ancestors, in order", () => {
    const plan = planPull(g, "c", { a: "stale", b: "fresh", c: "stale", d: "stale" });
    expect(plan.order).toEqual(["a", "c"]);
    expect(plan.waitsFor.c).toEqual(["a"]);
  });

  it("push runs the given set topologically", () => {
    expect(planPush(g, ["d", "c", "b", "s"]).order).toEqual(["b", "c", "d"]);
  });
});

describe("Scheduler", () => {
  const chain = graphOf([claude("a"), claude("b"), claude("c")], [wire("a", "b", "context"), wire("b", "c", "context")]);
  const wide = graphOf(Array.from({ length: 6 }, (_, i) => claude(`w${i}`)));

  it("runs in topological order", async () => {
    const order: string[] = [];
    const s = new Scheduler(async (id) => {
      order.push(id);
      await tick();
    });
    const report = await s.execute(planPush(chain, ["c", "a", "b"])).done;
    expect(order).toEqual(["a", "b", "c"]);
    expect(report.outcomes).toEqual({ a: "succeeded", b: "succeeded", c: "succeeded" });
  });

  it("never exceeds the concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const s = new Scheduler(async () => {
      active++;
      peak = Math.max(peak, active);
      await tick(10);
      active--;
    }, 3);
    await s.execute(planPush(wide, Object.keys(wide.nodes))).done;
    expect(peak).toBe(3);
  });

  it("skips everything downstream of a failure", async () => {
    const s = new Scheduler(async (id) => {
      if (id === "a") throw new Error("boom");
    });
    const report = await s.execute(planPush(chain, ["a", "b", "c"])).done;
    expect(report.outcomes).toEqual({ a: "failed", b: "skipped", c: "skipped" });
    expect(String(report.errors.a)).toContain("boom");
  });

  it("cancels the whole job", async () => {
    const s = new Scheduler(
      (_id, signal) =>
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 200);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        }),
    );
    const job = s.execute(planPush(chain, ["a", "b", "c"]));
    await tick();
    job.cancel();
    const report = await job.done;
    expect(report.outcomes).toEqual({ a: "cancelled", b: "cancelled", c: "cancelled" });
  });

  it("lets the latest run of a node win", async () => {
    const results: string[] = [];
    let n = 0;
    const s = new Scheduler(
      (id, signal) =>
        new Promise<void>((resolve, reject) => {
          const me = ++n;
          const t = setTimeout(() => {
            results.push(`${id}#${me}`);
            resolve();
          }, 30);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        }),
    );
    const single = graphOf([claude("x")]);
    const first = s.execute(planPush(single, ["x"]));
    await tick();
    const second = s.execute(planPush(single, ["x"]));
    const [r1, r2] = await Promise.all([first.done, second.done]);
    expect(r1.outcomes.x).toBe("cancelled");
    expect(r2.outcomes.x).toBe("succeeded");
    expect(results).toEqual(["x#2"]);
  });
});
