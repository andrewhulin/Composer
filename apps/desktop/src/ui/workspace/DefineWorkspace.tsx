import { useMemo } from "react";
import { type ClaudeNode, type OutputNode, type SourceNode, type TextArtifact } from "@composer/core";
import { FRAMES, checkForm, statementForm, type Frame, type InsightsData, type StatementData, type StatementForm as Form } from "@composer/engine";
import { actions, toast, useProject } from "../../store/project";
import { primaryClaude } from "../../app/scaffold";
import { cx } from "../primitives/cx";
import { StatementForm } from "./StatementForm";
import { useKey } from "./useKey";
import styles from "./Workspace.module.css";

interface Cite {
  id: string;
  label: string;
  text: string;
  meta: string;
  weight?: string;
}

/** What Define can cite: the locked Understand insights, plus heavy or pinned Understand sources. */
function useEvidence(): Cite[] {
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const versions = useProject((s) => s.versions);
  const blobs = useProject((s) => s.blobs);
  return useMemo(() => {
    const inlet = Object.values(graph.nodes).find((n): n is OutputNode => n.kind === "output" && n.mode === "inlet" && n.phase === "define" && n.loop === loop);
    const v = inlet?.versionId ? versions[inlet.versionId] : undefined;
    const data = v ? ((blobs.get(v.contentHash) as TextArtifact | undefined)?.data as InsightsData | undefined) : undefined;
    const insights: Cite[] = (data?.insights ?? []).map((i, n) => ({
      id: `insight:${n + 1}`,
      label: i.title,
      text: i.evidence[0] ? `“${i.evidence[0].quote}” (${i.evidence[0].source})` : i.detail,
      meta: `Insight ${n + 1} · ${i.strength}`,
    }));
    const sources: Cite[] = Object.values(graph.nodes)
      .filter((n): n is SourceNode => n.kind === "source" && n.phase === "understand" && n.loop === loop && (n.weight === "heavy" || n.pinned))
      .map((n) => ({ id: `source:${n.id}`, label: n.title, text: n.why ?? `${n.platform} source`, meta: `${n.platform}${n.pinned ? " · pinned" : ""}`, weight: n.weight }));
    return [...insights, ...sources];
  }, [graph, loop, versions, blobs]);
}

const evidenceLine = (c: Cite) => `- ${c.label}: ${c.text}`;

/**
 * Define as a writing surface: the statement is the hero, in the fixed form. Evidence from
 * Understand sits in a rail to cite from; Claude's variants sit beside the statement.
 */
