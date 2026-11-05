import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "./story";

export const SANS = "Geist, ui-sans-serif, system-ui, sans-serif";
export const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, monospace";

/** Loads Geist from the render's public folder; the app's player already has it. */
export function Fonts({ enabled }: { enabled: boolean }) {
  const [handle] = useState(() => (enabled ? delayRender("Loading Geist") : null));
  useEffect(() => {
    if (handle === null) return;
    const faces = [new FontFace("Geist", `url(${staticFile("fonts/Geist-Variable.woff2")})`, { weight: "100 900" }), new FontFace("Geist Mono", `url(${staticFile("fonts/GeistMono-Variable.woff2")})`, { weight: "100 900" })];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => loaded.forEach((f) => document.fonts.add(f)))
      .finally(() => continueRender(handle));
  }, [handle]);
  return null;
}

/** The canvas: 28px grid on near-black, with a slow drift so stills don't look frozen. */
export function Backdrop({ accent }: { accent?: string }) {
  const frame = useCurrentFrame();
  const drift = (frame * 0.15) % 28;
  return (
    <AbsoluteFill style={{ background: COLORS.app }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.borderSubtle}66 1px, transparent 1px), linear-gradient(90deg, ${COLORS.borderSubtle}66 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          backgroundPosition: `${drift}px ${drift}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
      {accent && <AbsoluteFill style={{ background: `radial-gradient(circle at 15% 0%, ${accent}22, transparent 45%)` }} />}
    </AbsoluteFill>
  );
}

/** Corner brackets and the running header, like the canvas's technical overlay. */
export function Chrome({ project, index, label, color }: { project: string; index?: string; label?: string; color?: string }) {
  const frame = useCurrentFrame();
  const corner = (pos: CSSProperties): CSSProperties => ({ position: "absolute", width: 22, height: 22, borderColor: COLORS.borderStrong, borderStyle: "solid", borderWidth: 0, ...pos });
  return (
    <AbsoluteFill style={{ fontFamily: MONO, color: COLORS.muted, fontSize: 18, letterSpacing: "0.04em" }}>
      <div style={corner({ left: 40, top: 40, borderLeftWidth: 1.5, borderTopWidth: 1.5 })} />
      <div style={corner({ right: 40, top: 40, borderRightWidth: 1.5, borderTopWidth: 1.5 })} />
      <div style={corner({ left: 40, bottom: 40, borderLeftWidth: 1.5, borderBottomWidth: 1.5 })} />
      <div style={corner({ right: 40, bottom: 40, borderRightWidth: 1.5, borderBottomWidth: 1.5 })} />
      <div style={{ position: "absolute", left: 80, top: 52, display: "flex", gap: 18, textTransform: "uppercase" }}>
        <span style={{ color: COLORS.secondary }}>Design Composer</span>
        <span>/</span>
        <span>{project}</span>
      </div>
      <div style={{ position: "absolute", right: 80, top: 52, display: "flex", gap: 18 }}>
        {label && <span style={{ color: color ?? COLORS.secondary, textTransform: "uppercase" }}>{label}</span>}
        {index && <span>{index}</span>}
        <span>f{String(frame).padStart(4, "0")}</span>
      </div>
    </AbsoluteFill>
  );
}

export function ChapterLabel({ n, title, color }: { n: number; title: string; color: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 200 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: MONO, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", color, opacity: p, transform: `translateX(${(1 - p) * -24}px)` }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, transform: "rotate(45deg)" }} />
      <span>{String(n).padStart(2, "0")} · {title}</span>
      <span style={{ width: 120 * p, height: 1.5, background: `${color}88` }} />
    </div>
  );
}

/** Burned-in caption: the voiceover line, revealed word by word across most of the chapter. */
export function Caption({ text, frames }: { text: string; frames: number }) {
  const frame = useCurrentFrame();
  if (!text) return null;
  const words = text.split(/\s+/);
  const shown = Math.ceil(interpolate(frame, [8, Math.max(9, frames * 0.8)], [0, words.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const fade = interpolate(frame, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 72, opacity: fade }}>
      <div style={{ maxWidth: 1240, padding: "14px 26px", borderRadius: 12, background: "rgba(10,10,11,0.82)", border: `1px solid ${COLORS.borderSubtle}`, fontFamily: SANS, fontSize: 34, lineHeight: 1.35, color: COLORS.text, textAlign: "center" }}>
        {words.map((w, i) => (
          <span key={i} style={{ opacity: i < shown ? 1 : 0.18 }}>
            {w}{" "}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

export function Stage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <AbsoluteFill style={{ padding: "120px 140px 170px", fontFamily: SANS, color: COLORS.text, ...style }}>{children}</AbsoluteFill>;
}
