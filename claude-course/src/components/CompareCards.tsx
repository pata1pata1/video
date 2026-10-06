import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";
import { revealProgress, revealStyle } from "./reveal";

type Side = { title: string; body: string };

/**
 * Two cards side by side: a plain "before" card and an accented card with the
 * actions it can do (each action appears at its revealFrame).
 */
export const CompareCards: React.FC<{
  left: Side;
  right: Side;
  actions: { text: string; revealFrame: number }[];
}> = ({ left, right, actions }) => {
  const frame = useCurrentFrame();
  const card: React.CSSProperties = {
    flex: 1,
    alignSelf: "stretch",
    boxSizing: "border-box",
    borderRadius: 26,
    padding: "48px 52px",
    backgroundColor: color.surface,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };
  return (
    <AbsoluteFill style={{ padding: "70px 160px", flexDirection: "row", alignItems: "center", gap: 48 }}>
      <div style={{ ...card, flex: 0.8, border: `2px solid ${color.border}` }}>
        <div style={{ fontSize: 36, fontWeight: font.bold, color: color.muted }}>{left.title}</div>
        <div style={{ fontSize: 58, fontWeight: font.bold, color: color.text }}>{left.body}</div>
      </div>
      <div style={{ ...card, border: `2px solid ${color.borderAccent}`, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ fontSize: 36, fontWeight: font.bold, color: color.cyan }}>{right.title}</div>
        <div style={{ fontSize: 58, fontWeight: font.bold, color: color.heading }}>{right.body}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16 }}>
          {actions.map((a) => (
            <div
              key={a.text}
              style={{
                ...revealStyle(revealProgress(frame, a.revealFrame)),
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 24px",
                borderRadius: 999,
                backgroundColor: color.primarySoft,
                fontSize: 34,
                fontWeight: font.medium,
                color: color.text,
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: accentGradient }} />
              {a.text}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
