// The look, pacing and voice credit fixed by the script's pattern
// (patterns/<pattern>/*.json). Add an entry here when a new pattern is made.
import { script } from "./current";
import config02 from "../patterns/pattern-02/config.json";
import design02 from "../patterns/pattern-02/design.json";
import subtitle02 from "../patterns/pattern-02/subtitle.json";
import thumbnail02 from "../patterns/pattern-02/thumbnail.json";
import voice02 from "../patterns/pattern-02/voice.json";
import config03 from "../patterns/pattern-03/config.json";
import design03 from "../patterns/pattern-03/design.json";
import subtitle03 from "../patterns/pattern-03/subtitle.json";
import thumbnail03 from "../patterns/pattern-03/thumbnail.json";
import voice03 from "../patterns/pattern-03/voice.json";

/** The settings every pattern has: keys found in both A and B, nested. */
type Common<A, B> = A extends readonly unknown[] ? A : A extends object ? (B extends object ? { [K in keyof A & keyof B]: Common<A[K], B[K]> } : A) : A;

/** Settings only some patterns have. */
type Design = Common<typeof design02, typeof design03> & {
  /** Text on accent fills (dark for bright neon colors). */
  color: { onAccent?: string };
  /** Font for numbers and Latin labels (Orbitron). */
  font: { display?: string };
  /** Grid lines and a glow (a CSS gradient) on the paper background. */
  paper?: { grid?: { color: string; size: number }; glow?: string };
  /** Neon glow on accent text and lines (blur in px). */
  glow?: { blur: number };
  /** HUD look: panels with cut corners and corner brackets. */
  panel?: { cut: number; fill: string };
  /** HUD rings and a scan line on the title screen; `tag` is the small Latin label over the title. */
  title: { hud?: boolean; tag?: string; mainColor?: string };
  /** "rank": a big rank ring instead of the chapter label; medals by rank. */
  chapterCard: { style?: string; badgeSize?: number; badgeLabel?: string; medals?: Record<string, string> };
  /** Text in the chapter tag's badge ("{n}位"); the number alone if not set. */
  chapterTag: { format?: string; style?: string };
  /** Credit top-left instead of top-right (when the chapter tag takes the right). */
  footageCredit: { left?: number };
  /** Worn-film look on footage (pattern-03): blur and saturation of the picture, grain, scratches, flicker, vignette; photos framed on a blurred copy. */
  film?: { blur: number; saturate: number; grain: number; scratches: number; flicker: number; vignette: number };
  /** Glowing keywords over footage (visual.words): one color per word in turn. */
  words?: { colors: string[]; size: number; staggerFrames: number };
  /** The ranking board (visual.board). */
  board?: { title: string; hidden: string; rowSize: number };
};
type Pattern = {
  config: Common<typeof config02, typeof config03>;
  design: Design;
  subtitle: Common<typeof subtitle02, typeof subtitle03> & { border?: string; shadow?: string };
  thumbnail: Common<typeof thumbnail02, typeof thumbnail03> & {
    /** Accent word and badge number colors (yellow if not set); a glow on the text; red specks. */
    color: { accentWord?: string; badgeBig?: string };
    layout: { textGlow?: string; splatter?: { count: number; color: string } };
  };
  voice: Common<typeof voice02, typeof voice03>;
};

const PATTERNS: Record<string, Pattern> = {
  "pattern-02": { config: config02, design: design02, subtitle: subtitle02, thumbnail: thumbnail02, voice: voice02 },
  "pattern-03": { config: config03, design: design03, subtitle: subtitle03, thumbnail: thumbnail03, voice: voice03 },
};

const id = (script as { pattern?: string }).pattern;
if (!id || !(id in PATTERNS)) throw new Error(`script "${(script as { id: string }).id}": unknown pattern "${id}" (add it to src/pattern.ts)`);

export const PATTERN = PATTERNS[id];
