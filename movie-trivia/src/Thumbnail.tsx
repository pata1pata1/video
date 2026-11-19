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
  if (def.faces) return <FacesThumbnail def={def} />;
  if (def.layout === "split") return <SplitThumbnail def={def} />;
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
          {def.after?.map((l) => (
            <div key={l} style={{ ...outlined(L.after?.size ?? L.lines.size * 0.7, C.text, L.after?.outline ?? L.lines.outline), marginTop: 6 }}>
              {l}
            </div>
          ))}
          {def.question ? (
            <div style={{ ...outlined(L.question?.size ?? 46, C.question ?? C.yellow, L.question?.outline ?? 8), marginTop: 22 }}>{def.question}</div>
          ) : null}
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
      {def.note ? (
        <div
          style={{
            position: "absolute",
            right: L.note?.right ?? 26,
            bottom: L.note?.bottom ?? 18,
            fontFamily: font.body,
            fontWeight: 700,
            fontSize: L.note?.size ?? 17,
            color: C.text,
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}
        >
          {def.note}
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

/** Text with a thick outline in `stroke` and a drop shadow. */
const stroked = (size: number, fill: string, stroke: string, width: number): React.CSSProperties => ({
  fontFamily: font.body,
  fontWeight: 900,
  fontSize: size,
  color: fill,
  WebkitTextStroke: `${width}px ${stroke}`,
  paintOrder: "stroke fill",
  textShadow: "0 8px 18px rgba(0,0,0,0.7)",
  whiteSpace: "nowrap",
  lineHeight: 1.08,
  letterSpacing: "-0.02em",
});

/**
 * Faces layout (the user's sample, 2026-11-16): photos side by side across the
 * top, split by slanted dark gaps; a yellow kicker on a red brush band; white
 * outlined line(s); one huge red line outlined in white; police-light glow.
 */
const FacesThumbnail: React.FC<{ def: (typeof SCRIPT.thumbnails)[number] }> = ({ def }) => {
  const faces = def.faces ?? [];
  const w = 1280 / faces.length;
  const slant = 34;
  return (
    <AbsoluteFill style={{ background: "#0B0B0E" }}>
      {faces.map((f, i) => {
        const m = mediaFor(f.key);
        if (!m) throw new Error(`no media "${f.key}"`);
        const left = i * w;
        // a parallelogram strip; neighbours overlap under the slanted gap
        const clip = `polygon(${i === 0 ? 0 : slant}px 0, ${w + slant}px 0, ${i === faces.length - 1 ? w + slant : w}px 100%, 0 100%)`;
        return (
          <div key={f.key} style={{ position: "absolute", left: left - (i === 0 ? 0 : slant / 2), top: 0, width: w + slant, height: 470, clipPath: clip, overflow: "hidden" }}>
            <Img src={staticFile(m.file)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: f.position ?? "center 25%" }} />
          </div>
        );
      })}
      {/* darken toward the text, then a police-light glow bottom-right */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 66%, #0B0B0E 82%)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 260px 70px at 1060px 440px, rgba(255,40,40,0.55), rgba(0,0,0,0) 70%), radial-gradient(ellipse 260px 70px at 1230px 440px, rgba(60,110,255,0.55), rgba(0,0,0,0) 70%)" }} />
      <div style={{ position: "absolute", left: 30, top: 300 }}>
        {def.kicker ? (
          <div style={{ display: "inline-block", padding: "2px 30px 8px 22px", background: "linear-gradient(90deg, #B5070D, #E3141B 70%, rgba(227,20,27,0))", transform: "rotate(-3deg)" }}>
            <span style={stroked(112, "#FFE23B", "#1A0000", 14)}>{def.kicker}</span>
          </div>
        ) : null}
        {def.lines.map((l) => (
          <div key={l} style={{ ...stroked(96, "#FFFFFF", "#000000", 14), marginTop: 2 }}>
            {l}
          </div>
        ))}
        <div style={{ ...stroked(def.accent.length > 8 ? 128 : 150, "#E8141B", "#FFFFFF", 14), marginTop: -6 }}>{def.accent}</div>
      </div>
    </AbsoluteFill>
  );
};

/** Text with a gradient fill: an outlined, shadowed copy behind a clipped gradient copy. */
const GradientText: React.FC<{ text: string; size: number; gradient: string; stroke: string; width: number; style?: React.CSSProperties }> = ({ text, size, gradient, stroke, width, style }) => {
  const base: React.CSSProperties = { fontFamily: font.body, fontWeight: 900, fontSize: size, whiteSpace: "nowrap", lineHeight: 1.1, letterSpacing: "-0.02em" };
  return (
    <div style={{ position: "relative", ...style }}>
      <div style={{ ...base, color: stroke, WebkitTextStroke: `${width}px ${stroke}`, textShadow: "0 10px 22px rgba(0,0,0,0.8)" }}>{text}</div>
      <div style={{ ...base, position: "absolute", left: 0, top: 0, color: "transparent", backgroundImage: gradient, WebkitBackgroundClip: "text", backgroundClip: "text" }}>{text}</div>
    </div>
  );
};

/** A rough red brush stroke (underline under the accent word). */
const BrushStroke: React.FC<{ width: number }> = ({ width }) => (
  <svg width={width} height={44} viewBox={`0 0 ${width} 44`} style={{ display: "block" }}>
    <defs>
      <linearGradient id="brush" x1="0" x2="1">
        <stop offset="0" stopColor="#C80A12" stopOpacity="0" />
        <stop offset="0.08" stopColor="#D8141B" />
        <stop offset="0.85" stopColor="#E3161D" />
        <stop offset="1" stopColor="#E3161D" stopOpacity="0" />
      </linearGradient>
    </defs>
    {Array.from({ length: 9 }, (_, i) => {
      const y = 10 + i * 3 + random(`by${i}`) * 3;
      const x0 = random(`bx${i}`) * width * 0.08;
      const x1 = width - random(`bz${i}`) * width * 0.12;
      return <path key={i} d={`M${x0} ${y + 4} Q ${width * 0.5} ${y - 6} ${x1} ${y}`} stroke="url(#brush)" strokeWidth={4 + random(`bw${i}`) * 4} strokeLinecap="round" fill="none" opacity={0.75 + random(`bo${i}`) * 0.25} />;
    })}
  </svg>
);

/**
 * Split layout (the user's ChatGPT sample, 2026-11-20): the photo large on the
 * right, fading into a dark blurred copy on the left; a slanted red ribbon,
 * white outlined line(s), a huge yellow-gradient accent word over a red brush
 * stroke, white "after" line(s), a cyan question, and the credit bottom-right.
 */
const SplitThumbnail: React.FC<{ def: (typeof SCRIPT.thumbnails)[number] }> = ({ def }) => {
  const media = mediaFor(def.photo);
  const src = media?.mediaType === "video" ? videoFrameFile(def.photo, def.frame ?? L.image.videoFrame) : media?.file;
  const photoWidth = def.photoWidth ?? 700;
  const white = (size: number): React.CSSProperties => ({ ...stroked(size, "#FFFFFF", "#000000", 12), letterSpacing: "-0.01em" });
  return (
    <AbsoluteFill style={{ background: "#0A0A0C" }}>
      {src ? (
        <>
          <Img src={staticFile(src)} style={{ position: "absolute", inset: -40, width: 1360, height: 800, objectFit: "cover", filter: "blur(22px) brightness(0.4) saturate(0.9)" }} />
          <div style={{ position: "absolute", right: 0, top: 0, width: photoWidth, height: 720, WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 26%)", maskImage: "linear-gradient(90deg, transparent 0%, #000 26%)" }}>
            <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: def.imagePosition ?? "center" }} />
          </div>
        </>
      ) : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 900px 600px at 20% 50%, rgba(0,0,0,0.55), rgba(0,0,0,0) 75%), linear-gradient(0deg, rgba(0,0,0,0.5), rgba(0,0,0,0) 30%)" }} />
      <div style={{ position: "absolute", left: 34, top: 56 }}>
        <div style={{ display: "inline-block", padding: "4px 34px 8px 26px", background: "linear-gradient(90deg, #A8060C, #E3141B)", transform: "skewX(-12deg)", boxShadow: "0 8px 18px rgba(0,0,0,0.6)" }}>
          <div style={{ transform: "skewX(12deg)", ...stroked(56, "#FFFFFF", "#5A0000", 6), fontStyle: "italic" }}>{def.ribbon}</div>
        </div>
        <div style={{ marginTop: 30 }}>
          {def.lines.map((l) => (
            <div key={l} style={white(60)}>
              {l}
            </div>
          ))}
        </div>
        <GradientText text={def.accent} size={def.accent.length > 5 ? 112 : 132} gradient="linear-gradient(180deg, #FFF7B0 0%, #FFE600 45%, #FFB800 100%)" stroke="#1A1000" width={18} style={{ marginTop: 0 }} />
        <div style={{ marginTop: -18, marginLeft: -10 }}>
          <BrushStroke width={680} />
        </div>
        {def.after?.map((l) => (
          <div key={l} style={{ ...white(52), marginTop: 14 }}>
            {l}
          </div>
        ))}
        {def.question ? <div style={{ ...stroked(48, "#3FE0FF", "#001018", 10), marginTop: 34 }}>{def.question}</div> : null}
      </div>
      {def.note ? (
        <div style={{ position: "absolute", right: 22, bottom: 16, fontFamily: font.body, fontWeight: 700, fontSize: 22, color: "#FFFFFF", textShadow: "0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8)" }}>{def.note}</div>
      ) : null}
    </AbsoluteFill>
  );
};
