import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { usePop } from "./components";
import { PATTERN } from "./pattern";
import { font, neon, SUBTITLE_AREA } from "./theme";

/**
 * Parts for a pattern with design.film (pattern-03): footage made to look like
 * old, worn film (grain, scratches, vignette, a slight flicker) and big glowing
 * keywords over it (visual.words). A pattern without design.film never uses them.
 */
const D = PATTERN.design;

/** Grain, scratches, flicker and vignette over footage. */
export const FilmOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const F = D.film;
  if (!F) return null;
  // grain and scratches change every other frame, like projected film
  const tick = Math.floor(frame / 2);
  const scratches = Array.from({ length: F.scratches }, (_, i) => ({
    x: random(`x${tick}-${i}`) * 100,
    on: random(`on${tick}-${i}`) < 0.6,
    o: 0.15 + random(`o${tick}-${i}`) * 0.25,
  }));
  const flicker = 1 - F.flicker * random(`f${tick}`);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: F.grain, mixBlendMode: "overlay" }}>
        <filter id="film-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={tick % 12} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>
      {scratches.map((s, i) =>
        s.on ? <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${s.x}%`, width: 2, background: `rgba(230,230,230,${s.o})` }} /> : null,
      )}
      <AbsoluteFill style={{ background: `rgba(0,0,0,${1 - flicker})` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${F.vignette}) 100%)` }} />
    </AbsoluteFill>
  );
};

/** Where 1-3 keywords sit (above the subtitles, clear of the corner labels). */
const SPOTS: React.CSSProperties[][] = [
  [{ left: 0, right: 0, top: 330, textAlign: "center" }],
  [
    { left: 130, top: 210 },
    { right: 130, top: 560 },
  ],
  [
    { left: 130, top: 150 },
    { right: 150, top: 400 },
    { left: 130, top: 650 },
  ],
];

/** Keywords that come in one by one over the footage, each in the next of the pattern's colors. */
export const Words: React.FC<{ words: string[] }> = ({ words }) => {
  const W = D.words;
  if (!W) throw new Error(`visual.words needs design.words in patterns/${PATTERN.config.id}/design.json`);
  if (words.length > SPOTS.length) throw new Error(`visual.words: at most ${SPOTS.length} words`);
  return (
    <AbsoluteFill style={{ bottom: SUBTITLE_AREA }}>
      {words.map((w, i) => (
        <Word key={w} text={w} color={W.colors[i % W.colors.length]} size={W.size} delay={6 + i * W.staggerFrames} spot={SPOTS[words.length - 1][i]} />
      ))}
    </AbsoluteFill>
  );
};

const Word: React.FC<{ text: string; color: string; size: number; delay: number; spot: React.CSSProperties }> = ({ text, color, size, delay, spot }) => {
  const p = usePop(delay, 26);
  return (
    <div
      style={{
        position: "absolute",
        ...spot,
        fontFamily: font.body,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.1,
        whiteSpace: "nowrap",
        color,
        textShadow: neon(color, 0.8),
        opacity: p,
        filter: `blur(${(1 - p) * 8}px)`,
        transform: `scale(${1.12 - 0.12 * p})`,
        transformOrigin: spot.right !== undefined ? "right center" : spot.textAlign ? "center" : "left center",
      }}
    >
      {text}
    </div>
  );
};

/** A chapter's heading top-right on a red brush stroke (design.chapterTag.style "brush"). */
export const BrushTag: React.FC<{ heading: string; color: string }> = ({ heading, color }) => {
  const p = usePop(4);
  return (
    <div style={{ position: "absolute", right: 0, top: 40, paddingRight: 64, opacity: p }}>
      {/* the stroke: thick on the right, thinning and fading to the left */}
      <div
        style={{
          position: "absolute",
          right: 0,
          left: -90,
          top: "54%",
          height: 22,
          background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${color} 35%, ${color} 100%)`,
          clipPath: "polygon(0 55%, 30% 25%, 100% 0, 100% 100%, 30% 80%)",
          transform: `scaleX(${p})`,
          transformOrigin: "right center",
          boxShadow: `0 0 18px ${color}`,
        }}
      />
      <div style={{ position: "relative", fontFamily: font.body, fontWeight: 900, fontSize: 40, color: "#FFFFFF", textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 2px #000" }}>{heading}</div>
    </div>
  );
};
