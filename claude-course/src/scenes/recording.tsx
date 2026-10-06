import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BAR, ScreenFrame, type Media, type Rect, type ScreenMark } from "../components/ScreenFrame";
import { FitText } from "../components/FitText";
import { revealProgress, revealStyle } from "../components/reveal";
import { useContentHeight } from "../engine/contentArea";
import { accentGradient, color, font } from "../theme/tokens";

/**
 * "recording" layout: a scene made of beats, each showing real screens
 * (edited recordings / stills) at a moment of the narration. Timing comes
 * only from narration.json: every beat, zoom and highlight starts at a line
 * (`at`, the line id) plus `offset` seconds. Beats are listed per scene in
 * registry.ts (`beats`), in time order.
 */

/** A moment in the scene: the start of line `at` (default: scene start) + offset seconds. */
export type When = { at?: string; offset?: number };

/** An edited recording (.mp4) or a still (.png) under public/, with its pixel size. */
export type BeatMedia = { src: string; width: number; height: number };

/** A highlight box (media pixels) shown from `when` until `until` (default: beat end). */
export type Mark = When & { rect: Rect; until?: When };

/** One screen; the view moves (slow zoom) to each later `views` entry at its moment. */
export type ScreenBeat = When & {
  kind?: "screen";
  media: BeatMedia;
  /** Recordings: source seconds [from, to] at `rate` (> 1 = fast-forward, labelled 早送り). */
  play?: { from: number; to: number; rate?: number };
  views: (When & { view: Rect })[];
  marks?: Mark[];
  /** Label in the frame's top bar, e.g. 変更前 / ブラウザの幅を変えて確認. */
  label?: string;
  /** Accent pill at the right of the bar (default: 早送り when play.rate > 1), e.g. 待ち時間を省略. */
  badge?: string;
  /** Points beside the screen (screen moves right). */
  side?: { heading: string; items: (When & { text: string })[]; width?: number };
};

/** Before / after side by side with the same view and marks. */
export type CompareBeat = When & {
  kind: "compare";
  before: BeatMedia;
  after: BeatMedia;
  view: Rect;
  marks?: Mark[];
};

/** Up to four stills in a 2x2 grid, each appearing at its moment. */
export type GridBeat = When & {
  kind: "grid";
  view: Rect;
  items: (When & { media: BeatMedia; label: string })[];
};

/** Large centered text rows (no screen), each appearing at its moment. "|" = row break. */
export type TextBeat = When & {
  kind: "text";
  rows: (When & { text: string; accent?: boolean })[];
};

export type Beat = ScreenBeat | CompareBeat | GridBeat | TextBeat;

/** Line ids a beat refers to (checked against narration.json on load). */
export const beatLineIds = (beat: Beat): string[] => {
  const whens: When[] = [beat];
  if (beat.kind === "grid") whens.push(...beat.items);
  else if (beat.kind === "text") whens.push(...beat.rows);
  else {
    for (const m of beat.marks ?? []) whens.push(m, ...(m.until ? [m.until] : []));
    if (beat.kind !== "compare") whens.push(...beat.views, ...(beat.side?.items ?? []));
  }
  return whens.flatMap((w) => (w.at === undefined ? [] : [w.at]));
};

const FAST_FORWARD = "早送り";
/** Cross-fade between beats, in frames. */
const BEAT_FADE = 8;
/** Frames for a highlight to fade in / out. */
const MARK_FADE = 6;
/** Room for screens inside the content area (between header and subtitle band). */
const MAX_W = 1720;
/** Screen height available in a content area of height h (frame bar + margin). */
const maxH = (h: number) => h - BAR - 48;
const SIDE_PANEL = 560;
const GAP = 64;

type Clock = { frameOf: (w: When) => number };

const useClock = (lineFrames: Record<string, number>): Clock => {
  const { fps } = useVideoConfig();
  return {
    frameOf: (w) => (w.at !== undefined ? (lineFrames[w.at] ?? 0) : 0) + Math.round((w.offset ?? 0) * fps),
  };
};

const toMedia = (m: BeatMedia): Media => ({ kind: /\.(mp4|webm|mov)$/i.test(m.src) ? "video" : "image", ...m });

/** Width of a viewport showing `view` inside maxW x maxH, keeping the view's aspect. */
const fitWidth = (view: Rect, maxW: number, maxH: number) => Math.round(Math.min(maxW, (maxH * view.w) / view.h));

const ZOOM_FRAMES = 45;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The view at scene frame `f`: each key eases from the previous view over ZOOM_FRAMES. */
const viewAt = (keys: { frame: number; view: Rect }[], f: number): Rect => {
  let v = keys[0].view;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.frame) break;
    const t = ease(Math.min(1, (f - k.frame) / ZOOM_FRAMES));
    const a = v;
    const b = k.view;
    v = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
  }
  return v;
};

