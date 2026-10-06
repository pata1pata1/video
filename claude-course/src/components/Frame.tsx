import React from "react";
import { AbsoluteFill } from "remotion";
import { backgroundGradient, color, font, layout } from "../theme/tokens";

/**
 * Common screen frame: background, optional header (course name + chapter),
 * a content area, and a subtitle band at the bottom that content never
 * enters. The subtitle itself is passed in as `subtitle`.
 */
export const Frame: React.FC<{
  course: string;
  chapterLabel: string | null;
  showHeader: boolean;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}> = ({ course, chapterLabel, showHeader, subtitle, children }) => {
  return (
    <AbsoluteFill
      style={{
        background: backgroundGradient,
        fontFamily: font.family,
        fontFeatureSettings: font.featureSettings,
        color: color.text,
      }}
    >
      {showHeader && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: layout.headerHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `0 ${layout.sidePadding}px`,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: font.medium, color: color.muted, letterSpacing: "0.02em" }}>
            {course}
          </div>
          {chapterLabel && (
            <div
              style={{
                fontSize: 24,
                fontWeight: font.bold,
                color: color.cyan,
                backgroundColor: color.primarySoft,
                border: `1px solid ${color.borderAccent}`,
                padding: "8px 22px",
                borderRadius: 999,
              }}
            >
              {chapterLabel}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: showHeader ? layout.headerHeight : 0,
          bottom: layout.subtitleBandHeight,
          left: 0,
          right: 0,
        }}
      >
        {children}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: layout.subtitleBandHeight,
          backgroundColor: color.subtitleBand,
          borderTop: `2px solid ${color.subtitleBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
