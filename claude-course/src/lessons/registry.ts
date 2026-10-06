import captionsFreeTrial from "../../lessons/free-trial/captions.json";
import lessonFreeTrial from "../../lessons/free-trial/lesson.json";
import captionsSalesIntro from "../../lessons/sales-intro/captions.json";
import lessonSalesIntro from "../../lessons/sales-intro/lesson.json";
import captions01 from "../../lessons/lesson-01/captions.json";
import lesson01 from "../../lessons/lesson-01/lesson.json";
import type { Rect } from "../components/ScreenFrame";
import type { LessonScript } from "../engine/types";
import type { Beat } from "../scenes/recording";
import { freeTrialBeats, freeTrialCues } from "./free-trial";
import { salesIntroBeats, salesIntroCues } from "./sales-intro";

/** How a scene's screenshot / recording is shown (media path is visual.src / visual.recording). */
export type Shot = {
  /** The media's pixel size. */
  size: { width: number; height: number };
  /** Static visible part (crop); default = whole media. */
  view?: Rect;
  /** Slow zoom from the whole media to `focus`, starting zoomAtSeconds after the scene starts. */
  focus?: Rect;
  zoomAtSeconds?: number;
  /**
   * Recordings: which source seconds [from, to] to play. A segment starts at
   * the scene start, or when line `atLine` starts; it holds its last frame
   * until the next segment.
   */
  segments?: { atLine?: string; from: number; to: number }[];
};

export type LessonEntry = {
  /** Composition ID shown in Studio / used for render. */
  compositionId: string;
  key: string;
  script: LessonScript;
  /** Paths under public/. */
  narrationFile: string;
  audioFile: string;
  /**
   * Presentation cues kept out of lesson.json: for a scene's list (items /
   * steps / chips / actions), the line whose start reveals each entry.
   */
  cues: Record<string, string[]>;
  /** Screenshot / recording presentation per scene. */
  shots: Record<string, Shot>;
  /**
   * Display-only caption wording per line id (lessons/lesson-XX/captions.json).
   * The spoken text in lesson.json / narration.json stays as generated.
   */
  captions: Record<string, string>;
  /** "recording" scenes: what is on screen when (src/scenes/recording.tsx). */
  beats?: Record<string, Beat[]>;
  /**
   * true = no header (course name / chapter label) in any scene; the content
   * area grows into that space. Used by sales-intro only.
   */
  hideHeader?: boolean;
};

/** Member-site screenshots: 1920x1080 at deviceScaleFactor 2. */
const SCREENSHOT = { width: 3840, height: 2160 };
/** claude-supporter-demo.mp4 */
const SUPPORTER_RECORDING = { width: 1448, height: 866 };

/** One entry per lesson video. Adding a lesson = adding an entry. */
export const lessons: LessonEntry[] = [
  {
    compositionId: "L01-Intro",
    key: "01",
    script: lesson01 as LessonScript,
    narrationFile: "lessons/lesson-01/audio/narration.json",
    audioFile: "lessons/lesson-01/audio/narration.wav",
    cues: {
      "s02-agenda": ["l004", "l005", "l006"],
      "s05-what": ["l009", "l010"],
      "s06-compare": ["l011", "l012", "l012", "l013", "l013"],
      "s07-examples": ["l015", "l016", "l017", "l018"],
      "s08-flow": ["l021", "l022", "l023"],
      "s09-loop": ["l027", "l027", "l027"],
      "s11-lessons": ["l030", "l030", "l031", "l031", "l032", "l032", "l032", "l033", "l033"],
      "s12-practice": ["l034", "l035", "l036", "l036"],
      "s15-glossary": ["l043", "l043", "l043", "l043", "l044", "l044"],
      "s18-troubles": ["l047", "l048", "l048", "l049"],
      "s20-questions": ["l053", "l054", "l055", "l056"],
      "s22-cautions": ["l060", "l061", "l063"],
      "s24-goal": ["l065", "l065", "l065", "l066"],
      "s25-help": ["l067", "l067", "l067"],
    },
    shots: {
      // Course title card and the first STEPs.
      "s11-lessons": { size: SCREENSHOT, focus: { x: 540, y: 180, w: 2560, h: 1440 }, zoomAtSeconds: 2 },
      // The lesson body column.
      "s12-practice": { size: SCREENSHOT, focus: { x: 1060, y: 150, w: 2200, h: 1238 }, zoomAtSeconds: 2 },
      // "表示中：Windows" switch at the top of the lesson body.
      "s13-platform": { size: SCREENSHOT, focus: { x: 1100, y: 0, w: 2200, h: 1238 }, zoomAtSeconds: 2 },
      // The prompt block and its コピー button.
      "s14-copy": { size: SCREENSHOT, focus: { x: 1060, y: 549, w: 2200, h: 1238 }, zoomAtSeconds: 2 },
      // Category chips and the first term cards.
      "s15-glossary": { size: SCREENSHOT, focus: { x: 540, y: 180, w: 2560, h: 1440 }, zoomAtSeconds: 2 },
      // Top card with the download button.
      "s19-supporter": { size: SCREENSHOT, focus: { x: 1060, y: 0, w: 2200, h: 1238 }, zoomAtSeconds: 3 },
      // Open the supporter (0.5-2.9s), then type the commit/push question (8.8-12.4s)
      // when the narration reaches that example. The wait before the answer is skipped.
      "s20-questions": {
        size: SUPPORTER_RECORDING,
        view: { x: 274, y: 110, w: 900, h: 538 },
        segments: [
          { from: 0.5, to: 2.9 },
          { atLine: "l055", from: 8.8, to: 12.4 },
        ],
      },
      // The start of the answer only (definitions); the "修正→commit→push" line
      // below (y≈268) stays out of the crop.
      "s21-steps": {
        size: SUPPORTER_RECORDING,
        view: { x: 330, y: 70, w: 670, h: 175 },
        segments: [{ from: 18.8, to: 23.6 }],
      },
    },
    captions: captions01.overrides,
  },
  {
    // Free trial video for newsletter subscribers (not a numbered lesson).
    compositionId: "FreeTrial",
    key: "free-trial",
    script: lessonFreeTrial as LessonScript,
    narrationFile: "free-trial/audio/narration.json",
    audioFile: "free-trial/audio/narration.wav",
    cues: freeTrialCues,
    shots: {},
    captions: captionsFreeTrial.overrides,
    beats: freeTrialBeats,
  },
  {
    // Course intro video embedded in the sales page.
    compositionId: "SalesIntro",
    key: "sales-intro",
    script: lessonSalesIntro as LessonScript,
    narrationFile: "sales-intro/audio/narration.json",
    audioFile: "sales-intro/audio/narration.wav",
    cues: salesIntroCues,
    shots: {},
    captions: captionsSalesIntro.overrides,
    beats: salesIntroBeats,
    hideHeader: true,
  },
];
