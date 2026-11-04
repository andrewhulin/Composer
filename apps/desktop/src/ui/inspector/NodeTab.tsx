import { WEIGHTS, type ClaudeNode, type Effort, type GraphNode, type HypothesisNode } from "@composer/core";
import { FRAMES, recipe, type Frame } from "@composer/engine";
import { actions, useProject } from "../../store/project";
import { MODELS } from "../../app/scaffold";
import { Toggle } from "../primitives/Toggle";
import { formatTokens } from "../primitives/format";
import styles from "./NodeTab.module.css";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const BUDGETS = [50_000, 100_000, 200_000, 400_000, 800_000];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function Text({ value, onCommit, mono }: { value: string; onCommit: (v: string) => void; mono?: boolean }) {
  return (
    <input
      key={value}
      className={mono ? `${styles.input} ${styles.mono}` : styles.input}
      defaultValue={value}
      onBlur={(e) => e.currentTarget.value !== value && onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        e.stopPropagation();
      }}
    />
  );
}

/** Settings for the selected node. */
export function NodeTab({ node }: { node: GraphNode }) {
  const hypotheses = useProject((s) => s.hypotheses);
  return (
    <div className={styles.tab}>
      <Field label="Title">
        <Text value={node.title} onCommit={(title) => actions.update(node.id, { title })} />
      </Field>
      <Field label="Alias · use as {alias} in instructions">
        <Text mono value={node.alias} onCommit={(alias) => actions.update(node.id, { alias: alias.replace(/[^A-Za-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || node.alias })} />
      </Field>

      {node.kind === "claude" && <ClaudeFields node={node} />}

      {(node.kind === "source" || (node.kind === "output" && node.mode === "inlet")) && (
        <>
          <Field label="Weight">
            <div className={styles.segmented}>
              {WEIGHTS.map((w) => (
                <button key={w} type="button" className={(node.weight ?? "normal") === w ? styles.on : undefined} onClick={() => actions.setWeight(node.id, w)}>
                  {w === "mute" ? "Mute" : w[0]!.toUpperCase() + w.slice(1)}
                </button>
              ))}
            </div>
          </Field>
          <label className={styles.toggleRow}>
            <Toggle on={!!node.pinned} onChange={() => actions.togglePin(node.id)} size="md" label="Pin into every phase" />
            Pin into every phase
          </label>
          <Field label="Why this weight">
            <Text value={node.why ?? ""} onCommit={(why) => actions.update(node.id, { why: why.trim() || undefined })} />
          </Field>
        </>
      )}

      {node.kind === "hypothesis" && <HypothesisFields node={node} draft={hypotheses[node.blockId]?.status === "draft"} />}

      <p className={styles.meta}>
        {node.kind} · {node.phase} · loop {node.loop} · id {node.id.slice(-8)}
      </p>
      {!(node.kind === "output" && node.mode === "inlet") && (
        <button type="button" className={styles.danger} onClick={() => actions.remove([node.id])}>
          Remove node
        </button>
      )}
    </div>
  );
}

function ClaudeFields({ node }: { node: ClaudeNode }) {
  const r = recipe(node.recipe);
  return (
    <>
      <Field label="Recipe">
        <span className={styles.static}>{r.title}</span>
      </Field>
      {node.recipe === "draft_statement" && (
        <Field label="Frame">
          <select className={styles.input} value={node.options.frame ?? "hypothesis"} onChange={(e) => actions.update<ClaudeNode>(node.id, { options: { ...node.options, frame: e.target.value as Frame } })}>
            {(Object.keys(FRAMES) as Frame[]).map((f) => (
              <option key={f} value={f}>
                {FRAMES[f]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Model">
        <select className={styles.input} value={node.model} onChange={(e) => actions.update<ClaudeNode>(node.id, { model: e.target.value })}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Effort">
        <div className={styles.segmented}>
          {EFFORTS.map((e) => (
            <button key={e} type="button" className={node.effort === e ? styles.on : undefined} onClick={() => actions.update<ClaudeNode>(node.id, { effort: e })}>
              {e}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Context budget">
        <div className={styles.segmented}>
          {BUDGETS.map((b) => (
            <button key={b} type="button" className={node.budget === b ? styles.on : undefined} onClick={() => actions.update<ClaudeNode>(node.id, { budget: b })}>
              {formatTokens(b)}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

function HypothesisFields({ node, draft }: { node: HypothesisNode; draft: boolean }) {
  const block = useProject((s) => s.hypotheses[node.blockId]);
  if (!block) return null;
  return (
    <>
      <Field label={`Statement · ${block.label} · ${block.status}`}>
        {draft ? (
          <textarea
            className={styles.textarea}
            defaultValue={block.statement}
            rows={4}
            onBlur={(e) => e.currentTarget.value !== block.statement && actions.updateHypothesis(block.id, { statement: e.currentTarget.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.static}>{block.statement}</span>
        )}
      </Field>
      {block.vars.map((v, i) => (
        <Field key={v.key} label={v.key}>
          {draft ? (
            <Text value={v.value} onCommit={(value) => actions.updateHypothesis(block.id, { vars: block.vars.map((x, j) => (j === i ? { ...x, value } : x)) })} />
          ) : (
            <span className={styles.static}>{v.value}</span>
          )}
        </Field>
      ))}
      {draft && (
        <button type="button" className={styles.secondary} onClick={() => actions.updateHypothesis(block.id, { vars: [...block.vars, { key: `var${block.vars.length + 1}`, value: "" }] })}>
          Add variable
        </button>
      )}
    </>
  );
}
