import React from "react";
import { splitCaption, widthOf } from "./captionLayout";

/**
 * Screen text that must not wrap mid-word. Rows are chosen with the same
 * phrase-break rules as the subtitles (captionLayout.splitCaption) for the
 * available width; if a row still does not fit (a name with no break point),
 * the font shrinks just enough. Rows never re-wrap in the browser.
 */
export const FitText: React.FC<{
  text: string;
  /** Available width in px. */
  width: number;
  fontSize: number;
  style?: React.CSSProperties;
  align?: "left" | "center";
}> = ({ text, width, fontSize, style, align = "left" }) => {
  // Estimated widths are in full-width characters; keep a small safety margin.
  const budget = (width / fontSize) * 0.95;
  const rows = splitCaption(text, budget);
  const widest = Math.max(...rows.map(widthOf));
  const size = widest > budget ? Math.floor((fontSize * budget) / widest) : fontSize;
  return (
    <div style={{ ...style, fontSize: size, textAlign: align }}>
      {rows.map((row) => (
        <div key={row} style={{ whiteSpace: "pre" }}>
          {row}
        </div>
      ))}
    </div>
  );
};
