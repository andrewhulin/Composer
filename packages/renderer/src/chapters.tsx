import { useCallback, useState } from "react";
import { AbsoluteFill, Easing, IFrame, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ChapterLabel, MONO, SANS, Stage } from "./chrome";
import { formatMetric, layoutProcess, parseMetric, revealFrame, type PlacedNode } from "./process";
import { COLORS, HEIGHT, PHASES, WIDTH, type Part, type ProcessGraph, type Story, type StoryProps } from "./story";

const PHASE_NAMES = { understand: "Understand", define: "Define", build: "Build", validate: "Validate", share: "Share" } as const;
const PART_COLOR: Record<Part, string> = { who: COLORS.phase.understand, behavior: COLORS.phase.build, because: COLORS.hypothesis, metric: COLORS.phase.validate };

export function TitleCard({ story, loops }: { story: Story; loops: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  const q = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  return (
    <Stage style={{ justifyContent: "center", gap: 28 }}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.08em", color: COLORS.muted, textTransform: "uppercase", opacity: p }}>
        Release story · {loops} {loops === 1 ? "loop" : "loops"}
      </div>
      <div style={{ fontSize: 108, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.02, opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>{story.title}</div>
      <div style={{ fontSize: 40, color: COLORS.secondary, maxWidth: 1300, lineHeight: 1.3, opacity: q, transform: `translateY(${(1 - q) * 20}px)` }}>{story.logline}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        {PHASES.map((ph, i) => {
          const s = spring({ frame: frame - 14 - i * 4, fps, config: { damping: 200 } });
          return <div key={ph} style={{ width: 96, height: 6, borderRadius: 3, background: COLORS.phase[ph], opacity: s, transform: `scaleX(${s})`, transformOrigin: "left" }} />;
        })}
      </div>
    </Stage>
  );
}

export function Problem({ story }: { story: Story }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = story.problem.quote.split(/\s+/);
  const size = story.problem.quote.length > 140 ? 56 : story.problem.quote.length > 80 ? 68 : 84;
  const who = spring({ frame: frame - 10 - words.length * 3, fps, config: { damping: 200 } });
  return (
    <Stage style={{ gap: 48 }}>
      <ChapterLabel n={1} title="The problem" color={COLORS.phase.understand} />
      <div style={{ position: "relative", fontSize: size, fontWeight: 500, lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: 1500 }}>
        <span style={{ position: "absolute", left: -64, top: -18, fontSize: size * 1.6, color: COLORS.phase.understand, opacity: 0.8 }}>“</span>
        {words.map((w, i) => {
          const s = spring({ frame: frame - 6 - i * 3, fps, config: { damping: 18, stiffness: 160 } });
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: s, transform: `translateY(${(1 - s) * 22}px)`, filter: `blur(${(1 - s) * 6}px)` }}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: who, transform: `translateX(${(1 - who) * -16}px)` }}>
        <span style={{ fontFamily: MONO, fontSize: 26, color: COLORS.phase.understand }}>— {story.problem.who}</span>
        {story.problem.context && <span style={{ fontSize: 30, color: COLORS.secondary, maxWidth: 1300, lineHeight: 1.35 }}>{story.problem.context}</span>}
      </div>
    </Stage>
  );
}

/** A node in the graph's own units; the camera's zoom is what makes it readable. */
function MiniNode({ n, shown, font }: { n: PlacedNode; shown: number; font: number }) {
  const color = COLORS.phase[n.phase];
  const isClaude = n.kind === "claude";
  const isHyp = n.kind === "hypothesis";
  const u = font / 15;
  return (
    <div
      style={{
        position: "absolute",
        left: n.px,
        top: n.py,
        width: n.w,
        height: n.h,
        borderRadius: 7 * u,
        background: isHyp ? "#1d1a10" : COLORS.panel,
        border: `${1.2 * u}px solid ${isClaude ? `${color}cc` : isHyp ? `${COLORS.hypothesis}99` : COLORS.borderStrong}`,
        boxShadow: isClaude ? `0 0 ${18 * u * shown}px ${color}33` : "none",
        opacity: shown,
        transform: `scale(${0.85 + 0.15 * shown})`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 * u, padding: `${6 * u}px ${8 * u}px`, borderBottom: `${u}px solid ${COLORS.borderSubtle}` }}>
        <span style={{ width: 7 * u, height: 7 * u, marginTop: font * 0.32, borderRadius: n.kind === "output" ? 1.5 * u : "50%", background: isHyp ? COLORS.hypothesis : color, flex: "none" }} />
        <span style={{ fontFamily: SANS, fontSize: font, fontWeight: 500, lineHeight: 1.15, color: COLORS.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.title}</span>
      </div>
      <div style={{ flex: 1, padding: 8 * u, display: "flex", flexDirection: "column", gap: 5 * u }}>
        {[0.9, 0.7, 0.5].map((w, i) => (
          <span key={i} style={{ height: 4 * u, width: `${w * 100}%`, borderRadius: 2 * u, background: i === 0 && isClaude ? `${color}55` : COLORS.raised }} />
        ))}
      </div>
    </div>
  );
}

const center = (n: PlacedNode) => ({ x: n.px + n.w / 2, y: n.py + n.h / 2 });

/**
 * The real graph rebuilding itself in creation order. A camera follows each new node at a zoom
 * where titles read, then pulls back to the whole graph for the last quarter.
 */
export function Process({ graph, caption, frames }: { graph: ProcessGraph; caption: string; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const box = { width: WIDTH - 280, height: HEIGHT - 460 };
  const layout = layoutProcess(graph, box);
  const count = layout.nodes.length;
  const at = (n: PlacedNode) => revealFrame(n.order, count, frames);
  const shownOf = (n: PlacedNode) => spring({ frame: frame - at(n), fps, config: { damping: 20, stiffness: 180 } });
  const done = layout.nodes.filter((n) => frame >= at(n)).length;
  const latest = layout.nodes[Math.max(0, done - 1)];

  // Zoom so a Claude node is about 230px wide on screen, but never zoom out past the overview.
  const deep = Math.min(3.5, Math.max(1, 230 / (256 * layout.scale)));
  const pull = frames * 0.78;
  const zoom = interpolate(frame, [0, 14, pull, pull + 26], [deep * 0.92, deep, deep, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const back = interpolate(frame, [pull, pull + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  let cam = { x: box.width / 2, y: box.height / 2 };
  if (latest) {
    const prev = layout.nodes[Math.max(0, latest.order - 1)]!;
    const t = spring({ frame: frame - at(latest), fps, config: { damping: 200 } });
    const a = center(prev);
    const b = center(latest);
    cam = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  // At full zoom the camera can't show past the graph's edges; ease toward the middle as it pulls back.
  cam = { x: cam.x + (box.width / 2 - cam.x) * back, y: cam.y + (box.height / 2 - cam.y) * back };
  const font = 22 / deep;
  return (
    <Stage style={{ gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <ChapterLabel n={2} title="The process" color={latest ? COLORS.phase[latest.phase] : COLORS.secondary} />
        <span style={{ fontFamily: MONO, fontSize: 22, color: COLORS.muted }}>
          {latest ? `${PHASE_NAMES[latest.phase].toUpperCase()} · LOOP ${latest.loop} · ` : ""}
          {String(done).padStart(2, "0")} / {String(count).padStart(2, "0")} nodes
        </span>
      </div>
      <div style={{ position: "relative", width: box.width, height: box.height + 40, overflow: "hidden", borderRadius: 12 }}>
        <div style={{ position: "absolute", left: 0, top: 40, width: box.width, height: box.height, transformOrigin: "0 0", transform: `translate(${box.width / 2 - cam.x * zoom}px, ${box.height / 2 - cam.y * zoom}px) scale(${zoom})` }}>
          {layout.regions.map((r) => (
            <div key={r.phase} style={{ position: "absolute", left: Math.max(0, r.x), top: -8, width: r.w, height: box.height + 16, borderLeft: `${1 / zoom}px dashed ${COLORS.borderSubtle}` }}>
              <span style={{ position: "absolute", left: 10 / zoom, top: -26 / zoom, fontFamily: MONO, fontSize: 18 / zoom, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.phase[r.phase] }}>{PHASE_NAMES[r.phase]}</span>
            </div>
          ))}
          <svg width={box.width} height={box.height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
            {layout.edges.map((e, i) => {
              const start = Math.max(at(e.from), at(e.to));
              const p = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const x1 = e.from.px + e.from.w;
              const y1 = e.from.py + e.from.h / 2;
              const x2 = e.to.px;
              const y2 = e.to.py + e.to.h / 2;
              const dx = Math.max(12, Math.abs(x2 - x1) / 2);
              const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
              return <path key={i} d={d} pathLength={1} fill="none" stroke={COLORS.phase[e.to.phase]} strokeOpacity={0.75} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeDasharray="1" strokeDashoffset={1 - p} />;
            })}
          </svg>
          {layout.nodes.map((n) => (
            <MiniNode key={n.id} n={n} shown={shownOf(n)} font={font} />
          ))}
        </div>
      </div>
      {caption && <div style={{ fontSize: 30, color: COLORS.secondary }}>{caption}</div>}
    </Stage>
  );
}

type Rects = Partial<Record<Part, { x: number; y: number }>>;
const DEVICE = { w: 390, h: 844 };

export function Ui({ story, prototype, frames }: { story: Story; prototype: StoryProps["prototype"]; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [rects, setRects] = useState<Rects>({});
  const beats = story.ui.beats;
  const per = beats.length ? (frames - 30) / beats.length : frames;
  const active = Math.min(beats.length - 1, Math.max(0, Math.floor((frame - 15) / per)));
  const scale = 0.8;
  const onLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    // Same-origin only (the embedded HTML in renders); a cross-origin player keeps the fallback path.
    try {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;
      const found: Rects = {};
      for (const part of ["who", "behavior", "because", "metric"] as Part[]) {
        const el = doc.querySelector(`[data-part="${part}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        found[part] = { x: Math.min(DEVICE.w - 20, r.left + r.width / 2), y: Math.min(DEVICE.h - 20, r.top + Math.min(r.height / 2, 40)) };
      }
      setRects(found);
    } catch {
      /* cross-origin */
    }
  }, []);
  const target = (i: number) => {
    const b = beats[i];
    const r = b ? rects[b.part] : undefined;
    return r ?? { x: DEVICE.w * (0.35 + 0.3 * (i % 2)), y: DEVICE.h * (0.22 + 0.16 * i) };
  };
  const step = Math.max(0, frame - 15 - active * per);
  const move = spring({ frame: step, fps, config: { damping: 22, stiffness: 120 } });
  const prev = target(Math.max(0, active - 1));
  const next = target(active);
  const cx = prev.x + (next.x - prev.x) * move;
  const cy = prev.y + (next.y - prev.y) * move;
  const tap = interpolate(step, [14, 18, 26], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const enter = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Stage style={{ gap: 28 }}>
      <ChapterLabel n={3} title="The UI" color={COLORS.phase.build} />
      <div style={{ display: "flex", gap: 90, alignItems: "flex-start", flex: 1 }}>
        <div style={{ position: "relative", flex: "none", width: DEVICE.w * scale + 28, height: DEVICE.h * scale + 28, padding: 14, borderRadius: 56, background: "#050506", border: `1.5px solid ${COLORS.borderStrong}`, boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px ${COLORS.phase.build}22`, opacity: enter, transform: `translateY(${(1 - enter) * 40}px)` }}>
          <div style={{ position: "relative", width: DEVICE.w * scale, height: DEVICE.h * scale, borderRadius: 44, overflow: "hidden", background: "#fff" }}>
            {prototype ? (
              <div style={{ width: DEVICE.w, height: DEVICE.h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                {prototype.src ? (
                  <IFrame src={prototype.src} sandbox="allow-scripts" style={{ width: DEVICE.w, height: DEVICE.h, border: 0 }} />
                ) : (
                  <IFrame srcDoc={prototype.html} onLoad={onLoad} style={{ width: DEVICE.w, height: DEVICE.h, border: 0 }} />
                )}
              </div>
            ) : (
              <AbsoluteFill style={{ background: COLORS.raised, alignItems: "center", justifyContent: "center", fontFamily: MONO, color: COLORS.muted }}>no prototype locked</AbsoluteFill>
            )}
            {beats.length > 0 && (
              <div style={{ position: "absolute", left: cx * scale, top: cy * scale, pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: -22, top: -22, width: 44, height: 44, borderRadius: "50%", border: `2px solid ${PART_COLOR[beats[active]!.part]}`, opacity: tap, transform: `scale(${0.6 + tap * 0.8})` }} />
                <svg width="28" height="28" viewBox="0 0 24 24" style={{ position: "absolute", left: -4, top: -2, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
                  <path d="M4 2 L4 19 L8.5 14.5 L11.5 21 L14 20 L11 13.5 L17 13.5 Z" fill="#0b0b0a" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, paddingTop: 20 }}>
          {story.ui.caption && <div style={{ fontSize: 34, lineHeight: 1.3, color: COLORS.text, marginBottom: 12 }}>{story.ui.caption}</div>}
          {beats.map((b, i) => {
            const on = i === active;
            const seen = i <= active;
            return (
              <div key={i} style={{ display: "flex", gap: 18, alignItems: "baseline", padding: "16px 20px", borderRadius: 12, border: `1px solid ${on ? `${PART_COLOR[b.part]}88` : COLORS.borderSubtle}`, background: on ? `${PART_COLOR[b.part]}14` : "rgba(238,237,234,0.02)", opacity: seen ? 1 : 0.35 }}>
                <span style={{ fontFamily: MONO, fontSize: 20, color: PART_COLOR[b.part], minWidth: 110, textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.part}</span>
                <span style={{ fontSize: 28, lineHeight: 1.3, color: seen ? COLORS.text : COLORS.secondary }}>{b.note}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Stage>
  );
}

export function Proof({ story }: { story: Story }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Stage style={{ gap: 40 }}>
      <ChapterLabel n={4} title="The proof" color={COLORS.phase.validate} />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, story.proof.metrics.length))}, 1fr)`, gap: 28 }}>
        {story.proof.metrics.map((m, i) => {
          const s = spring({ frame: frame - 8 - i * 10, fps, config: { damping: 200 } });
          const count = interpolate(frame, [12 + i * 10, 42 + i * 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const parsed = parseMetric(m.value);
          const value = parsed ? formatMetric(parsed, count) : m.value;
          const tone = m.met === "yes" ? COLORS.live : m.met === "no" ? COLORS.phase.define : COLORS.muted;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 18, padding: "30px 32px", borderRadius: 16, background: COLORS.panel, border: `1px solid ${COLORS.borderSubtle}`, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
              <span style={{ fontSize: 28, color: COLORS.secondary, lineHeight: 1.3 }}>{m.label}</span>
              <span style={{ fontSize: 120, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: tone, fontVariantNumeric: "tabular-nums" }}>{value}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 22, color: COLORS.muted }}>
                <span>target {m.target}</span>
                <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 6, background: `${tone}22`, color: tone, opacity: count }}>{m.met === "yes" ? "✓ met" : m.met === "no" ? "✕ missed" : "? open"}</span>
              </div>
            </div>
          );
        })}
      </div>
      {story.proof.caption && <div style={{ fontSize: 34, color: COLORS.secondary, maxWidth: 1400, lineHeight: 1.35 }}>{story.proof.caption}</div>}
    </Stage>
  );
}

export function EndCard({ title, loops }: { title: string; loops: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  return (
    <Stage style={{ justifyContent: "center", alignItems: "center", gap: 26, textAlign: "center" }}>
      <div style={{ fontSize: 128, fontWeight: 600, letterSpacing: "-0.04em", color: COLORS.phase.share, opacity: p, transform: `scale(${0.94 + p * 0.06})` }}>Shipped.</div>
      <div style={{ fontSize: 36, color: COLORS.secondary, opacity: p }}>{title}</div>
      <div style={{ fontFamily: MONO, fontSize: 22, color: COLORS.muted, letterSpacing: "0.05em", opacity: p }}>
        UNDERSTAND → DEFINE → BUILD → VALIDATE → SHARE · {loops} {loops === 1 ? "LOOP" : "LOOPS"}
      </div>
    </Stage>
  );
}
