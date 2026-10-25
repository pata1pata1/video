import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { usePop } from "./components";
import { PATTERN } from "./pattern";
import { color, font, neon } from "./theme";

/**
 * HUD parts for a pattern with design.hud (pattern-02): panels with cut
 * corners, corner brackets, rotating rings and a scan line. A pattern without
 * design.panel gets a plain rounded card from <Box>.
 */
const D = PATTERN.design;

const cutCorners = (cut: number) => `polygon(${cut}px 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%, 0 ${cut}px)`;

/**
 * A card: a HUD panel (top-left and bottom-right corners cut, a 2 px edge in
 * `edge`, glowing when `lit`), or a white rounded card with a border.
 * `style` places the card (size, margin, opacity, transform); `inner` lays out its content.
 */
export const Box: React.FC<{ edge: string; lit?: boolean; radius: number; style?: React.CSSProperties; inner?: React.CSSProperties; children: React.ReactNode }> = ({
  edge,
  lit = false,
  radius,
  style,
  inner,
  children,
}) => {
  if (!D.panel) {
    return <div style={{ ...style, ...inner, background: color.card, border: `2px solid ${edge}`, borderRadius: radius }}>{children}</div>;
  }
  const clip = cutCorners(D.panel.cut);
  // the edge is the outer shape showing 2 px around the inner one; drop-shadow glows outside the clip
  return (
    <div style={{ ...style, filter: lit ? `drop-shadow(0 0 10px ${edge}99)` : undefined }}>
      <div style={{ height: "100%", padding: 2, background: edge, clipPath: clip, boxSizing: "border-box" }}>
        <div style={{ height: "100%", background: D.panel.fill, clipPath: clip, boxSizing: "border-box", ...inner }}>{children}</div>
      </div>
    </div>
  );
};

/** Thin L-shaped marks in the four corners of the screen (above the subtitle area's bottom). */
export const Brackets: React.FC = () => {
  const p = usePop(0);
  const arm = 44;
  const at = 26;
  const line = `2px solid ${color.accent}`;
  const corner = (s: React.CSSProperties) => <div style={{ position: "absolute", width: arm, height: arm, opacity: 0.55 * p, ...s }} />;
  return (
    <>
      {corner({ left: at, top: at, borderLeft: line, borderTop: line })}
      {corner({ right: at, top: at, borderRight: line, borderTop: line })}
      {corner({ left: at, bottom: at, borderLeft: line, borderBottom: line })}
      {corner({ right: at, bottom: at, borderRight: line, borderBottom: line })}
    </>
  );
};

/** One bright line that sweeps down the screen once, from `start` for `frames`. */
export const ScanLine: React.FC<{ start?: number; frames?: number }> = ({ start = 0, frames = 36 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (t <= 0 || t >= 1) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${t * 100}%`,
          height: 120,
          transform: "translateY(-100%)",
          background: `linear-gradient(180deg, rgba(41,227,255,0) 0%, ${color.accent}33 85%, ${color.accent} 100%)`,
          opacity: 1 - t * 0.6,
        }}
      />
    </AbsoluteFill>
  );
};

/** Ticks around a circle of radius r (every `step` degrees, longer every `major`). */
const Ticks: React.FC<{ r: number; step: number; major: number; stroke: string }> = ({ r, step, major, stroke }) => (
  <g>
    {Array.from({ length: 360 / step }, (_, i) => {
      const a = (i * step * Math.PI) / 180;
      const long = (i * step) % major === 0;
      const r2 = r - (long ? 18 : 8);
      return <line key={i} x1={Math.cos(a) * r} y1={Math.sin(a) * r} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} stroke={stroke} strokeWidth={long ? 3 : 1.5} />;
    })}
  </g>
);

/** An arc from a0 to a1 degrees. */
const arc = (r: number, a0: number, a1: number) => {
  const p = (a: number) => `${Math.cos((a * Math.PI) / 180) * r} ${Math.sin((a * Math.PI) / 180) * r}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
};

/**
 * Rotating rings with ticks and two arcs, drawn around (0, 0) in an SVG of
 * `size` px. `ink` is the main ring's color; children sit in the middle.
 */
export const Rings: React.FC<{ size: number; ink: string; start?: number; children?: React.ReactNode }> = ({ size, ink, start = 0, children }) => {
  const frame = useCurrentFrame();
  const p = usePop(start, 14);
  const spin = frame * 0.6;
  const R = 200;
  return (
    <div style={{ position: "relative", width: size, height: size, opacity: p, transform: `scale(${0.85 + 0.15 * p})` }}>
      <svg width={size} height={size} viewBox={`${-R - 24} ${-R - 24} ${2 * R + 48} ${2 * R + 48}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <g transform={`rotate(${spin})`} opacity={0.55}>
          <circle r={R} fill="none" stroke={color.accent} strokeWidth={2} strokeDasharray="4 10" />
        </g>
        <g transform={`rotate(${-spin * 0.5})`}>
          <Ticks r={R - 16} step={6} major={30} stroke={`${color.accent}88`} />
        </g>
        <circle r={R - 46} fill={`${ink}14`} stroke={ink} strokeWidth={5} style={{ filter: `drop-shadow(0 0 10px ${ink})` }} />
        <g transform={`rotate(${spin * 1.4})`} style={{ filter: `drop-shadow(0 0 8px ${color.cool})` }}>
          <path d={arc(R - 30, 0, 70)} fill="none" stroke={color.cool} strokeWidth={6} strokeLinecap="round" />
          <path d={arc(R - 30, 180, 220)} fill="none" stroke={color.cool} strokeWidth={6} strokeLinecap="round" />
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
};

/** The title screen's ring on the right: "TOP" and the number of ranks (or nothing for a non-ranking video). */
export const TitleRings: React.FC<{ count: number }> = ({ count }) => (
  <div style={{ position: "absolute", right: 120, top: 150 }}>
    <Rings size={560} ink={color.accent} start={4}>
      <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 40, letterSpacing: "0.3em", color: color.inkSoft, marginLeft: "0.3em" }}>TOP</div>
      <div style={{ fontFamily: font.display, fontWeight: 900, fontSize: 170, lineHeight: 1, color: color.ink, textShadow: neon(color.accent) }}>{count}</div>
    </Rings>
  </div>
);