const marksAt = (marks: Mark[] | undefined, clock: Clock, f: number, end: number): ScreenMark[] =>
  (marks ?? []).map((m) => {
    const from = clock.frameOf(m);
    const to = m.until ? clock.frameOf(m.until) : end;
    const opacity = interpolate(f, [from, from + MARK_FADE, to - MARK_FADE, to], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { rect: m.rect, opacity };
  });

/** Beat contents. `f` = scene frame, `start`/`end` = the beat's scene frames. */
type BeatViewProps = { clock: Clock; f: number; start: number; end: number };

const ScreenBeatView: React.FC<BeatViewProps & { beat: ScreenBeat }> = ({ beat, clock, f, start, end }) => {
  const keys = beat.views.map((k, i) => ({ frame: i === 0 ? start : clock.frameOf(k), view: k.view }));
  const view = viewAt(keys, f);
  const rate = beat.play?.rate ?? 1;
  const segments = beat.play ? [{ at: 0, from: beat.play.from, to: beat.play.to, rate }] : undefined;
  const badge = beat.badge ?? (beat.play && rate > 1 ? FAST_FORWARD : undefined);
  const h = useContentHeight();
  const sideW = beat.side?.width ?? SIDE_PANEL;
  const maxW = beat.side ? 1920 - 2 * 90 - sideW - GAP : MAX_W;
  const screenEl = (
    <ScreenFrame
      media={toMedia(beat.media)}
      width={fitWidth(view, maxW, maxH(h))}
      view={view}
      segments={segments}
      label={beat.label}
      badge={badge}
      marks={marksAt(beat.marks, clock, f, end)}
      html5Video
    />
  );
  if (!beat.side) {
    return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>{screenEl}</AbsoluteFill>;
  }
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 90px", gap: GAP }}>
      <div style={{ width: sideW, flexShrink: 0, display: "flex", flexDirection: "column", gap: 32 }}>
        <FitText text={beat.side.heading} width={sideW} fontSize={48} style={{ fontWeight: font.bold, color: color.heading, lineHeight: 1.3 }} />
        {beat.side.items.map((item, i) => (
          <div
            key={item.text}
            style={{ ...revealStyle(revealProgress(f, clock.frameOf(item)), "x"), display: "flex", alignItems: "center", gap: 20 }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                flexShrink: 0,
                borderRadius: "50%",
                background: accentGradient,
                color: "#FFFFFF",
                fontSize: 24,
                fontWeight: font.bold,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </div>
            <FitText text={item.text} width={sideW - 66} fontSize={34} style={{ fontWeight: font.medium, color: color.text, lineHeight: 1.4 }} />
          </div>
        ))}
      </div>
      {screenEl}
    </AbsoluteFill>
  );
};

const CompareBeatView: React.FC<BeatViewProps & { beat: CompareBeat }> = ({ beat, clock, f, end }) => {
  const h = useContentHeight();
  const width = fitWidth(beat.view, (MAX_W - GAP) / 2, maxH(h));
  const marks = marksAt(beat.marks, clock, f, end);
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: GAP }}>
      <ScreenFrame media={toMedia(beat.before)} width={width} view={beat.view} label="変更前" marks={marks} />
      <ScreenFrame media={toMedia(beat.after)} width={width} view={beat.view} label="変更後" marks={marks} />
    </AbsoluteFill>
  );
};

const GridBeatView: React.FC<BeatViewProps & { beat: GridBeat }> = ({ beat, clock, f }) => {
  const rowGap = 28;
  const h = useContentHeight();
  const width = fitWidth(beat.view, (MAX_W - 48) / 2, (h - 40 - rowGap - 2 * BAR) / 2);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${width}px)`, columnGap: 48, rowGap }}>
        {beat.items.map((item) => (
          <div key={item.label} style={revealStyle(revealProgress(f, clock.frameOf(item)))}>
            <ScreenFrame media={toMedia(item.media)} width={width} view={beat.view} label={item.label} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const TextBeatView: React.FC<BeatViewProps & { beat: TextBeat }> = ({ beat, clock, f }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
    {beat.rows.map((row) => (
      <div
        key={row.text}
        style={{
          ...revealStyle(revealProgress(f, clock.frameOf(row))),
          fontSize: row.accent ? 92 : 76,
          fontWeight: font.bold,
          lineHeight: 1.3,
          textAlign: "center",
          color: row.accent ? color.cyan : color.heading,
          letterSpacing: "0.02em",
        }}
      >
        {row.text.split("|").map((part) => (
          <div key={part} style={{ whiteSpace: "pre" }}>
            {part}
          </div>
        ))}
      </div>
    ))}
  </AbsoluteFill>
);

/** One beat inside its Sequence: fades in over the previous beat. */
const BeatLayer: React.FC<{ beat: Beat; clock: Clock; start: number; end: number; first: boolean }> = ({
  beat,
  clock,
  start,
  end,
  first,
}) => {
  const local = useCurrentFrame();
  const f = local + start;
  const opacity = first ? 1 : interpolate(local, [0, BEAT_FADE], [0, 1], { extrapolateRight: "clamp" });
  const props = { clock, f, start, end };
  return (
    <AbsoluteFill style={{ opacity }}>
      {beat.kind === "compare" ? (
        <CompareBeatView beat={beat} {...props} />
      ) : beat.kind === "text" ? (
        <TextBeatView beat={beat} {...props} />
      ) : beat.kind === "grid" ? (
        <GridBeatView beat={beat} {...props} />
      ) : (
        <ScreenBeatView beat={beat} {...props} />
      )}
    </AbsoluteFill>
  );
};

export const RecordingBeats: React.FC<{ sceneId: string; beats: Beat[] | undefined; lineFrames: Record<string, number> }> = ({
  sceneId,
  beats,
  lineFrames,
}) => {
  const { durationInFrames } = useVideoConfig();
  const clock = useClock(lineFrames);
  if (!beats || beats.length === 0) throw new Error(`Scene ${sceneId} (layout "recording") has no beats in registry.ts.`);
  const starts = beats.map((b, i) => (i === 0 ? 0 : clock.frameOf(b)));
  return (
    <>
      {beats.map((beat, i) => {
        const start = starts[i];
        // Each beat stays until the next has fully faded in (or the scene ends).
        const end = i + 1 < beats.length ? Math.min(durationInFrames, starts[i + 1] + BEAT_FADE) : durationInFrames;
        return (
          <Sequence key={i} from={start} durationInFrames={Math.max(1, end - start)} layout="none">
            <BeatLayer beat={beat} clock={clock} start={start} end={end} first={i === 0} />
          </Sequence>
        );
      })}
    </>
  );
};
