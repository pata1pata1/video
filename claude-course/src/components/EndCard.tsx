import React from "react";
import { AbsoluteFill } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";

/** Closing screen: message, the next step, and the voice credit. */
export const EndCard: React.FC<{ message: string; next: string; credit: string }> = ({ message, next, credit }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48 }}>
        <div style={{ fontSize: 80, fontWeight: font.bold, color: color.heading, letterSpacing: "0.02em" }}>{message}</div>
        <div style={{ width: 160, height: 8, borderRadius: 4, background: accentGradient }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "18px 36px",
            borderRadius: 999,
            backgroundColor: color.primarySoft,
            border: `1px solid ${color.borderAccent}`,
          }}
        >
          <div style={{ fontSize: 30, fontWeight: font.bold, color: color.cyan }}>次へ</div>
          <div style={{ fontSize: 36, fontWeight: font.bold, color: color.heading }}>{next}</div>
        </div>
      </div>
      <div style={{ position: "absolute", right: 60, bottom: 36, fontSize: 24, color: color.muted }}>{credit}</div>
    </AbsoluteFill>
  );
};