export function DefineWorkspace() {
  const key = useKey("define");
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const live = useProject((s) => s.live);
  const evidence = useEvidence();
  const claude = key?.source ?? primaryClaude(graph, "define", loop);
  const base = key?.artifact?.data as StatementData | undefined;
  const output = key?.output;
  const claudeForm: Form = base ? statementForm(base) : { believe: "", whom: "", know_when: "" };
  const draft = output?.draft ?? {};
  const form: Form = { believe: draft.believe ?? claudeForm.believe, whom: draft.whom ?? claudeForm.whom, know_when: draft.know_when ?? claudeForm.know_when };
  const edited = ["believe", "whom", "know_when"].some((k) => draft[k] !== undefined && draft[k] !== claudeForm[k as keyof Form]);
  const checks = checkForm(form, base?.checks.heavy_sources ?? []);
  const frame = (claude?.options.frame as Frame | undefined) ?? "hypothesis";
  const running = claude ? live[claude.id]?.status === "running" : false;
  const cites = new Set(output?.cites ?? []);
  const evidenceText = draft.evidence ?? (base ? base.support.map((s) => `- ${s.label}: ${s.text}`).join("\n") : "");
  const hasRun = !!(claude && graph.outputs[claude.id]);
  const readOnly = output ? output.loop !== loop : true;

  if (!output || !claude) return <p className={styles.empty}>Lock the Understand output to start Define.</p>;

  const set = (patch: Partial<Form>) => actions.setDraft(output.id, patch);
  const cite = (c: Cite) => {
    const line = evidenceLine(c);
    const on = cites.has(c.id);
    const lines = evidenceText.split("\n").filter(Boolean);
    const next = on ? lines.filter((l) => l !== line) : lines.includes(line) ? lines : [...lines, line];
    actions.toggleCite(output.id, c.id);
    actions.setDraft(output.id, { evidence: next.join("\n") });
  };
  const takeVariant = async (v: Form & { angle: string }) => {
    actions.setDraft(output.id, { believe: v.believe, whom: v.whom, know_when: v.know_when });
    const { repo, project } = useProject.getState();
    if (repo && project) await repo.decide(project.id, "keep_variant", `Took the “${v.angle}” variant of the statement over Claude's first draft`, { outputId: output.id });
    toast(`Using the ${v.angle} variant · edit it before you lock`);
  };

  const checkList = [
    { ok: checks.testable, label: "Testable" },
    { ok: checks.specific_user, label: "Specific user" },
    { ok: checks.measurable, label: "Measurable" },
    { ok: cites.size > 0 || checks.heavy_sources.length > 0, label: `Cites ${Math.max(cites.size, checks.heavy_sources.length)} evidence` },
  ];

  return (
    <div className={styles.define}>
      <aside className={styles.rail} aria-label="Evidence">
        <span className="caps">Evidence · from Understand</span>
        {evidence.length === 0 && <p className={styles.railEmpty}>Mark Understand sources heavy or pinned, or lock its insights, and they show up here to cite.</p>}
        {evidence.map((c) => (
          <div key={c.id} className={cx(styles.cite, cites.has(c.id) && styles.citeOn)}>
            <span className={styles.citeMeta}>
              {c.weight && <span className={styles.weight}>{c.weight}</span>}
              {c.meta}
            </span>
            <span className={styles.citeLabel}>{c.label}</span>
            <span className={styles.citeText}>{c.text}</span>
            {!readOnly && (
              <button type="button" className={styles.citeBtn} onClick={() => cite(c)}>
                {cites.has(c.id) ? "Cited ✓" : "Cite"}
              </button>
            )}
          </div>
        ))}
      </aside>

      <section className={styles.hero}>
        <div className={styles.frames} role="tablist" aria-label="Frame">
          {(Object.keys(FRAMES) as Frame[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={frame === f} className={cx(styles.frameTab, frame === f && styles.frameOn)} onClick={() => actions.update<ClaudeNode>(claude.id, { options: { ...claude.options, frame: f } })} title={`Claude drafts a ${FRAMES[f].toLowerCase()} next`}>
              {FRAMES[f]}
            </button>
          ))}
        </div>
        <StatementForm form={form} onChange={readOnly ? undefined : set} readOnly={readOnly} {...(hasRun ? { claude } : {})} />
        <div className={styles.checks}>
          {checkList.map((c) => (
            <span key={c.label} className={c.ok ? styles.ok : styles.miss}>
              {c.ok ? "✓" : "✕"} {c.label}
            </span>
          ))}
        </div>
        <label className={styles.evidenceLabel} htmlFor="define-evidence">
          <span className="caps">Evidence it rests on</span>
        </label>
        <textarea id="define-evidence" className={styles.evidence} value={evidenceText} readOnly={readOnly} rows={3} placeholder="Cite from the rail, or write the evidence in your own words." onChange={(e) => actions.setDraft(output.id, { evidence: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        {!readOnly && (
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={running} onClick={() => actions.run(claude.id)}>
              {running ? "Drafting…" : hasRun ? "Redraft with Claude" : "Draft with Claude"}
            </button>
            {edited && base && (
              <button type="button" className={styles.secondary} onClick={() => actions.setDraft(output.id, { believe: undefined, whom: undefined, know_when: undefined })}>
                Use Claude's draft
              </button>
            )}
            <span className={styles.fill} />
            <button type="button" className={styles.primary} onClick={() => void actions.lockStatement(output.id)} data-tour="lock-statement" disabled={!form.believe.trim() || !form.whom.trim() || !form.know_when.trim()}>
              Lock {frame === "hypothesis" ? "hypothesis" : FRAMES[frame].toLowerCase()}
            </button>
          </div>
        )}
        {running && live[claude.id]?.text && <p className={styles.streaming}>{live[claude.id]!.text.slice(-220)}</p>}
      </section>

      <section className={styles.variants} aria-label="Variants">
        <span className="caps">Variants · Claude</span>
        {!base && <p className={styles.railEmpty}>Draft with Claude for a first statement and two variants from other angles.</p>}
        {(base?.variants ?? []).map((v, i) => (
          <article key={i} className={styles.variant}>
            <span className={styles.angle}>{v.angle}</span>
            <p>
              <b>We believe</b> {v.believe}
            </p>
            <p>
              <b>For</b> {v.whom}
            </p>
            <p>
              <b>We'll know when</b> {v.know_when}
            </p>
            {!readOnly && (
              <button type="button" className={styles.secondary} onClick={() => void takeVariant(v)}>
                Use this
              </button>
            )}
          </article>
        ))}
        {(base?.alternates ?? []).length > 0 && (
          <div className={styles.alternates}>
            <span className="caps">Other frames</span>
            {base!.alternates.map((a, i) => (
              <p key={i}>
                <span>{FRAMES[a.frame] ?? a.frame}</span>
                {a.statement}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
