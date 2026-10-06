import React from "react";
import { AbsoluteFill } from "remotion";
import { color, font } from "../theme/tokens";

/** Chapter divider: big chapter number and the chapter title. */
export const ChapterTitle: React.FC<{ number: string; title: string }> = ({ number, title }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <div
          style={{
            fontSize: 150,
            fontWeight: font.bold,
            lineHeight: 1,
            background: `linear-gradient(135deg, ${color.primary}, ${color.cyan})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {number}
        </div>
        <div style={{ width: 4, height: 150, borderRadius: 2, backgroundColor: color.border }} />
        <div style={{ fontSize: 76, fontWeight: font.bold, color: color.heading, letterSpacing: "0.02em" }}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};
