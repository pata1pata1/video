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
  /** The ranking board (pattern-02): every rank, with the ones already introduced opened. */
  board?: boolean;
  /** Glowing keywords over the footage (pattern-03); without `footage`, over the footage already on screen. */
  words?: string[];
} & PanelDef & {
  /** pattern-01: the background footage from this line on (else the scene's, else the script's). */
  background?: string;
};
/**
 * pattern-01 panels (src/stage.tsx), one per segment, above the heading band.
 * `label` is the band's text; a panel without it shows no band.
 */
export type PanelDef = {
  label?: string;
  /** A photo or video shown whole, its credit bottom-right. */
  photo?: string;
  /** Big glowing heading ("\n" breaks the line) and an optional white line under it. */
  headline?: { title: string; sub?: string };
  /** Confirmed facts: a bold head, a grey line, and a badge (the pattern's "確認" if not set; "" for none). */
  findings?: { tag?: string; items: { head: string; body?: string; badge?: string }[] };
  /** Label/value pairs, with an optional photo on the left and a caption over it. */
  data?: { tag?: string; items: { label: string; value: string }[]; photo?: string; caption?: string };
  /** Numbered items (up to 3) with an optional photo on the left. */
  list?: { items: { head: string; body?: string }[]; photo?: string };
};
const PANEL_KEYS = ["photo", "headline", "findings", "data", "list"] as const;
export type ScriptLine = { id: string; text: string; visual?: Visual; caption?: string; chunks?: string[] };
export type SceneDef = {
  id: string;
  kind: "opening" | "chapter" | "ending";
  number?: number;
  heading?: string;
  /** Footage behind the chapter card. */
  footage?: string;
  /** pattern-01: background footage for this scene. */
  background?: string;
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
  /** pattern-01: white lines under the accent word, a cyan question at the bottom, a small note bottom-right. */
  after?: string[];
  question?: string;
  note?: string;
};
/** A media file recorded in assets/asset-sources.json. */
export type MediaSource = {
  mediaType: "video" | "photo";
  file: string;
  creator?: string;
  sourceName: string;
  provider?: string;
  /** Exact on-screen credit ("\n" for two rows); overrides the pattern's wording. */
  onScreenCredit?: string;
  usageType?: "illustrative" | "documentary" | "unknown";
  /** pattern-01: a clip already laid out for the screen (sharp footage on a blurred copy); shown as the background without blur or dimming. */
  composed?: boolean;
};
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
  /** pattern-01: background footage for the whole video (scenes and lines may change it). */
  background?: string;
  scenes: SceneDef[];
  thumbnails: ThumbnailDef[];
};
const MEDIA = mediaSources as Record<string, MediaSource>;
export const mediaFor = (key: string): MediaSource | undefined => MEDIA[key];
const FRAMES = mediaFrames as Record<string, number>;
/**
 * A picked video as a 30 fps JPEG sequence (scripts/mt.mjs prepare-media),
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
  if (want !== got) throw new Error("narration.json is out of date. Run: node scripts/mt.mjs narration --project=<id>");
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
  | { kind: "footage"; key: string; words?: string[] }
  | { kind: "diagram"; name: string }
  | { kind: "stat"; stat: Stat; footage?: string }
  | { kind: "points"; points: Points }
  | { kind: "board"; opened: number }
  | { kind: "panel"; panel: PanelDef }
  | { kind: "ending" };
/** Seconds (from the segment start) at which each diagram step begins. */
export type Segment = { shown: Shown; from: number; to: number; steps: { at: number; step: number }[]; chapter?: SceneDef };

/** Chapters (ranks) before this scene: the ones the board shows opened. */
const openedBefore = (scene: SceneDef) => SCRIPT.scenes.slice(0, SCRIPT.scenes.indexOf(scene)).filter((s) => s.kind === "chapter").length;

/** pattern-01: every line shows a panel (the ending too); a line without one keeps the last. */
const STAGE = !!PATTERN.design.stage;

function panelOf(line: ScriptLine, prev: Shown | undefined): Shown {
  const v = line.visual;
  const given = v ? PANEL_KEYS.filter((k) => v[k] !== undefined) : [];
  if (v && given.length > 0) {
    if (given.length > 1 || (given.length > 0 && v.footage)) throw new Error(`${line.id}: one panel per line (footage / ${PANEL_KEYS.join(" / ")})`);
    const panel: PanelDef = { [given[0]]: v[given[0]] };
    if (v.label !== undefined) panel.label = v.label;
    return { kind: "panel", panel };
  }
  // visual.footage: the footage itself is the screen (it becomes the background, shown as it is when composed); no panel
  if (v?.footage) return { kind: "panel", panel: v.label !== undefined ? { label: v.label } : {} };
  if (v?.label !== undefined && prev?.kind === "panel") return { kind: "panel", panel: { ...prev.panel, label: v.label } };
  if (!prev) throw new Error(`${line.id}: the first line needs a panel (${PANEL_KEYS.join(" / ")})`);
  return prev;
}

