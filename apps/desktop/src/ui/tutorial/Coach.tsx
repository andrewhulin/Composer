import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ClaudeNode, GraphNode, OutputNode, SourceNode } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi, type Panel } from "../../store/ui";
import { openFoundations, useCraft } from "../../store/craft";
import { ingestText } from "../../app/ingest";
import { STEPS, progress, stepDef, type StepId, type TutorialContext } from "../../tutorial/steps";
import { tutorial, useTutorial } from "../../tutorial/store";
import { SAMPLE_INTERVIEW, SAMPLE_TITLE } from "../../tutorial/sample";
import { Check } from "lucide-react";
import { cx } from "../primitives/cx";
import { Button } from "../primitives/Button";
import { Badge } from "../primitives/Chip";
import { Input } from "../primitives/Field";
import { Icon } from "../primitives/Icon";
import { place, type Rect } from "./place";
import styles from "./Coach.module.css";

const nodeSel = (n: GraphNode | undefined) => (n ? `.react-flow__node[data-id="${n.id}"]` : null);

/** Panels a step points into. The guide opens them rather than ringing something hidden. */
const NEEDS: Partial<Record<StepId, Panel[]>> = { foundations: ["left"], run: ["right"], score: ["right"], lock: ["right"], define: ["right"], tour: ["bottom"] };

/** The app's current pieces the guide points at and acts on. */
function pieces() {
  const p = useProject.getState();
  const inLoop = Object.values(p.graph.nodes).filter((n) => n.loop === p.loop);
  const of = (phase: string) => inLoop.filter((n) => n.phase === phase);
  return {
    selection: p.selection,
    activePhase: p.activePhase,
    source: of("understand").find((n): n is SourceNode => n.kind === "source"),
    synth: of("understand").find((n): n is ClaudeNode => n.kind === "claude"),
    understandOut: of("understand").find((n): n is OutputNode => n.kind === "output" && n.mode === "output"),
    draft: of("define").find((n): n is ClaudeNode => n.kind === "claude"),
    defineOut: of("define").find((n): n is OutputNode => n.kind === "output" && n.mode === "output"),
    ran: (n: ClaudeNode | undefined) => !!n && p.lastRuns[n.id]?.status === "succeeded",
  };
}

/** What to ring for each step, given where the person is right now. */
function targetFor(step: StepId): string | null {
  const ui = useUi.getState();
  const x = pieces();
  switch (step) {
    case "key":
      return ui.settingsOpen ? '[data-tour="settings-key"]' : null;
    case "connect":
      return ui.settingsOpen ? '[data-tour="settings-sources"]' : null;
    case "foundations":
      return useCraft.getState().open ? null : '[data-tour="foundations"]';
    case "name":
      return '[data-tour="project-name"]';
    case "context":
      return x.activePhase === "understand" ? '[data-tour="canvas"]' : '[data-tour="phase-rail"]';
    case "weigh":
      return nodeSel(x.source);
    case "run":
      return x.selection === x.synth?.id ? '[data-tour="primary-action"]' : nodeSel(x.synth);
    case "score":
      return document.querySelector('[data-tour="score"]') ? '[data-tour="score"]' : nodeSel(x.synth);
    case "lock":
      return x.selection === x.understandOut?.id ? '[data-tour="primary-action"]' : nodeSel(x.understandOut);
    case "define":
      if (x.activePhase !== "define") return '[data-tour="phase-rail"]';
      if (x.ran(x.draft) && document.querySelector('[data-tour="lock-statement"]')) return '[data-tour="lock-statement"]';
      return x.selection === x.draft?.id ? '[data-tour="primary-action"]' : nodeSel(x.draft);
    case "tour":
      return '[data-tour="history"]';
    default:
      return null;
  }
}

/** Follows the target as the canvas pans, panels open and nodes move. */
function useTargetRect(step: StepId | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      const sel = targetFor(step);
      const el = sel ? document.querySelector(sel) : null;
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null;
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setRect(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);
  return rect;
}

