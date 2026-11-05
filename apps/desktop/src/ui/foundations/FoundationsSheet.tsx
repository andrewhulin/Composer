import { useEffect, useMemo, useState } from "react";
import { PHASE_INFO } from "@composer/core";
import type { DesignSystem, DriftProposal, Philosophy, Principle } from "@composer/engine";
import type { FoundationRow, ProposalRow } from "@composer/data";
import { inTauri } from "../../platform/env";
import { readTextFile } from "../../platform/share";
import { accept, evidence, importDesignSystem, loadCraft, importPhilosophy, lockPrinciple, notYet, openFoundations, reflect, reject, retire, useCraft, type PrincipleDiff, type RuleDiff } from "../../store/craft";
import { toast, useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import { ago, useNow } from "../../hooks/useNow";
import styles from "./FoundationsSheet.module.css";

const DEFAULTS = {
  dsTokens: "~/Documents/GitHub/slingshot-design-skills/sundial-design-system/references/tokens.md",
  dsGuide: "~/Documents/GitHub/slingshot-design-skills/sundial-design-system/SKILL.md",
  philosophy: "~/Documents/GitHub/slingshot-design-skills/slingshot-design-philosophy/SKILL.md",
};

const run = (fn: () => Promise<unknown>) => () =>
  void fn().catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), "error"));

