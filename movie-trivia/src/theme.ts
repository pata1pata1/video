import type { CSSProperties } from "react";
import { loadFont as loadOrbitron } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadZenKaku } from "@remotion/google-fonts/ZenKakuGothicNew";
import { loadFont as loadZenOldMincho } from "@remotion/google-fonts/ZenOldMincho";
import { PATTERN } from "./pattern";

// Colors, font and sizes come from the pattern (patterns/<pattern>/design.json,
// subtitle.json, config.json). Fonts from Google Fonts so Studio and render
// look the same on any PC; loadFont() holds rendering until the font is ready.
const { design, config, subtitle } = PATTERN;

const FONTS = {
  ZenKakuGothicNew: () =>
    loadZenKaku("normal", {
      weights: design.font.weights as ("500" | "700" | "900")[],
      subsets: ["japanese", "latin"],
      ignoreTooManyRequestsWarning: true,
    }),
  ZenOldMincho: () =>
    loadZenOldMincho("normal", {
      weights: design.font.weights as ("500" | "700" | "900")[],
      subsets: ["japanese", "latin"],
      ignoreTooManyRequestsWarning: true,
    }),
  Orbitron: () => loadOrbitron("normal", { weights: ["700", "900"], subsets: ["latin"] }),
};
const load = (family: string) => {
  const loader = FONTS[family as keyof typeof FONTS];
  if (!loader) throw new Error(`font "${family}" is not loaded in src/theme.ts`);
  return loader();
};
const body = load(design.font.family);
// numbers and Latin labels; the body font if the pattern has no display font
const display = design.font.display ? load(design.font.display) : body;

export const VIDEO = config.video;

export const font = {
  body: `${body.fontFamily}, sans-serif`,
  display: `${display.fontFamily}, ${body.fontFamily}, sans-serif`,
  emoji: `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
} as const;

export const color = design.color;

/** Text on an accent or medal fill: white, or dark on a pattern with bright neon fills. */
export const onAccent = design.color.onAccent ?? "#FFFFFF";

/** Bottom area kept free for subtitles. */
export const SUBTITLE_AREA = subtitle.area;

/** The paper behind cards and diagrams: the background color, with a grid and a glow if the pattern has them. */
const grid = design.paper?.grid;
const glow = design.paper?.glow;
export const paper: CSSProperties = {
  backgroundColor: color.bg,
  backgroundImage:
    [glow, grid && `linear-gradient(${grid.color} 1px, transparent 1px)`, grid && `linear-gradient(90deg, ${grid.color} 1px, transparent 1px)`].filter(Boolean).join(", ") ||
    undefined,
  backgroundSize: grid ? ["100% 100%", `${grid.size}px ${grid.size}px`, `${grid.size}px ${grid.size}px`].slice(glow ? 0 : 1).join(", ") : undefined,
  backgroundPosition: grid ? "center" : undefined,
};

/** Neon glow for text in `c` (none if the pattern has no glow). */
export const neon = (c: string, strength = 1) => (design.glow ? `0 0 ${design.glow.blur * strength}px ${c}, 0 0 ${design.glow.blur * strength * 2.5}px ${c}66` : undefined);

/** A rank's own color: gold, silver, bronze for 1-3 (if the pattern has medals), else the accent. */
export const rankColor = (n: number) => design.chapterCard.medals?.[String(n)] ?? color.accent;
