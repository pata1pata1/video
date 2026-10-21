// One subtitle in the preset's style (_shared/subtitle-presets/*.json).
// Sizes are ratios of the frame's short side. Used by the design stills and by
// the final render.
//
// The outline is drawn as a separate layer behind the fill (a stroke on the
// fill itself would eat half of each glyph's width).

import type React from "react";
import { resolvePreset, type SubtitlePreset } from "./presetMath.ts";

export type { SubtitlePreset };

const rgba = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const Subtitle: React.FC<{ text: string; preset: SubtitlePreset; width: number; height: number }> = ({ text, preset: p, width, height }) => {
  const r = resolvePreset(p, width, height);
  const textStyle: React.CSSProperties = {
    fontFamily: `"${p.font.family}", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif`,
    fontWeight: p.font.weight,
    fontSize: r.fontSize,
    lineHeight: p.font.lineHeight,
    letterSpacing: `${p.font.letterSpacingEm}em`,
    textAlign: p.position.align,
    whiteSpace: "pre",
    margin: 0,
  };
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [p.position.anchor]: r.margin,
        display: "flex",
        justifyContent: p.position.align === "center" ? "center" : "flex-start",
        paddingLeft: p.position.align === "left" ? (width - r.maxWidth) / 2 : 0,
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: r.maxWidth,
          ...(p.background.enabled
            ? {
                background: rgba(p.background.color, p.background.opacity),
                padding: `${p.background.paddingEm[0]}em ${p.background.paddingEm[1]}em`,
                borderRadius: `${p.background.radiusEm}em`,
                fontSize: r.fontSize,
              }
            : {}),
        }}
      >
        {p.stroke.enabled ? (
          <p
            aria-hidden
            style={{
              ...textStyle,
              position: "absolute",
              inset: 0,
              color: "transparent",
              WebkitTextStroke: `${r.strokeWidth * 2}px ${rgba(p.stroke.color, p.stroke.opacity)}`,
              ...(p.background.enabled ? { padding: `${p.background.paddingEm[0]}em ${p.background.paddingEm[1]}em` } : {}),
              ...(p.shadow.enabled ? { filter: `drop-shadow(0 0 ${p.shadow.blurEm}em ${rgba(p.shadow.color, p.shadow.opacity)})` } : {}),
            }}
          >
            {text}
          </p>
        ) : null}
        <p
          style={{
            ...textStyle,
            position: "relative",
            color: p.color,
            ...(!p.stroke.enabled && p.shadow.enabled ? { textShadow: `0 0 ${p.shadow.blurEm}em ${rgba(p.shadow.color, p.shadow.opacity)}` } : {}),
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};
