import React from "react";
import { useCurrentFrame } from "remotion";
import { accentGradient, color, font } from "../theme/tokens";
import { FitText } from "./FitText";
import { revealProgress, revealStyle } from "./reveal";

const Arrow: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg width="56" height="40" viewBox="0 0 56 40" style={{ flexShrink: 0, opacity }}>
    <path d="M4 20 H46 M34 8 L48 20 L34 32" fill="none" stroke={color.primary} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Simple left-to-right flow: numbered boxes joined by arrows. Each step
 * appears at its revealFrame. With `loop`, a return arrow under the row shows
 * the cycle going back to the first step.
 */
export const FlowSteps: React.FC<{
  steps: { text: string; revealFrame: number }[];
  loop?: boolean;
  /** Box width; the row is centered. */
  boxWidth: number;
}> = ({ steps, loop = false, boxWidth }) => {
  const frame = useCurrentFrame();
  const shown = steps.map((s) => revealProgress(frame, s.revealFrame));
  const all = shown[shown.length - 1] ?? 0;
  const arrowGap = 56 + 2 * 20;
  const rowWidth = steps.length * boxWidth + (steps.length - 1) * arrowGap;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {steps.map((step, i) => (
          <React.Fragment key={step.text}>
            {i > 0 && <Arrow opacity={shown[i]} />}
            <div
              style={{
                ...revealStyle(shown[i]),
                width: boxWidth,
                minHeight: 190,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
                padding: "28px 24px",
                backgroundColor: color.surface,
                border: `2px solid ${color.border}`,
                borderRadius: 22,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: accentGradient,
                  color: "#FFFFFF",
                  fontSize: 26,
                  fontWeight: font.bold,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </div>
              <FitText
                text={step.text}
                width={boxWidth - 48}
                fontSize={40}
                align="center"
                style={{ fontWeight: font.bold, color: color.heading, lineHeight: 1.35 }}
              />
            </div>
          </React.Fragment>
        ))}
      </div>
      {loop && (
        <svg width={rowWidth} height="90" viewBox={`0 0 ${rowWidth} 90`} style={{ opacity: all, marginTop: 8 }}>
          <path
            d={`M ${rowWidth - boxWidth / 2} 6 V 56 Q ${rowWidth - boxWidth / 2} 76 ${rowWidth - boxWidth / 2 - 20} 76 H ${boxWidth / 2 + 20} Q ${boxWidth / 2} 76 ${boxWidth / 2} 56 V 14`}
            fill="none"
            stroke={color.cyan}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="2 12"
          />
          <path
            d={`M ${boxWidth / 2 - 14} 26 L ${boxWidth / 2} 8 L ${boxWidth / 2 + 14} 26`}
            fill="none"
            stroke={color.cyan}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};