/** First-run guide: one step at a time, pointing at the real control, ticking itself off as you go. */
export function Coach() {
  const state = useTutorial((s) => s.state);
  const ctx = useTutorial((s) => s.ctx);
  const justDone = useTutorial((s) => s.justDone);
  const active = state?.status === "active";
  const step = active ? state.step : null;
  const rect = useTargetRect(step);
  useEffect(() => {
    const need = step ? NEEDS[step] : undefined;
    if (need) useUi.getState().setPanels(Object.fromEntries(need.map((p) => [p, true])));
  }, [step]);
  const card = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(260);
  // Placement needs the card's real height, which changes with each step's copy.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    setH(el.offsetHeight);
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  if (!active || !step) return null;
  const def = stepDef(step);
  const prog = progress(state);
  const centered = step === "welcome" || step === "done";
  const pos = place(centered ? null : rect, h, centered);
  const complete = justDone === step || (def.done?.(ctx) ?? false);
  const ring = !centered && rect ? { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 } : null;
  return (
    <>
      {centered && <div className={styles.scrim} />}
      {ring && <div className={cx(styles.ring, complete && styles.ringDone)} style={ring} aria-hidden />}
      <div ref={card} className={cx(styles.card, complete && styles.cardDone)} style={pos} role="dialog" aria-label={`Guide: ${def.title}`}>
        <div className={styles.head}>
          <span className={styles.part}>
            {prog.part} · {prog.index} of {prog.total}
            {def.optional && (
              <Badge tone="neutral" className={styles.optional}>
                optional
              </Badge>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={tutorial.pause} title="Leave the guide. Resume it from the title bar or ⌘K.">
            Exit guide
          </Button>
        </div>
        <div className={styles.bar} aria-hidden>
          {STEPS.map((s) => (
            <span key={s.id} className={cx(state.completed.includes(s.id) && styles.barDone, state.skipped.includes(s.id) && styles.barSkipped, s.id === step && styles.barNow)} />
          ))}
        </div>
        <h2 className={styles.title}>
          {complete && (
            <span className={styles.check}>
              <Icon icon={Check} size="sm" />
            </span>
          )}
          {def.title}
        </h2>
        {def.body.split("\n\n").map((para, i) => (
          <p key={i} className={styles.body}>
            {para}
          </p>
        ))}
        <StepActions step={step} ctx={ctx} />
        <div className={styles.foot}>
          {prog.overall > 1 && (
            <Button variant="ghost" size="sm" onClick={tutorial.back}>
              Back
            </Button>
          )}
          <span className={styles.fill} />
          {step === "welcome" ? (
            <>
              <Button variant="ghost" size="sm" onClick={tutorial.pause}>
                Not now
              </Button>
              <Button variant="primary" size="sm" onClick={tutorial.next}>
                Start
              </Button>
            </>
          ) : step === "done" ? (
            <Button variant="primary" size="sm" onClick={tutorial.next}>
              Finish
            </Button>
          ) : def.done && !complete ? (
            <Button variant="ghost" size="sm" onClick={tutorial.skip}>
              {def.optional ? "Skip for now" : "Skip"}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={tutorial.next}>
              Next
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Action({ children, onClick, primary, shortcut }: { children: ReactNode; onClick: () => void; primary?: boolean; shortcut?: string }) {
  return (
    <Button variant={primary ? "tint" : "secondary"} size="sm" shortcut={shortcut} onClick={onClick}>
      {children}
    </Button>
  );
}

/** The step's own controls: the thing to do, done for you if you'd rather. */
function StepActions({ step, ctx }: { step: StepId; ctx: TutorialContext }) {
  const ui = useUi();
  const project = useProject((s) => s.project);
  const [name, setName] = useState("");
  const x = pieces();
  const status = (ok: boolean, yes: string, no: string) => (
    <span className={cx(styles.status, ok && styles.statusOk)}>
      {ok ? (
        <>
          <Icon icon={Check} size="sm" />
          {yes}
        </>
      ) : (
        no
      )}
    </span>
  );
  switch (step) {
    case "key":
      return (
        <div className={styles.acts}>
          {!ui.settingsOpen && (
            <Action primary shortcut="⌘," onClick={() => ui.openSettings("connectors", "anthropic")}>
              Open Settings
            </Action>
          )}
          {status(ctx.hasKey, "Key saved in Keychain", "Waiting for a key…")}
        </div>
      );
    case "foundations":
      return (
        <div className={styles.acts}>
          {!useCraft.getState().open && (
            <Action primary onClick={() => openFoundations()}>
              Open Foundations
            </Action>
          )}
          {status(ctx.dsSlotted || ctx.philosophySlotted, "Slotted", "Nothing slotted yet")}
        </div>
      );
    case "connect":
      return (
        <div className={styles.acts}>
          {!ui.settingsOpen && (
            <Action primary onClick={() => ui.openSettings("connectors", "linear")}>
              Open Settings
            </Action>
          )}
          {status(ctx.connectorTokens > 0, `${ctx.connectorTokens} connected`, "No tokens yet")}
        </div>
      );
    case "name":
      return (
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void actions.renameProject(name.trim());
          }}
        >
          <Input value={name} placeholder={project?.name ?? "Name"} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Problem name" />
          <Button type="submit" variant="tint" size="sm" disabled={!name.trim()}>
            Name it
          </Button>
        </form>
      );
    case "context":
      return (
        <div className={styles.acts}>
          {x.activePhase !== "understand" ? (
            <Action primary onClick={() => void actions.setActivePhase("understand")}>
              Go to Understand
            </Action>
          ) : (
            <Action primary onClick={() => void actions.addSource(ingestText(SAMPLE_INTERVIEW, SAMPLE_TITLE))}>
              Use a sample interview
            </Action>
          )}
        </div>
      );
    case "weigh":
      return x.source ? (
        <div className={styles.acts}>
          <Action
            primary
            shortcut="W"
            onClick={() => {
              actions.select(x.source!.id);
              actions.setWeight(x.source!.id, "heavy");
            }}
          >
            Make “{x.source.title.length > 22 ? `${x.source.title.slice(0, 20)}…` : x.source.title}” heavy
          </Action>
        </div>
      ) : null;
    case "run":
      return x.synth ? (
        <div className={styles.acts}>
          <Action
            primary
            shortcut="⌘↵"
            onClick={() => {
              actions.select(x.synth!.id);
              actions.run(x.synth!.id);
            }}
          >
            Run Synthesize insights
          </Action>
        </div>
      ) : null;
    case "score":
      return x.synth && x.selection !== x.synth.id ? (
        <div className={styles.acts}>
          <Action primary onClick={() => actions.select(x.synth!.id)}>
            Show the run
          </Action>
        </div>
      ) : null;
    case "lock":
      return x.understandOut ? (
        <div className={styles.acts}>
          <Action
            primary
            shortcut="⌘L"
            onClick={() => {
              actions.select(x.understandOut!.id);
              void actions.lock(x.understandOut!.id);
            }}
          >
            Lock weighted context
          </Action>
        </div>
      ) : null;
    case "define":
      return (
        <div className={styles.acts}>
          {x.activePhase !== "define" ? (
            <Action primary onClick={() => void actions.setActivePhase("define")}>
              Go to Define
            </Action>
          ) : !x.ran(x.draft) ? (
            x.draft && (
              <Action
                primary
                shortcut="⌘↵"
                onClick={() => {
                  actions.select(x.draft!.id);
                  actions.run(x.draft!.id);
                }}
              >
                Run Draft statement
              </Action>
            )
          ) : (
            x.defineOut && (
              <Action
                primary
                onClick={() => {
                  actions.select(x.draft!.id);
                  void actions.lockStatement(x.defineOut!.id);
                }}
              >
                Lock this statement
              </Action>
            )
          )}
        </div>
      );
    default:
      return null;
  }
}

/** Title-bar pill while the guide is paused: where you were, and a way back in. */
export function GuidePill() {
  const state = useTutorial((s) => s.state);
  if (!state || state.status !== "paused") return null;
  const p = progress(state);
  return (
    <button type="button" className={styles.pill} onClick={tutorial.resume} title="Resume the guide">
      Guide · {p.overall} of {p.overallTotal} <span>Resume</span>
    </button>
  );
}