/** Figma 06 · Foundations: the two always-on slots, what they learned, and what's waiting on you. */
export function FoundationsSheet() {
  const open = useCraft((s) => s.open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openFoundations(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className={styles.scrim} onPointerDown={() => openFoundations(false)}>
      <div className={styles.sheet} role="dialog" aria-label="Foundations" onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>Foundations · always on</span>
            <h1 className={styles.title}>Design system + philosophy</h1>
            <p className={styles.lede}>Two slots that ride along with every phase. The philosophy sharpens as you decide; the design system only changes when you accept a proposal.</p>
          </div>
          <button type="button" className={styles.esc} onClick={() => openFoundations(false)}>
            esc
          </button>
        </header>
        <div className={styles.slots}>
          <PhilosophySlot />
          <DesignSystemSlot />
        </div>
        <LearningPanel />
      </div>
    </div>
  );
}

// ── philosophy ─────────────────────────────────────────────────────────────

const STRENGTH_FILL = { forming: 0.35, steady: 0.7, strong: 0.92, locked: 0.92 } as const;

function PhilosophySlot() {
  const ph = useCraft((s) => s.philosophy);
  const log = useCraft((s) => s.philosophyLog);
  const all = useCraft((s) => s.proposals);
  const proposals = useMemo(() => all.filter((p) => p.targetKind === "philosophy" && p.status === "pending"), [all]);
  const [editing, setEditing] = useState(false);
  const now = useNow(true, 30_000);
  if (!ph) return <ImportPhilosophy />;
  const c = ph.content;
  const last = [...log].reverse().find((r) => r.changelog);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={cx(styles.slotLabel, styles.define)}>Slot · philosophy</span>
          <span className={styles.panelName}>How you design</span>
          <span className={styles.panelMeta}>
            rev {c.rev} · {c.principles.length} principles{last?.changelog ? ` · ${last.changelog.title.toLowerCase()} ${ago(last.createdAt, now)}` : ""}
          </span>
        </div>
        <span className={cx(styles.chip, styles.live)}>rev {c.rev}</span>
        <button type="button" className={styles.button} onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : "Edit principles"}
        </button>
      </div>
      <div className={styles.split}>
        <div className={styles.principles}>
          <span className={styles.section}>Principles</span>
          {editing ? <EditPrinciples ph={c} onDone={() => setEditing(false)} /> : c.principles.map((p) => <PrincipleRow key={p.n} p={p} recent={last?.changelog?.title.endsWith(String(p.n).padStart(2, "0")) ?? false} />)}
        </div>
        <div className={styles.changelog}>
          <div className={styles.sectionRow}>
            <span className={styles.section}>Changelog</span>
            <span className={styles.aside}>learned from your calls</span>
          </div>
          {[...log].reverse().slice(0, 6).map((r) => (
            <ChangeEntry key={r.id} row={r} tone="define" />
          ))}
          {proposals.map((p) => (
            <Forming key={p.id} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PrincipleRow({ p, recent }: { p: Principle; recent: boolean }) {
  const decisions = p.decisions ?? 0;
  return (
    <div className={styles.principle}>
      <span className={cx(styles.pn, recent && styles.define)}>{String(p.n).padStart(2, "0")}</span>
      <div className={styles.ptext}>
        <span className={styles.pbody}>{p.text}</span>
        <span className={styles.pmeta}>
          {decisions ? `${decisions} ${decisions === 1 ? "decision" : "decisions"}` : "from your writing"} · {p.strength}
          {p.strength === "locked" && <span className={styles.chip}>locked</span>}
          {p.strength === "forming" && <span className={cx(styles.chip, styles.hyp)}>new</span>}
        </span>
      </div>
      <span className={styles.strength}>
        <span style={{ width: `${STRENGTH_FILL[p.strength] * 100}%`, background: p.strength === "forming" ? "var(--signal-hypothesis)" : p.strength === "steady" ? "var(--text-secondary)" : "var(--text-primary)" }} />
      </span>
    </div>
  );
}

function EditPrinciples({ ph, onDone }: { ph: Philosophy; onDone: () => void }) {
  const [draft, setDraft] = useState(() => ph.principles.map((p) => ({ ...p })));
  const repo = useProject((s) => s.repo);
  const current = useCraft((s) => s.philosophy);
  const save = run(async () => {
    if (!repo || !current) return;
    const changed = draft.filter((d, i) => d.text.trim() !== ph.principles[i]?.text);
    if (!changed.length) return onDone();
    const rev = ph.rev + 1;
    const title = changed.length === 1 ? `Reworded ${String(changed[0]!.n).padStart(2, "0")}` : `Reworded ${changed.length} principles`;
    await repo.saveFoundation("philosophy", `rev ${rev}`, { ...ph, rev, principles: draft.map((d) => ({ ...d, text: d.text.trim() })) }, { kind: "reworded", title, text: "Edited by you." }, current.row.id);
    await loadCraft();
    onDone();
  });
  return (
    <div className={styles.editList}>
      {draft.map((p, i) => (
        <div key={p.n} className={styles.editRow}>
          <span className={styles.pn}>{String(p.n).padStart(2, "0")}</span>
          <textarea
            value={p.text}
            rows={2}
            onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button type="button" className={styles.ghost} disabled={p.strength === "locked"} onClick={run(() => lockPrinciple(p.n))}>
            {p.strength === "locked" ? "Locked" : "Lock"}
          </button>
        </div>
      ))}
      <button type="button" className={styles.primary} onClick={save}>
        Save as rev {ph.rev + 1}
      </button>
    </div>
  );
}

const GLYPH: Record<string, string> = { sharpened: "~", reworded: "~", added: "+", retired: "−", import: "↓", locked: "■", change: "~", add: "+" };

function ChangeEntry({ row, tone }: { row: FoundationRow; tone: "define" | "build" }) {
  const now = useNow(true, 30_000);
  const c = row.changelog;
  if (!c) return null;
  return (
    <div className={styles.entry}>
      <span className={cx(styles.glyph, c.kind === "added" || c.kind === "add" ? styles.glyphHyp : c.kind === "retired" ? styles.glyphMuted : styles[tone])}>{GLYPH[c.kind] ?? "·"}</span>
      <div className={styles.entryText}>
        <div className={styles.entryHead}>
          <span>{c.title}</span>
          <em>{row.version}</em>
        </div>
        <p>{c.text}</p>
        <span className={styles.when}>{ago(row.createdAt, now)}</span>
      </div>
    </div>
  );
}

function Forming({ p }: { p: ProposalRow }) {
  const d = p.diff as PrincipleDiff;
  const label = d.change === "added" ? "Forming" : `${d.change[0]!.toUpperCase()}${d.change.slice(1)}${d.n ? ` ${String(d.n).padStart(2, "0")}` : ""}`;
  return (
    <div className={styles.forming}>
      <p>
        {label}: “{d.text}” <span>{d.why}</span>
      </p>
      <div className={styles.row}>
        <button type="button" className={styles.keep} onClick={run(() => accept(p))}>
          Keep
        </button>
        <button type="button" className={styles.ghost} onClick={run(() => notYet(p))}>
          Not yet
        </button>
      </div>
    </div>
  );
}

function ImportPhilosophy() {
  const [path, setPath] = useState(DEFAULTS.philosophy);
  return (
    <section className={cx(styles.panel, styles.empty)}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={cx(styles.slotLabel, styles.define)}>Slot · philosophy</span>
          <span className={styles.panelName}>How you design</span>
          <span className={styles.panelMeta}>not slotted · import your own writing; its “How to apply” list becomes the principles</span>
        </div>
      </div>
      <Importer
        fields={[{ label: "Philosophy (markdown)", value: path, set: setPath }]}
        onPaths={([p]) => run(async () => importPhilosophy(await readTextFile(p!), p!.split("/").slice(-2).join("/")))()}
        onFiles={(files) => run(async () => importPhilosophy(await files[0]!.text(), files[0]!.name))()}
      />
    </section>
  );
}

// ── design system ──────────────────────────────────────────────────────────

const KEY_COLORS = [/^surface\/bg$/, /^surface\/component$/, /^content\/primary$/, /^content\/secondary$/, /^accent\/solid$/, /danger|error/, /success/];

function DesignSystemSlot() {
  const ds = useCraft((s) => s.ds);
  const log = useCraft((s) => s.dsLog);
  const onSystem = useCraft((s) => s.onSystem);
  const all = useCraft((s) => s.proposals);
  const proposals = useMemo(() => all.filter((p) => p.targetKind === "design_system" && p.status === "pending"), [all]);
  const [swap, setSwap] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const now = useNow(true, 30_000);
  if (!ds || swap) return <ImportDesignSystem onDone={() => setSwap(false)} {...(ds ? { onCancel: () => setSwap(false) } : {})} />;
  const c = ds.content;
  const last = [...log].reverse()[0];
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={cx(styles.slotLabel, styles.build)}>Slot · design system</span>
          <span className={styles.panelName}>
            {c.name} v{c.version}
          </span>
          <span className={styles.panelMeta}>
            {c.source || "markdown"} · {last ? `updated ${ago(last.createdAt, now)}` : ""} · read only to Composer
          </span>
        </div>
        {proposals.length > 0 && <span className={cx(styles.chip, styles.hyp)}>{proposals.length} to review</span>}
        <button type="button" className={styles.button} onClick={() => setSwap(true)}>
          Swap system
        </button>
      </div>
      <div className={styles.stats}>
        <Stat n={String(c.tokens.length)} label="tokens" />
        <Stat n={String(c.components.length)} label="components" />
        <Stat n={String(c.type.length)} label="type styles" />
        <Stat n={onSystem === null ? "–" : `${onSystem}%`} label="Build output on-system" />
      </div>
      <Tokens ds={c} />
      <div className={styles.proposals}>
        <div className={styles.sectionRow}>
          <span className={styles.section}>Proposed updates</span>
          <span className={styles.aside}>nothing changes until you accept</span>
        </div>
        {proposals.length === 0 && <p className={styles.quiet}>Nothing to review. When the same override shows up across three builds, Composer drafts the change here.</p>}
        {proposals.map((p) => (
          <DsProposal key={p.id} p={p} open={review === p.id} onToggle={() => setReview(review === p.id ? null : p.id)} />
        ))}
        {[...log].reverse().slice(0, 3).map((r) => (
          <ChangeEntry key={r.id} row={r} tone="build" />
        ))}
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className={styles.stat}>
      <span>{n}</span>
      <em>{label}</em>
    </div>
  );
}

function Tokens({ ds }: { ds: DesignSystem }) {
  const colors = useMemo(() => {
    const semantic = ds.tokens.filter((t) => t.kind === "color" && /^[a-z-]+\/[a-z-]+/.test(t.name) && !/\/\d+$/.test(t.name));
    const picked = KEY_COLORS.map((re) => semantic.find((t) => re.test(t.name))).filter((t): t is NonNullable<typeof t> => !!t);
    return (picked.length >= 4 ? picked : semantic).slice(0, 7);
  }, [ds]);
  const sizes = useMemo(() => {
    const s = [...ds.type].sort((a, b) => b.size - a.size);
    return [s[0], s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)], s.at(-1)].filter((x): x is NonNullable<typeof x> => !!x);
  }, [ds]);
  const radii = ds.tokens.filter((t) => t.kind === "radius" && Number.parseFloat(t.value) <= 32).slice(0, 3);
  return (
    <div className={styles.tokens}>
      <span className={styles.section}>Color</span>
      <div className={styles.swatches}>
        {colors.map((t) => (
          <div key={t.name} className={styles.swatch}>
            <span style={{ background: t.value }} title={`${t.value}${t.dark ? ` · dark ${t.dark}` : ""}`} />
            <em>{t.name}</em>
          </div>
        ))}
      </div>
      <span className={styles.section}>Type · radius · space</span>
      <div className={styles.scale}>
        <div className={styles.type}>
          {sizes.map((t, i) => (
            <span key={i} style={{ fontSize: Math.min(42, t.size), fontWeight: t.weight }} title={`${t.name} · ${t.size}px`}>
              Aa
            </span>
          ))}
          <em>{sizes.map((t) => t.name.split("/")[0]).join(" / ")}</em>
        </div>
        <div className={styles.radii}>
          {radii.map((r) => (
            <div key={r.name}>
              <span style={{ borderTopLeftRadius: Number.parseFloat(r.value) }} />
              <em>r{Number.parseFloat(r.value)}</em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DsProposal({ p, open, onToggle }: { p: ProposalRow; open: boolean; onToggle: () => void }) {
  const d = p.diff as DriftProposal;
  const [value, setValue] = useState(d.to);
  const [rejecting, setRejecting] = useState(false);
  const title = d.kind === "add" ? `New token ${d.token}` : `${d.token}  ${d.from?.replace("px", "")} → ${d.to.replace("px", "")}`;
  return (
    <div className={cx(styles.proposal, d.kind === "change" && styles.proposalChange)}>
      <div className={styles.proposalHead}>
        <span className={cx(styles.chip, d.kind === "change" && styles.hyp)}>{d.kind}</span>
        <div className={styles.proposalText}>
          <span>{title}</span>
          <em>
            {p.rationale} · {d.builds.map((b) => b.title).slice(0, 3).join(", ")}
          </em>
        </div>
        <button type="button" className={d.kind === "change" ? styles.light : styles.button} onClick={onToggle}>
          {open ? "Close" : "Review"}
        </button>
      </div>
      {open && (
        <div className={styles.review}>
          <div className={styles.beforeAfter}>
            <Preview label={`Before · ${d.from ?? "none"}`} kind={d.tokenKind} value={d.from} />
            <Preview label={`After · ${value}`} kind={d.tokenKind} value={value} />
          </div>
          {rejecting ? (
            <div className={styles.row}>
              <span className={styles.ask}>Wrong value, or wrong idea?</span>
              <button type="button" className={styles.button} onClick={run(() => reject(p, "value"))}>
                Wrong value
              </button>
              <button type="button" className={styles.button} onClick={run(() => reject(p, "idea"))}>
                Wrong idea
              </button>
            </div>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={styles.light} onClick={run(() => accept(p, value !== d.to ? value : undefined))}>
                Accept
              </button>
              <input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Edit value" />
              <button type="button" className={styles.button} onClick={() => setRejecting(true)}>
                Reject
              </button>
            </div>
          )}
          <p className={styles.quiet}>Reject asks one question: wrong value, or wrong idea? The answer sharpens the philosophy either way.</p>
        </div>
      )}
    </div>
  );
}

function Preview({ label, kind, value }: { label: string; kind: DriftProposal["tokenKind"]; value: string | undefined }) {
  const px = value ? Number.parseFloat(value) : 0;
  return (
    <div className={styles.preview}>
      <em>{label}</em>
      <div className={styles.previewBox}>
        {kind === "color" ? (
          <span className={styles.previewSwatch} style={{ background: value ?? "transparent" }} />
        ) : kind === "fontSize" ? (
          <span style={{ fontSize: px, color: "var(--text-primary)" }}>Recap card</span>
        ) : (
          [0, 1].map((i) => (
            <span key={i} className={styles.previewCard} style={{ borderRadius: px }}>
              <i />
              <i />
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function ImportDesignSystem({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [tokens, setTokens] = useState(DEFAULTS.dsTokens);
  const [guide, setGuide] = useState(DEFAULTS.dsGuide);
  return (
    <section className={cx(styles.panel, styles.empty)}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={cx(styles.slotLabel, styles.build)}>Slot · design system</span>
          <span className={styles.panelName}>{onCancel ? "Swap system" : "No system slotted"}</span>
          <span className={styles.panelMeta}>import a token reference (markdown tables) and its usage guide · read only to Composer</span>
        </div>
        {onCancel && (
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <Importer
        fields={[
          { label: "Tokens (markdown tables)", value: tokens, set: setTokens },
          { label: "Usage guide (markdown)", value: guide, set: setGuide },
        ]}
        onPaths={([t, g]) =>
          run(async () => {
            const [tm, gm] = await Promise.all([readTextFile(t!), g ? readTextFile(g) : Promise.resolve("")]);
            await importDesignSystem(tm, gm, t!.split("/").slice(-3, -1).join("/") || "markdown");
            onDone();
          })()
        }
        onFiles={(files) =>
          run(async () => {
            const texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
            const hexCount = (s: string) => (s.match(/#[0-9a-fA-F]{6}/g) ?? []).length;
            const sorted = [...texts].sort((a, b) => hexCount(b.text) - hexCount(a.text));
            await importDesignSystem(sorted[0]!.text, sorted[1]?.text ?? "", sorted[0]!.name);
            onDone();
          })()
        }
      />
    </section>
  );
}

/** Paths in the app; a file picker anywhere (and the only option in the browser preview). */
function Importer({ fields, onPaths, onFiles }: { fields: { label: string; value: string; set: (v: string) => void }[]; onPaths: (paths: string[]) => void; onFiles: (files: File[]) => void }) {
  return (
    <div className={styles.importer}>
      {inTauri() &&
        fields.map((f) => (
          <label key={f.label}>
            <span>{f.label}</span>
            <input value={f.value} onChange={(e) => f.set(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
        ))}
      <div className={styles.row}>
        {inTauri() && (
          <button type="button" className={styles.light} onClick={() => onPaths(fields.map((f) => f.value.trim()))}>
            Import
          </button>
        )}
        <label className={styles.button}>
          Choose {fields.length > 1 ? "files" : "file"}…
          <input type="file" accept=".md,.json,.txt" multiple={fields.length > 1} hidden onChange={(e) => e.target.files?.length && onFiles([...e.target.files])} />
        </label>
      </div>
    </div>
  );
}

// ── the improvement loop ──────────────────────────────────────────────────

function LearningPanel() {
  const rules = useCraft((s) => s.rules);
  const all = useCraft((s) => s.proposals);
  const proposals = useMemo(() => all.filter((p) => p.targetKind === "rule" && p.status === "pending"), [all]);
  const reflecting = useCraft((s) => s.reflecting);
  const scoredCount = useCraft((s) => s.scoredCount);
  const [progress, setProgress] = useState<{ phase: string; high: number; low: number }[]>([]);
  useEffect(() => {
    void evidence().then(setProgress);
  }, [scoredCount]);
  return (
    <section className={styles.learning}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={cx(styles.slotLabel, styles.share)}>Memory · learned rules</span>
          <span className={styles.panelName}>Run → Validate → Score → Propose → Approve</span>
          <span className={styles.panelMeta}>
            {scoredCount} scored {scoredCount === 1 ? "run" : "runs"} · {rules.length} {rules.length === 1 ? "rule" : "rules"} kept · needs 5 high and 5 low in a phase before it proposes anything
          </span>
        </div>
        <button type="button" className={styles.button} disabled={reflecting} onClick={() => void reflect()}>
          {reflecting ? "Reflecting…" : "Reflect now"}
        </button>
      </div>
      <div className={styles.learnBody}>
        <div className={styles.evidence}>
          {progress.length === 0 && <p className={styles.quiet}>Score runs from the inspector (1–5). Composer compares what scored high with what scored low.</p>}
          {progress.map((e) => (
            <div key={e.phase} className={styles.evRow}>
              <span className={cx(styles.dot)} style={{ background: `var(--phase-${e.phase})` }} />
              <span>{PHASE_INFO[e.phase as keyof typeof PHASE_INFO].name}</span>
              <em>
                {Math.min(e.high, 5)}/5 high · {Math.min(e.low, 5)}/5 low
              </em>
            </div>
          ))}
        </div>
        <div className={styles.ruleList}>
          {proposals.map((p) => {
            const d = p.diff as RuleDiff;
            return (
              <div key={p.id} className={cx(styles.proposal, styles.proposalChange)}>
                <div className={styles.proposalHead}>
                  <span className={cx(styles.chip, styles.hyp)}>{PHASE_INFO[d.phase].name}</span>
                  <div className={styles.proposalText}>
                    <span>{d.text}</span>
                    <em>
                      {d.stats.highAvg} vs {d.stats.lowAvg} avg · n {d.stats.nHigh}/{d.stats.nLow} · {d.why}
                    </em>
                  </div>
                  <button type="button" className={styles.light} onClick={run(() => accept(p))}>
                    Keep rule
                  </button>
                  <button type="button" className={styles.button} onClick={run(() => notYet(p))}>
                    Not yet
                  </button>
                </div>
              </div>
            );
          })}
          {rules.map((r) => (
            <div key={r.id} className={styles.rule}>
              <span className={styles.chip}>{PHASE_INFO[r.phase].name}</span>
              <span className={styles.ruleBody}>{r.body}</span>
              <button type="button" className={styles.ghost} onClick={run(() => retire(r))}>
                Retire
              </button>
            </div>
          ))}
          {rules.length === 0 && proposals.length === 0 && <p className={styles.quiet}>No rules yet. Nothing goes live without your approval, and every change can be retired here.</p>}
        </div>
      </div>
    </section>
  );
}
