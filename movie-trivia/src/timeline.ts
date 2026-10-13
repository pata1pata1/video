// The current video (src/current.ts) as typed data, and its timeline.
import { mediaFrames, mediaSources, narration, script } from "./current";
import { PATTERN } from "./pattern";

export type Stat = { value: string; unit: string; label: string };
/** A numbered list card; the title is the video's own words. */
export type Points = { title: string; items: string[] };
/**
 * What the screen shows from a line on (it stays until a later line sets
 * another). The first line of a chapter shows the chapter card unless it
 * sets something itself.
 */
export type Visual = {
  title?: boolean;
  footage?: string;
  diagram?: string;
  step?: number;
  stat?: Stat;
  points?: Points;
};
export type ScriptLine = { id: string; text: string; visual?: Visual };
export type SceneDef = {
  id: string;
  kind: "opening" | "chapter" | "ending";
  number?: number;
  heading?: string;
  /** Footage behind the chapter card. */
  footage?: string;
  lines: ScriptLine[];
};
export type ThumbnailDef = {
  id: string;
  photo: string;
  ribbon: string;
  lines: string[];
  accent: string;
  small?: string;
  /** Frame of a video source to use (default: the pattern's videoFrame). */
  frame?: number;
  /** CSS object-position of the footage. */
  imagePosition?: string;
  /** Round badge for a number (optional). */
  badge?: { top: string; big: string; bottom?: string };
};
/** A media file recorded in public/media/<id>/sources.json. */
export type MediaSource = { mediaType: "video" | "photo"; file: string; creator?: string; sourceName: string };
export type Line = { id: string; sceneId: string; start: number; end: number; caption: string };

export const SCRIPT = script as unknown as {
  id: string;
  title: string;
  titleTop: string;
  titleMain: string;
  titleSub: string;
  /** Overrides the pattern's ending title (design.json ending.title). */
  endingTitle?: string;
  pattern: string;
  /** Overrides the pattern's voice (patterns/<pattern>/voice.json). */
  voice?: { speakerName?: string };
  scenes: SceneDef[];
  thumbnails: ThumbnailDef[];
};
const MEDIA = mediaSources as Record<string, MediaSource>;
export const mediaFor = (key: string): MediaSource | undefined => MEDIA[key];
const FRAMES = mediaFrames as Record<string, number>;
/**
 * A picked video as a 30 fps JPEG sequence (scripts/prepare-media.mjs),
 * played forward then backward so a loop never jumps.
 * Used instead of <Html5Video>, whose per-frame seek jumps back and forth.
 */
export const videoFrameFile = (key: string, frame: number): string | undefined => {
  const count = FRAMES[key];
  if (!count) return undefined;
  const cycle = Math.max(1, 2 * count - 2);
  const k = frame % cycle;
  const i = k < count ? k : cycle - k;
  return `media/${SCRIPT.id}/frames/${key}/${String(i + 1).padStart(4, "0")}.jpg`;
};
export const NARRATION = narration as { durationSeconds: number; lines: Line[]; scenes: { id: string; start: number; end: number }[] };
export const AUDIO_SRC = `audio/${SCRIPT.id}/narration.wav`;

/** Visuals change this long before their line is spoken. */
const LEAD = PATTERN.config.transition.visualLeadSeconds;
/** A subtitle stays this long after its line ends (unless the next line starts). */
const CAPTION_HOLD = PATTERN.config.transition.captionHoldSeconds;

// The script and narration.json must describe the same lines in the same order.
{
  const want = SCRIPT.scenes.flatMap((s) => s.lines.map((l) => l.id)).join(",");
  const got = NARRATION.lines.map((l) => l.id).join(",");
  if (want !== got) throw new Error("narration.json is out of date. Run: node scripts/build-narration.mjs");
}

const lineById = new Map(NARRATION.lines.map((l) => [l.id, l]));
export const lineStart = (id: string) => {
  const l = lineById.get(id);
  if (!l) throw new Error(`unknown line ${id}`);
  return l.start;
};

/** What a segment shows. Consecutive lines with the same diagram/footage/points share one segment. */
export type Shown =
  | { kind: "title"; footage?: string }
  | { kind: "chapter"; scene: SceneDef; footage?: string }
  | { kind: "footage"; key: string }
  | { kind: "diagram"; name: string }
  | { kind: "stat"; stat: Stat; footage?: string }
  | { kind: "points"; points: Points }
  | { kind: "ending" };
/** Seconds (from the segment start) at which each diagram step begins. */
export type Segment = { shown: Shown; from: number; to: number; steps: { at: number; step: number }[]; chapter?: SceneDef };

function shownOf(scene: SceneDef, line: ScriptLine, index: number, prev: Shown | undefined): Shown {
  const v = line.visual;
  if (scene.kind === "ending") return { kind: "ending" };
  // title and stat can sit on footage (visual.footage is then their background)
  if (v?.title) return { kind: "title", footage: v.footage };
  if (v?.stat) return { kind: "stat", stat: v.stat, footage: v.footage };
  if (v?.footage) return { kind: "footage", key: v.footage };
  if (v?.diagram) return { kind: "diagram", name: v.diagram };
  if (v?.points) return { kind: "points", points: v.points };
  if (index === 0 && scene.kind === "chapter") return { kind: "chapter", scene, footage: scene.footage };
  if (!prev) throw new Error(`${line.id}: no visual`);
  return prev;
}

const sameShown = (a: Shown, b: Shown) => JSON.stringify(a) === JSON.stringify(b);

/** The whole video as a list of on-screen segments: [from, to) in seconds. */
export const segments: Segment[] = (() => {
  const out: Segment[] = [];
  let prev: Shown | undefined;
  for (const scene of SCRIPT.scenes) {
    scene.lines.forEach((line, i) => {
      const shown = shownOf(scene, line, i, prev);
      const at = out.length === 0 ? 0 : lineStart(line.id) - LEAD;
      const last = out[out.length - 1];
      // a new scene always starts a new segment (except the ending's own lines)
      if (last && sameShown(last.shown, shown) && i > 0) {
        if (line.visual?.step !== undefined) last.steps.push({ at: at - last.from, step: line.visual.step });
      } else {
        if (last) last.to = at;
        out.push({ shown, from: at, to: NARRATION.durationSeconds, steps: [{ at: 0, step: line.visual?.step ?? 1 }], chapter: scene.kind === "chapter" ? scene : undefined });
      }
      prev = shown;
    });
  }
  return out;
})();

/** Diagram step shown `t` seconds into a segment. */
export const stepAt = (steps: Segment["steps"], t: number) => [...steps].reverse().find((s) => s.at <= t)?.step ?? 1;

/** Subtitle cues: from the line start until CAPTION_HOLD after it ends or the next line starts. */
export const captionCues = NARRATION.lines.map((l, i) => {
  const next = NARRATION.lines[i + 1];
  return { ...l, until: Math.min(l.end + CAPTION_HOLD, next ? next.start : Infinity) };
});

export const CHAPTERS = SCRIPT.scenes.filter((s) => s.kind === "chapter");

/** The VOICEVOX speaker credited on the ending (the script may override the pattern). */
export const SPEAKER_NAME = SCRIPT.voice?.speakerName ?? PATTERN.voice.speakerName;
