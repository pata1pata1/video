import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { PATTERN } from "./pattern";
import { captionCues } from "./timeline";
import { color, font, onAccent, rankColor, SUBTITLE_AREA } from "./theme";

/** Spring from 0 to 1 that starts at `startFrame`. */
export function usePop(startFrame: number, damping = 20) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - startFrame, fps, config: { damping, mass: 0.6 } });
}

/** Linear 0→1 over `frames` from `startFrame` (for wipes and line draws). */
export function useRamp(startFrame: number, frames: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Subtitle look and wrapping rule (patterns/<pattern>/subtitle.json). */
const SUB = PATTERN.subtitle;

/**
 * Splits a long caption into two rows at the 「、」 closest to the middle (so a
 * phrase is never cut). A "\n" from the script's `caption` sets the break itself.
 */
function splitCaption(text: string): string[] {
  if (text.includes("\n")) return text.split("\n");
  if (text.length <= SUB.maxRowChars) return [text];
  let best = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === SUB.wrapAt && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i;
  }
  return best < 0 ? [text] : [text.slice(0, best + 1), text.slice(best + 1)];
}

/** Spoken line as a subtitle in the bottom area (times from narration.json). */
export const Subtitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cue = captionCues.find((c) => t >= c.start && t < c.until);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: SUB.bottom,
        height: SUBTITLE_AREA - SUB.bottom,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 120px",
      }}
    >
      <div
        style={{
          background: SUB.background,
          color: SUB.color,
          fontFamily: font.body,
          fontWeight: SUB.fontWeight,
          fontSize: SUB.fontSize,
          lineHeight: SUB.lineHeight,
          padding: SUB.padding,
          borderRadius: SUB.radius,
          border: SUB.border,
          boxShadow: SUB.shadow,
          textAlign: "center",
          maxWidth: SUB.maxWidth,
          lineBreak: "strict",
          fontFeatureSettings: '"palt"',
          letterSpacing: SUB.letterSpacing,
        }}
      >
        {splitCaption(cue.caption).map((row) => (
          <div key={row}>{row}</div>
        ))}
      </div>
    </div>
  );
};

/** Counts up plain numbers ("120", "300万"); other values ("2.5", "3万5000") are shown as is. */
export const StatValue: React.FC<{ value: string; progress: number }> = ({ value, progress }) => {
  const m = value.match(/^(\D*)([\d,]+)(\D*)$/);
  if (!m) return <>{value}</>;
  const target = Number(m[2].replace(/,/g, ""));
  if (target < 10) return <>{value}</>;
  const n = Math.round(target * Math.min(1, progress));
  return <>{`${m[1]}${m[2].includes(",") ? n.toLocaleString("en-US") : n}${m[3]}`}</>;
};

const TAG = PATTERN.design.chapterTag;

/** Small chapter label, top-left (number badge + heading). `onDark` for footage. */
export const ChapterTag: React.FC<{ number: number; heading: string; onDark: boolean }> = ({ number, heading, onDark }) => (
  <div
    style={{
      position: "absolute",
      left: 72,
      top: 56,
      display: "flex",
      alignItems: "center",
      gap: 16,
      fontFamily: font.body,
      fontWeight: 700,
      fontSize: 30,
      color: onDark ? "#FFFFFF" : color.ink,
      textShadow: onDark ? "0 1px 8px rgba(0,0,0,0.6)" : undefined,
    }}
  >
    <div
      style={{
        minWidth: 46,
        height: 46,
        padding: TAG.format ? "0 14px" : undefined,
        boxSizing: "border-box",
        borderRadius: 23,
        background: rankColor(number),
        color: onAccent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 26,
        textShadow: "none",
      }}
    >
      {TAG.format ? TAG.format.replace("{n}", String(number)) : number}
    </div>
    {heading}
  </div>
);
