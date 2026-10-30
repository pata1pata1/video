import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, paper, SUBTITLE_AREA, VIDEO } from "./theme";

/**
 * Shared parts for a video's explanatory diagrams (<id>/input/diagrams.tsx),
 * drawn in SVG on the paper above the subtitles. A diagram gets its steps
 * ({ at: local frame, step }) from the script's `visual.step`; things that
 * belong to step N appear when step N is reached.
 */
export type StepFrames = { at: number; step: number }[];

export const W = VIDEO.width;
export const H = VIDEO.height - SUBTITLE_AREA;

export function useSteps(steps: StepFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const step = [...steps].reverse().find((s) => s.at <= frame)?.step ?? 1;
  /** First frame at which step >= n (Infinity if never). */
  const since = (n: number) => steps.find((s) => s.step >= n)?.at ?? Infinity;
  /** Spring 0→1 from when step n is first reached. */
  const reveal = (n: number, delay = 0) => {
    const at = since(n);
    if (!Number.isFinite(at)) return 0;
    return spring({ frame: frame - at - delay, fps, config: { damping: 20, mass: 0.6 } });
  };
  /** 0→1 while step n is the current one (fades in and out). */
  const current = (n: number) => {
    const runs = steps.map((s, i) => ({ ...s, to: steps[i + 1]?.at })).filter((s) => s.step === n);
    const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
    return Math.max(
      0,
      ...runs.map((r) => Math.min(interpolate(frame, [r.at, r.at + 10], [0, 1], clamp), r.to === undefined ? 1 : interpolate(frame, [r.to, r.to + 10], [1, 0], clamp))),
    );
  };
  return { frame, step, reveal, current, since };
}

export const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={paper}>
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
      {children}
    </svg>
  </AbsoluteFill>
);

export const T: React.FC<{ x: number; y: number; size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end"; opacity?: number; children: React.ReactNode }> = ({
  x,
  y,
  size = 40,
  weight = 700,
  fill = color.ink,
  anchor = "middle",
  opacity = 1,
  children,
}) => (
  <text x={x} y={y} fontFamily={font.body} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} opacity={opacity} dominantBaseline="middle">
    {children}
  </text>
);

/** White rounded card. */
export const Card: React.FC<{ x: number; y: number; w: number; h: number; opacity?: number; highlight?: number }> = ({ x, y, w, h, opacity = 1, highlight = 0 }) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx={24}
    fill={color.card}
    stroke={highlight > 0 ? color.accent : color.line}
    strokeWidth={2 + 4 * highlight}
    opacity={opacity}
  />
);

/** A video's diagrams by the name used in the script (`visual.diagram`). */
export type Diagrams = Record<string, React.FC<{ steps: StepFrames }>>;
