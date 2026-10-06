import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import { MAX_ROW_WIDTH } from "../components/captionLayout";

// Noto Sans JP from Google Fonts, so Studio/render look the same on Mac and
// Windows. loadFont() delays rendering until the font is ready.
const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "700"],
  subsets: ["japanese", "latin"],
  ignoreTooManyRequestsWarning: true,
});

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;

/**
 * Dark lecture palette: charcoal background, white type, a little blue/cyan.
 * The video itself stays dark so it never blends with the white/blue member
 * site; screenshots and recordings keep their own colors inside `screen`.
 */
export const color = {
  /** Page background: charcoal, slightly lighter at the top (see backgroundGradient). */
  background: "#15171B",
  backgroundTop: "#1B1E23",
  /** Cards and panels. */
  surface: "#1F232A",
  heading: "#FFFFFF",
  text: "#E6E9EE",
  muted: "#9AA3AE",
  primary: "#4F8FF7",
  cyan: "#3DBDEB",
  /** Tinted fill for pills / badges. */
  primarySoft: "rgba(79,143,247,0.16)",
  border: "#2E343D",
  /** Thin border on dark pills inside the screen frame bar. */
  frameBorderSoft: "rgba(255,255,255,0.14)",
  borderAccent: "rgba(79,143,247,0.45)",
  /** Subtitle band: darker than the picture area. */
  subtitleBand: "#0B0C0E",
  subtitleBorder: "#23272E",
  subtitleText: "#FFFFFF",
  /** Calm amber, only for cautions. */
  caution: "#E8B45A",
  cautionSoft: "rgba(232,180,90,0.14)",
  cautionBorder: "rgba(232,180,90,0.35)",
} as const;

export const backgroundGradient = `linear-gradient(180deg, ${color.backgroundTop} 0%, ${color.background} 55%)`;
export const accentGradient = `linear-gradient(90deg, ${color.primary}, ${color.cyan})`;

/** For member-site screenshots / recordings placed on the dark video (not used yet). */
export const screen = {
  /** Browser-like frame around a light UI, so it reads as "the real site". */
  frame: "#2A2F37",
  frameBorder: "#3A414C",
  radius: 18,
  shadow: "0 24px 60px rgba(0,0,0,0.45)",
  /** Space kept around a screenshot inside the content area. */
  margin: 72,
} as const;

export const font = {
  family: `${fontFamily}, sans-serif`,
  /**
   * Proportional kana spacing. Without it full-width kana keep their side
   * bearings and 「AIチャットとは」 reads like 「AIチャット とは」.
   */
  featureSettings: '"palt" 1',
  regular: 400,
  medium: 500,
  bold: 700,
} as const;

/** Screen regions. Content never enters the subtitle band. */
export const layout = {
  headerHeight: 96,
  subtitleBandHeight: 200,
  sidePadding: 120,
} as const;

export const subtitle = {
  fontSize: 46,
  /** Full-width characters per row (defined in captionLayout, shared with captions.vtt). */
  maxRowWidth: MAX_ROW_WIDTH,
} as const;

export const motion = {
  /** Frames for fade in / out of a scene. */
  fadeFrames: 9,
  /** Frames for a point to appear. */
  revealFrames: 12,
  /** Scenes start this many seconds before their first spoken line. */
  sceneLeadSeconds: 0.4,
  /** A caption stays up to this long after its line ends (until the next line starts). */
  subtitleHoldSeconds: 0.5,
} as const;
