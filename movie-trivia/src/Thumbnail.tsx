import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { PATTERN } from "./pattern";
import { mediaFor, SCRIPT, videoFrameFile } from "./timeline";
import { color, font } from "./theme";

/** Thumbnail layout (patterns/<pattern>/thumbnail.json); colors and font from the video's design. */
const L = PATTERN.thumbnail.layout;

/**
 * 1280x720 YouTube thumbnail from script.thumbnails[]: footage on the right,
 * a plain paper panel on the left with few, huge words and one orange accent.
 * A video source uses a frame from its JPEG sequence.
 */
export const Thumbnail: React.FC<{ variant: string }> = ({ variant }) => {
  const def = SCRIPT.thumbnails.find((t) => t.id === variant);
  if (!def) throw new Error(`no thumbnail "${variant}" in script.thumbnails`);
  const media = mediaFor(def.photo);
  const src = media?.mediaType === "video" ? videoFrameFile(def.photo, L.image.videoFrame) : media?.file;
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      {src ? <Img src={staticFile(src)} style={{ position: "absolute", right: 0, top: 0, width: L.image.width, height: "100%", objectFit: "cover" }} /> : null}
      {/* paper panel with a slanted edge */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: L.panel.width, background: color.bg, clipPath: `polygon(0 0, 100% 0, ${L.panel.slantPercent}% 100%, 0 100%)` }} />
      <div style={{ position: "absolute", left: L.ribbon.left, top: L.ribbon.top }}>
        <div
          style={{
            display: "inline-block",
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: L.ribbon.size,
            color: "#FFFFFF",
            background: color.accent,
            padding: "4px 22px",
            borderRadius: 8,
          }}
        >
          {def.ribbon}
        </div>
        <div style={{ marginTop: 22, fontFamily: font.body, fontWeight: 900, lineHeight: 1.12 }}>
          {def.lines.map((l) => (
            <div key={l} style={{ fontSize: L.lines.size, color: color.ink, whiteSpace: "nowrap" }}>
              {l}
            </div>
          ))}
          <div style={{ fontSize: def.accent.length > L.accentWord.longOver ? L.accentWord.sizeIfLong : L.accentWord.size, color: color.accent, whiteSpace: "nowrap", marginTop: 6 }}>{def.accent}</div>
        </div>
      </div>
      {def.small ? (
        <div
          style={{
            position: "absolute",
            left: L.ribbon.left,
            bottom: L.small.bottom,
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: L.small.size,
            color: color.ink,
            borderLeft: `${L.small.barWidth}px solid ${color.accent}`,
            paddingLeft: 16,
          }}
        >
          {def.small}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
