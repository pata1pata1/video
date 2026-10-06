import React from "react";
import { useCurrentFrame } from "remotion";
import { color, font } from "../theme/tokens";
import { FitText } from "./FitText";
import { revealProgress, revealStyle } from "./reveal";

/**
 * Stacked speech bubbles (things a learner says or asks). Each appears at its
 * revealFrame; the most recent one is outlined in the accent color so the
 * viewer can follow the narration.
 */
export const ChatBubbles: React.FC<{
  items: { text: string; revealFrame: number }[];
  maxWidth: number;
  fontSize?: number;
}> = ({ items, maxWidth, fontSize = 42 }) => {
  const frame = useCurrentFrame();
  const current = items.reduce((last, item, i) => (frame >= item.revealFrame ? i : last), -1);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 24 }}>
      {items.map((item, i) => (
        <div
          key={item.text}
          style={{
            ...revealStyle(revealProgress(frame, item.revealFrame), "x"),
            maxWidth,
            boxSizing: "border-box",
            padding: "24px 36px",
            backgroundColor: color.surface,
            border: `2px solid ${i === current ? color.borderAccent : color.border}`,
            borderRadius: "30px 30px 30px 8px",
            fontWeight: font.medium,
            color: i === current ? color.heading : color.text,
            lineHeight: 1.45,
          }}
        >
          <FitText text={`「${item.text}」`} width={maxWidth - 76} fontSize={fontSize} />
        </div>
      ))}
    </div>
  );
};
