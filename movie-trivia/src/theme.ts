import { loadFont as loadZenKaku } from "@remotion/google-fonts/ZenKakuGothicNew";
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
};
const loader = FONTS[design.font.family as keyof typeof FONTS];
if (!loader) throw new Error(`font "${design.font.family}" is not loaded in src/theme.ts`);
const body = loader();

export const VIDEO = config.video;

export const font = {
  body: `${body.fontFamily}, sans-serif`,
  emoji: `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`,
} as const;

export const color = design.color;

/** Bottom area kept free for subtitles. */
export const SUBTITLE_AREA = subtitle.area;