function shownOf(scene: SceneDef, line: ScriptLine, index: number, prev: Shown | undefined): Shown {
  if (STAGE) return panelOf(line, prev);
  const v = line.visual;
  // the board opens the ranks of earlier scenes, and this scene's once it has been named
  if (v?.board) return { kind: "board", opened: openedBefore(scene) + (scene.kind === "chapter" && index > 0 ? 1 : 0) };
  if (scene.kind === "ending") return { kind: "ending" };
  // title and stat can sit on footage (visual.footage is then their background)
  if (v?.title) return { kind: "title", footage: v.footage };
  if (v?.stat) return { kind: "stat", stat: v.stat, footage: v.footage };
  if (v?.words) {
    const key = v.footage ?? (prev && "footage" in prev ? prev.footage : prev?.kind === "footage" ? prev.key : undefined);
    if (!key) throw new Error(`${line.id}: visual.words needs footage`);
    return { kind: "footage", key, words: v.words };
  }
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

/**
 * pattern-01 background track: [from, to) seconds per footage key. The
 * script's background, changed by a scene's and then by a line's.
 */
export const backgroundSegments: { key: string; from: number; to: number }[] = (() => {
  if (!STAGE) return [];
  const out: { key: string; from: number; to: number }[] = [];
  let key = SCRIPT.background;
  for (const scene of SCRIPT.scenes) {
    if (scene.background) key = scene.background;
    for (const line of scene.lines) {
      if (line.visual?.background ?? line.visual?.footage) key = line.visual.background ?? line.visual.footage;
      if (!key) throw new Error(`${line.id}: no background (set "background" on the script, the scene or the line)`);
      const last = out[out.length - 1];
      if (last?.key === key) continue;
      const at = out.length === 0 ? 0 : lineStart(line.id) - LEAD;
      if (last) last.to = at;
      out.push({ key, from: at, to: NARRATION.durationSeconds });
    }
  }
  return out;
})();

/** Subtitle cues: from the line start until CAPTION_HOLD after it ends or the next line starts. */
export const captionCues = NARRATION.lines.map((l, i) => {
  const next = NARRATION.lines[i + 1];
  return { ...l, until: Math.min(l.end + CAPTION_HOLD, next ? next.start : Infinity) };
});

export const CHAPTERS = SCRIPT.scenes.filter((s) => s.kind === "chapter");

/** The VOICEVOX speaker credited on the ending (the script may override the pattern). */
export const SPEAKER_NAME = SCRIPT.voice?.speakerName ?? PATTERN.voice.speakerName;

// ---------------------------------------------------------------- short subtitles (pattern-01)

/** Rough reading length of a piece (in morae), to share a line's time between its pieces. */
const readingWeight = (text: string) => {
  let w = 0;
  for (const ch of text) {
    if (/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/u.test(ch)) continue;
    if (/[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(ch)) w += 1;
    else if (/\p{Script=Han}/u.test(ch)) w += 1.8;
    else if (/[0-9０-９]/u.test(ch)) w += 1.6;
    else if (/[A-Za-zＡ-Ｚａ-ｚ]/u.test(ch)) w += 0.8;
    else if (/[、，,]/u.test(ch)) w += 1.4; // the pause at a comma
    else if (/[。！？!?]/u.test(ch)) w += 1;
  }
  return Math.max(w, 0.5);
};

/** Particles a long phrase may be cut after (before a new word starts). */
const CUT_AFTER = /[はがをにでとのもへや]/u;
const WORD_START = /[\p{Script=Han}\p{Script=Katakana}「『（0-9０-９A-Za-z]/u;

/** Splits a caption into pieces of at most maxChars: at 「、」 first, then after a particle nearest the middle. */
export function splitChunks(text: string, maxChars: number): string[] {
  const len = (p: string) => [...p.replace(/、$/u, "")].length;
  // cut after 「、」「？」「！」, but a very short piece (2-3 characters) joins the next one when they fit together
  const parts = text
    .split(/(?<=[、？！])/u)
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce<string[]>((acc, p) => {
      const last = acc[acc.length - 1];
      if (last !== undefined && len(last) <= 3 && !/[？！]$/u.test(last) && len(last + p) <= maxChars) acc[acc.length - 1] = last + p;
      else acc.push(p);
      return acc;
    }, []);
  const out: string[] = [];
  const cut = (p: string) => {
    if (len(p) <= maxChars) return void out.push(p);
    let best = -1;
    for (let i = 1; i < p.length - 2; i++) {
      if (CUT_AFTER.test(p[i]) && WORD_START.test(p[i + 1]) && (best < 0 || Math.abs(i - p.length / 2) < Math.abs(best - p.length / 2))) best = i;
    }
    if (best < 0) return void out.push(p);
    cut(p.slice(0, best + 1));
    cut(p.slice(best + 1));
  };
  parts.forEach(cut);
  return out;
}

const scriptLines = new Map(SCRIPT.scenes.flatMap((s) => s.lines.map((l) => [l.id, l] as const)));

/** Each line's pieces, timed in proportion to their reading length; the last holds like a whole caption. */
export const chunkCues: { start: number; until: number; caption: string }[] = (() => {
  if (!PATTERN.subtitle.chunk) return [];
  return captionCues.flatMap((cue) => {
    const pieces = scriptLines.get(cue.id)?.chunks ?? splitChunks(cue.caption, PATTERN.subtitle.maxRowChars);
    const weights = pieces.map(readingWeight);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = cue.start;
    return pieces.map((p, i) => {
      const start = t;
      t += ((cue.end - cue.start) * weights[i]) / total;
      return { start, until: i === pieces.length - 1 ? cue.until : t, caption: p.replace(/[、。]$/u, "") };
    });
  });
})();
