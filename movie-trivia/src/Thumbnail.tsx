import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { PATTERN } from "./pattern";
import { mediaFor, SCRIPT, videoFrameFile } from "./timeline";
import { font } from "./theme";

/** Thumbnail colors and layout (patterns/<pattern>/thumbnail.json); font from the video's design. */
const { color: C, layout: L } = PATTERN.thumbnail;

/** Thick outline drawn behind the fill, plus a drop shadow. */
const outlined = (size: number, fill: string, stroke: number): React.CSSProperties => ({
  fontFamily: font.body,
  fontWeight: 900,
  fontSize: size,
  color: fill,
  WebkitTextStroke: `${stroke}px ${C.outline}`,
  paintOrder: "stroke fill",
  textShadow: L.textGlow ? `${L.textGlow}, 0 8px 18px rgba(0,0,0,0.6)` : "0 8px 18px rgba(0,0,0,0.6)",
  whiteSpace: "nowrap",
  lineHeight: 1.12,
});

/**
 * 1280x720 YouTube thumbnail from script.thumbnails[]: full-bleed footage
 * darkened on the left, a red ribbon, outlined white lines, one huge yellow
 * word, and an optional red badge for a number.
 * A video source uses a frame from its JPEG sequence.
 */
export const Thumbnail: React.FC<{ variant: string }> = ({ variant }) => {
  const def = SCRIPT.thumbnails.find((t) => t.id === variant);
  if (!def) throw new Error(`no thumbnail "${variant}" in script.thumbnails`);
  const media = mediaFor(def.photo);
  const src = media?.mediaType === "video" ? videoFrameFile(def.photo, def.frame ?? L.image.videoFrame) : media?.file;
  const A = L.accentWord;
  const B = L.badge;
  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {src ? <Img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: def.imagePosition ?? "center" }} /> : null}
      <AbsoluteFill style={{ background: L.shade.gradient }} />
      {L.splatter ? <Splatter count={L.splatter.count} color={L.splatter.color} /> : null}
      <div style={{ position: "absolute", left: L.left, top: L.ribbon.top }}>
        <div
          style={{
            display: "inline-block",
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: L.ribbon.size,
            color: C.text,
            background: C.red,
            padding: "6px 26px",
            transform: `rotate(${L.ribbon.rotate}deg)`,
            boxShadow: "0 6px 14px rgba(0,0,0,0.5)",
          }}
        >
          {def.ribbon}
        </div>
        <div style={{ marginTop: 26 }}>
          {def.lines.map((l) => (
            <div key={l} style={outlined(L.lines.size, C.text, L.lines.outline)}>
              {l}
            </div>
          ))}
          <div style={{ ...outlined(def.accent.length > A.longOver ? A.sizeIfLong : A.size, C.accentWord ?? C.yellow, A.outline), marginTop: 4 }}>{def.accent}</div>
        </div>
      </div>
      {def.badge ? (
        <div
          style={{
            position: "absolute",
            right: B.right,
            bottom: B.bottom,
            width: B.size,
            height: B.size,
            borderRadius: "50%",
            background: C.red,
            border: `8px solid ${C.text}`,
            boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `rotate(${B.rotate}deg)`,
            fontFamily: font.body,
            fontWeight: 900,
            color: C.text,
            lineHeight: 1.05,
          }}
        >
          <div style={{ fontSize: B.topSize }}>{def.badge.top}</div>
          <div style={{ fontSize: def.badge.big.length > B.bigLongOver ? B.bigSizeIfLong : B.bigSize, color: C.badgeBig ?? C.yellow }}>{def.badge.big}</div>
          {def.badge.bottom ? <div style={{ fontSize: B.bottomSize }}>{def.badge.bottom}</div> : null}
        </div>
      ) : null}
      {def.small ? (
        <div
          style={{
            position: "absolute",
            left: L.left,
            bottom: L.small.bottom,
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: L.small.size,
            color: C.text,
            background: "rgba(0,0,0,0.75)",
            padding: "6px 18px",
            borderLeft: `${L.small.barWidth}px solid ${C.yellow}`,
          }}
        >
          {def.small}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Small red specks scattered near the edges (never over the middle, where the text and the face are). */
const Splatter: React.FC<{ count: number; color: string }> = ({ count, color }) => (
  <AbsoluteFill>
    {Array.from({ length: count }, (_, i) => {
      const edge = random(`e${i}`);
      const along = random(`a${i}`) * 100;
      const depth = random(`d${i}`) * 14;
      // left, right, top or bottom band
      const pos = edge < 0.3 ? { left: `${depth}%`, top: `${along}%` } : edge < 0.6 ? { right: `${depth}%`, top: `${along}%` } : edge < 0.8 ? { top: `${depth}%`, left: `${along}%` } : { bottom: `${depth}%`, left: `${along}%` };
      const size = 3 + random(`s${i}`) ** 3 * 22;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            ...pos,
            width: size,
            height: size * (0.7 + random(`h${i}`) * 0.6),
            borderRadius: "50%",
            background: color,
            opacity: 0.55 + random(`o${i}`) * 0.4,
            filter: size > 12 ? "blur(0.6px)" : undefined,
          }}
        />
      );
    })}
  </AbsoluteFill>
);
