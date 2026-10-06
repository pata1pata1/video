import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";
import { revealProgress, revealStyle } from "./reveal";

/**
 * Heading + a vertical list of points. Each point appears at its
 * `revealFrame` (relative to the scene start), so it can follow the
 * narration. Hidden points keep their space, so the layout never jumps.
 * marker "number" = numbered circles; "caution" = calm amber "!" for notes.
 */
export const KeyPoints: React.FC<{
  heading: string;
  items: { text: string; revealFrame: number }[];
  marker?: "number" | "caution";
}> = ({ heading, items, marker = "number" }) => {
  const frame = useCurrentFrame();
  const caution = marker === "caution";
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 260px" }}>
      <div style={{ fontSize: 60, fontWeight: font.bold, color: color.heading, marginBottom: 56 }}>{heading}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {items.map((item, i) => (
          <div
            key={item.text}
            style={{
              ...revealStyle(revealProgress(frame, item.revealFrame), "x"),
              display: "flex",
              alignItems: "center",
              gap: 32,
              backgroundColor: color.surface,
              border: `2px solid ${caution ? color.cautionBorder : color.border}`,
              borderRadius: 20,
              padding: "30px 40px",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                flexShrink: 0,
                borderRadius: "50%",
                background: caution ? color.cautionSoft : accentGradient,
                border: caution ? `2px solid ${color.caution}` : "none",
                color: caution ? color.caution : "#FFFFFF",
                fontSize: 32,
                fontWeight: font.bold,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {caution ? "!" : i + 1}
            </div>
            <div style={{ fontSize: 46, fontWeight: font.medium, color: color.text }}>{item.text}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
