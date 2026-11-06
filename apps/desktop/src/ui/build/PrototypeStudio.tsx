import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ClaudeNode, TextArtifact } from "@composer/core";
import type { PrototypeData } from "@composer/engine";
import { actions, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { applyTweak, exportHtml, onFrameEvent, prototypeUrl, setMode, type FrameEvent } from "../../prototype/runtime";
import { Button, IconButton, Input, Popover, Tabs, Textarea } from "../primitives";
import { useSize } from "../primitives/useSize";
import styles from "./Build.module.css";

type Mode = "interact" | "tweak" | "note";
type Picked = Extract<FrameEvent, { kind: "pick" }>;
type Point = Extract<FrameEvent, { kind: "point" }>;

const W = 390;
const H = 844;

/** The properties a direct tweak can change, as CSS names the kit applies inline. */
const PROPS: { prop: string; label: string; from: keyof Picked["styles"]; kind: "color" | "text" }[] = [
  { prop: "color", label: "Text color", from: "color", kind: "color" },
  { prop: "background-color", label: "Fill", from: "background", kind: "color" },
  { prop: "font-size", label: "Font size", from: "fontSize", kind: "text" },
  { prop: "font-weight", label: "Weight", from: "fontWeight", kind: "text" },
  { prop: "padding", label: "Padding", from: "padding", kind: "text" },
  { prop: "gap", label: "Gap", from: "gap", kind: "text" },
  { prop: "border-radius", label: "Radius", from: "borderRadius", kind: "text" },
];

/** rgb(1, 2, 3) → #010203, for the color input. */
function toHex(c: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  // eslint-disable-next-line no-restricted-syntax -- a value for the prototype's color input, not a UI color
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000";
  return `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * One variant, large. Interact runs the prototype; Tweak picks an element and changes spacing,
 * color and copy in place, saved without a rerun; Note pins a note to a spot for the next run.
 */
export function PrototypeStudio({ nodeId }: { nodeId: string }) {
  const node = useProject((s) => s.graph.nodes[nodeId]) as ClaudeNode | undefined;
  const out = useProject((s) => s.graph.outputs[nodeId]);
  const art = useProject((s) => (out ? (s.blobs.get(out.hash) as TextArtifact | undefined) : undefined));
  const close = () => useUi.getState().setStudio(null);
  const data = art?.data as PrototypeData | undefined;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>("interact");
  const [screen, setScreen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [point, setPoint] = useState<Point | null>(null);
  const [noteText, setNoteText] = useState("");
  const [reload, setReload] = useState(0);
  // Fit the phone to the studio's own height (below its header), never larger than 1:1.
  const [root, room] = useSize<HTMLDivElement>();
  const scale = room.height ? Math.min(1, (room.height - 60) / H) : 0.75;

  useEffect(() => {
    if (!data || !out) return;
    let alive = true;
    void prototypeUrl(out.hash, data.html).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [out, data]);

  useEffect(
    () =>
      onFrameEvent(
        () => frame.current,
        (e) => {
          if (e.kind === "screen") setScreen(e.name);
          if (e.kind === "ready") setScreen(e.screens[0] ?? null);
          if (e.kind === "pick") {
            setPicked(e);
            setValues({ text: e.text ?? "", ...Object.fromEntries(PROPS.map((p) => [p.prop, e.styles[p.from] ?? ""])) });
          }
          if (e.kind === "point") setPoint(e);
        },
      ),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const notes = useMemo(() => (node?.notes ?? []).filter((n) => n.runId === out?.runId && n.anchor.kind === "point"), [node, out]);

  if (!node || !data || !out) return null;

  const switchMode = (m: Mode) => {
    setModeState(m);
    setPicked(null);
    setPoint(null);
    if (frame.current) void setMode(frame.current, m).catch(() => undefined);
  };

  const change = async (prop: string, label: string, value: string) => {
    if (!picked || !frame.current) return;
    setValues((v) => ({ ...v, [prop]: value }));
    const ok = await applyTweak(frame.current, picked.cid, prop, value).catch(() => false);
    if (ok === false) return;
    const line = prop === "text" ? `${picked.label} copy → “${value.slice(0, 40)}”` : `${picked.label} ${label.toLowerCase()} → ${value}`;
    setChanges((c) => [...c.filter((x) => !x.startsWith(`${picked.label} ${prop === "text" ? "copy" : label.toLowerCase()}`)), line]);
  };

  const save = async () => {
    if (!frame.current || !changes.length) return;
    try {
      const html = await exportHtml(frame.current);
      await actions.saveTweaks(nodeId, html, changes);
      setChanges([]);
      setPicked(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const discard = () => {
    setChanges([]);
    setPicked(null);
    setReload((n) => n + 1);
  };

  return (
    <div ref={root} className={styles.studio} data-phase="build" role="dialog" aria-label={`${node.title} studio`}>
      <header className={styles.studioHead}>
        <span className={styles.studioTitle}>{node.title}</span>
        <span className={styles.meta}>{data.title}</span>
        <Tabs
          variant="segmented"
          size="sm"
          label="Mode"
          className={styles.modes}
          value={mode}
          onChange={switchMode}
          items={(["interact", "tweak", "note"] as Mode[]).map((m) => ({ value: m, label: m === "interact" ? "Interact" : m === "tweak" ? "Tweak" : "Note" }))}
        />
        <span className={styles.fill} />
        <Button variant="secondary" size="sm" onClick={close}>
          Close
        </Button>
      </header>
      <div className={styles.studioBody}>
        <div className={styles.stage} style={{ width: W * scale, height: H * scale }}>
          {url && (
            <iframe
              key={reload}
              ref={frame}
              title={data.title}
              src={url}
              sandbox="allow-scripts"
              style={{ width: W, height: H, transform: `scale(${scale})` }}
              onLoad={() => frame.current && mode !== "interact" && void setMode(frame.current, mode).catch(() => undefined)}
            />
          )}
          {notes
            .filter((n) => n.anchor.kind === "point" && (!n.anchor.screen || !screen || n.anchor.screen === screen))
            .map((n, i) =>
              n.anchor.kind === "point" ? (
                <span key={n.id} className={styles.pin} style={{ left: n.anchor.x * scale, top: n.anchor.y * scale }} title={n.text}>
                  {i + 1}
                </span>
              ) : null,
            )}
          {point && (
            <Popover className={styles.pinForm} style={{ left: Math.min(point.x * scale, W * scale - 275), top: point.y * scale + 18 }}>
              <form
                className={styles.pinFields}
                onSubmit={(e) => {
                  e.preventDefault();
                  actions.addNote(nodeId, { kind: "point", x: point.x, y: point.y, ...(point.screen ? { screen: point.screen } : {}), element: point.element }, noteText);
                  setNoteText("");
                  setPoint(null);
                }}
              >
                <span className={styles.meta}>{point.element}</span>
                <Input size="sm" autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Note for the next run" />
                <div className={styles.row}>
                  <Button variant="secondary" size="sm" onClick={() => setPoint(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="phase" size="sm" disabled={!noteText.trim()}>
                    Pin note
                  </Button>
                </div>
              </form>
            </Popover>
          )}
        </div>

        <aside className={styles.panel}>
          {mode === "interact" && (
            <>
              <span className="caps">Interact</span>
              <p className={styles.hint}>The prototype runs on Composer's interaction kit: screens, sheets, tabs, toggles and sample data, with nothing reaching the network.</p>
              {screen && <p className={styles.meta}>Screen · {screen}</p>}
              <span className="caps">Screens</span>
              <ul className={styles.screens}>
                {data.screens.map((s) => (
                  <li key={s.name}>
                    <b>{s.name}</b> {s.purpose}
                  </li>
                ))}
              </ul>
            </>
          )}
          {mode === "tweak" && (
            <>
              <span className="caps">Tweak · no rerun</span>
              {!picked && <p className={styles.hint}>Click any element to change its copy, color or spacing. Saving keeps this run and records what you changed.</p>}
              {picked && (
                <div className={styles.props}>
                  <p className={styles.picked}>{picked.label}</p>
                  {picked.leaf && (
                    <label>
                      <span>Copy</span>
                      <Textarea size="sm" rows={2} value={values.text ?? ""} onChange={(e) => void change("text", "Copy", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                    </label>
                  )}
                  {PROPS.map((p) => (
                    <label key={p.prop}>
                      <span>{p.label}</span>
                      {p.kind === "color" ? (
                        <input type="color" className={styles.colorInput} value={toHex(values[p.prop] ?? "")} onChange={(e) => void change(p.prop, p.label, e.target.value)} />
                      ) : (
                        <Input size="sm" value={values[p.prop] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [p.prop]: e.target.value }))} onBlur={(e) => void change(p.prop, p.label, e.target.value)} onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") void change(p.prop, p.label, (e.target as HTMLInputElement).value);
                        }} />
                      )}
                    </label>
                  ))}
                </div>
              )}
              {changes.length > 0 && (
                <>
                  <span className="caps">{changes.length} change{changes.length === 1 ? "" : "s"}</span>
                  <ul className={styles.changes}>
                    {changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className={styles.row}>
                <Button variant="secondary" size="sm" disabled={!changes.length} onClick={discard}>
                  Discard
                </Button>
                <span className={styles.fill} />
                <Button variant="phase" size="sm" disabled={!changes.length} onClick={() => void save()}>
                  Save tweaks
                </Button>
              </div>
            </>
          )}
          {mode === "note" && (
            <>
              <span className="caps">Notes · ride into the next run</span>
              <p className={styles.hint}>Click a spot on the prototype to pin a note there. The next run of this variant reads every note as a heavy document, with the screen and element it points at.</p>
              <ol className={styles.notes}>
                {notes.map((n) => (
                  <li key={n.id}>
                    <span>
                      {n.text}
                      {n.anchor.kind === "point" && <em>{[n.anchor.screen, n.anchor.element].filter(Boolean).join(" · ")}</em>}
                    </span>
                    <IconButton icon={X} label="Remove note" size="sm" onClick={() => actions.removeNote(nodeId, n.id)} />
                  </li>
                ))}
              </ol>
              {notes.length > 0 && (
                <Button variant="phase" size="sm" onClick={() => actions.run(nodeId)}>
                  Rerun with {notes.length} note{notes.length === 1 ? "" : "s"}
                </Button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
