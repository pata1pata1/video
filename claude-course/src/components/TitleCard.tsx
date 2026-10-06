import React from "react";
import { AbsoluteFill } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";

/** Course title slide: title, a pill label, and a short accent line. */
export const TitleCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      {/* Soft background glows, very low contrast (no neon). */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          right: -260,
          top: -380,
          background: "radial-gradient(circle, rgba(79,143,247,0.10) 0%, rgba(79,143,247,0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          left: -240,
          bottom: -360,
          background: "radial-gradient(circle, rgba(61,189,235,0.07) 0%, rgba(61,189,235,0) 70%)",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: font.bold,
            color: color.cyan,
            backgroundColor: color.primarySoft,
            border: `1px solid ${color.borderAccent}`,
            padding: "12px 34px",
            borderRadius: 999,
            letterSpacing: "0.06em",
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            fontSize: 88,
            fontWeight: font.bold,
            color: color.heading,
            letterSpacing: "0.02em",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
        <div
          style={{
            width: 160,
            height: 8,
            borderRadius: 4,
            background: accentGradient,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
