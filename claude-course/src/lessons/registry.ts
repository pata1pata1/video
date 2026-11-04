import captionsFreeTrial from "../../lessons/free-trial/captions.json";
import lessonFreeTrial from "../../lessons/free-trial/lesson.json";
import captionsSalesIntro from "../../lessons/sales-intro/captions.json";
import lessonSalesIntro from "../../lessons/sales-intro/lesson.json";
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

/**
 * A lesson's script and presentation passed as props (composition "Lesson"):
 * lessons made after 2026-11-03 live in their own project folder
 * (<id>/input/lesson.json, captions.json, presentation.json) instead of an entry
 * below. audioFile is under the render's public folder.
 */
export type LessonData = Pick<LessonEntry, "script" | "audioFile" | "cues" | "shots" | "captions" | "beats" | "hideHeader">;

/** One entry per lesson video. Adding a lesson = adding an entry. */
export const lessons: LessonEntry[] = [
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
