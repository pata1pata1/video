import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";
import { FitText } from "./FitText";
import { revealProgress, revealStyle } from "./reveal";

/** Heading + equal cards in a grid; each card appears at its revealFrame. */
export const CardGrid: React.FC<{
  heading: string;
  items: { text: string; revealFrame: number }[];
  columns: number;
}> = ({ heading, items, columns }) => {
  const frame = useCurrentFrame();
  // Text width inside a card: row width 1520 (1920 - padding), minus gaps, card padding and accent bar.
  const textWidth = (1520 - (columns - 1) * 28) / columns - 80 - 10 - 26;
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 200px" }}>
      <div style={{ fontSize: 60, fontWeight: font.bold, color: color.heading, marginBottom: 52 }}>{heading}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 28 }}>
        {items.map((item) => (
          <div
            key={item.text}
            style={{
              ...revealStyle(revealProgress(frame, item.revealFrame)),
              minHeight: 150,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 26,
              padding: "32px 40px",
              backgroundColor: color.surface,
              border: `2px solid ${color.border}`,
              borderRadius: 22,
            }}
          >
            <div style={{ width: 10, alignSelf: "stretch", borderRadius: 5, background: accentGradient, flexShrink: 0 }} />
            <FitText text={item.text} width={textWidth} fontSize={46} style={{ fontWeight: font.bold, color: color.heading, lineHeight: 1.35 }} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
