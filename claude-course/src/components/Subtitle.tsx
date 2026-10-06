import React from "react";
import { color, font, subtitle } from "../theme/tokens";
import { captionWidth, splitCaption } from "./captionLayout";

/** Longest a caption may be once shown (2 rows). */
export const MAX_CAPTION_WIDTH = subtitle.maxRowWidth * 2;

export { captionWidth };

/**
 * The caption in the subtitle band. Rows come from captionLayout (natural
 * phrase breaks, even rows); each row is kept on one line (nowrap) so the
 * browser never re-wraps it and leaves a stray "す" on a line of its own.
 */
export const Subtitle: React.FC<{ text: string | null }> = ({ text }) => {
  if (!text) return null;
  return (
    <div
      style={{
        fontSize: subtitle.fontSize,
        fontWeight: font.medium,
        color: color.subtitleText,
        lineHeight: 1.5,
        textAlign: "center",
        letterSpacing: "0.02em",
      }}
    >
      {splitCaption(text, subtitle.maxRowWidth).map((row) => (
        <div key={row} style={{ whiteSpace: "pre" }}>
          {row}
        </div>
      ))}
    </div>
  );
};
