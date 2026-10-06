// Shapes of lessons/lesson-XX/lesson.json and the generated narration.json
// (scripts/voicevox/build-narration.mjs). Only the fields the video uses.

export type ScriptLine = { id: string; text: string; yomi?: string };

export type ScriptScene = {
  id: string;
  layout: string;
  durationSeconds?: number;
  visual?: Record<string, unknown>;
  lines: ScriptLine[];
};

export type ScriptChapter = {
  id: string;
  number: string;
  title: string;
  scenes: ScriptScene[];
};

export type LessonScript = {
  id: string;
  lesson: string;
  course: string;
  title: string;
  chapters: ScriptChapter[];
};

export type TimedChapter = { id: string; number: string; title: string; start: number; end: number };
export type TimedScene = { id: string; chapterId: string; layout: string; start: number; end: number };
export type TimedLine = {
  id: string;
  chapterId: string;
  sceneId: string;
  start: number;
  end: number;
  text: string;
  caption: string;
};

export type Narration = {
  lessonId: string;
  credit: string;
  durationSeconds: number;
  chapters: TimedChapter[];
  scenes: TimedScene[];
  lines: TimedLine[];
};
