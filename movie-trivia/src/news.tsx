import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { usePop } from "./components";
import { type News, PATTERN } from "./pattern";
import { AUDIO_SRC, captionCues, lineStart, mediaFor, type MediaSource, NARRATION, type RosterEntry, SCRIPT, SPEAKER_NAME, videoFrameFile } from "./timeline";
import { color, font } from "./theme";

/**
 * pattern-04 (design.news): one big picture (the person's photo, or footage),
 * a small name label top-left, and big subtitles. Nothing else on screen, so
 * the viewer does not tire (the user's rule, 2026-11-16).
 */
const N = () => PATTERN.design.news as News;
const FADE = PATTERN.config.transition.fadeFrames;
const LEAD = PATTERN.config.transition.visualLeadSeconds;
const SUB = PATTERN.subtitle;

// ---------------------------------------------------------------- timeline

/** The label top-left: a person (from the roster) or a plain heading. */
type Label = { kind: "person"; entry: RosterEntry } | { kind: "heading"; title: string; sub?: string };
type Span<T> = { value: T; from: number; to: number };

const ROSTER = new Map((SCRIPT.roster ?? []).map((r) => [r.id, r]));
const entryOf = (id: string, where: string): RosterEntry => {
  const r = ROSTER.get(id);
  if (!r) throw new Error(`${where}: no roster entry "${id}" (add it to "roster" in the script)`);
  if (!(r.status in N().status)) throw new Error(`roster "${id}": unknown status "${r.status}" (design.news.status)`);
  return r;
};

/** Consecutive equal values joined into spans [from, to) in seconds. */
function spans<T>(events: { at: number; value: T }[]): Span<T>[] {
  const out: Span<T>[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && JSON.stringify(last.value) === JSON.stringify(e.value)) continue;
    if (last) last.to = e.at;
    out.push({ value: e.value, from: e.at, to: NARRATION.durationSeconds });
  }
  return out;
}

const timeline = (() => {
  const media: { at: number; value: string }[] = [];
  const labels: { at: number; value: Label | null }[] = [];
  let first = true;
  for (const scene of SCRIPT.scenes) {
    for (const line of scene.lines) {
      const at = first ? 0 : lineStart(line.id) - LEAD;
      const v = line.visual ?? {};
      if (first && !v.footage) throw new Error(`${line.id}: the first line needs footage`);
      first = false;
      if (v.footage) media.push({ at, value: v.footage });
      // a label stays until another label, `clear`, or new footage without one
      if (v.profile) labels.push({ at, value: { kind: "person", entry: entryOf(v.profile, line.id) } });
      else if (v.headline) labels.push({ at, value: { kind: "heading", title: v.headline.title.replace(/\n/g, " "), sub: v.headline.sub } });
      else if (v.clear || v.footage) labels.push({ at, value: null });
    }
  }
  return { media: spans(media), labels: spans(labels) };
})();

const endingFrom = (() => {
  const ending = SCRIPT.scenes.find((s) => s.kind === "ending");
  return ending ? lineStart(ending.lines[0].id) - LEAD : Infinity;
})();

// ---------------------------------------------------------------- helpers

const useCrossfade = (startFrame: number, durationInFrames: number) => {
  const frame = useCurrentFrame();
  const fadeIn = startFrame === 0 ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return Math.min(fadeIn, fadeOut);
};

const mediaOf = (key: string): MediaSource => {
  const m = mediaFor(key);
  if (!m) throw new Error(`no media "${key}" in assets/asset-sources.json`);
  return m;
};

const isIllustrative = (m: MediaSource) => m.usageType === "illustrative" || m.provider === "pexels" || m.provider === "ai-generated";

const creditOf = (m: MediaSource): string => {
  const S = N().screen;
  if (m.onScreenCredit) return m.onScreenCredit;
  if (isIllustrative(m)) return m.mediaType === "video" ? S.illustrative : S.illustrativePhoto;
  return `${S.source}${m.sourceName}${m.creator ? ` / ${m.creator.trim()}` : ""}`;
};

const outline = (w: number, c = "#000") =>
  [`${w}px 0 ${c}`, `-${w}px 0 ${c}`, `0 ${w}px ${c}`, `0 -${w}px ${c}`, `${w}px ${w}px ${c}`, `-${w}px ${w}px ${c}`, `${w}px -${w}px ${c}`, `-${w}px -${w}px ${c}`].join(", ");

// ---------------------------------------------------------------- the picture

/** Footage fills the screen; a photo is shown whole and sharp on a blurred copy of itself. */
const Picture: React.FC<{ mediaKey: string; from: number; startFrame: number; durationInFrames: number }> = ({ mediaKey, from, startFrame, durationInFrames }) => {
  const frame = useCurrentFrame();
  const opacity = useCrossfade(startFrame, durationInFrames);
  const m = mediaOf(mediaKey);
  const S = N().screen;
  const credit = (
    <div style={{ position: "absolute", right: 36, top: 26, fontFamily: font.body, fontWeight: 700, fontSize: S.creditSize, color: "#FFFFFF", textShadow: outline(2, "rgba(0,0,0,0.8)") }}>
      {creditOf(m)}
    </div>
  );
  if (m.mediaType === "video") {
    const still = videoFrameFile(mediaKey, from + frame);
    if (!still) throw new Error(`${mediaKey}: video frames missing — run node scripts/mt.mjs prepare-media --project=${SCRIPT.id}`);
    return (
      <AbsoluteFill style={{ opacity }}>
        <Img src={staticFile(still)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: `rgba(0,0,0,${S.dim})` }} />
        {credit}
      </AbsoluteFill>
    );
  }
  const zoom = 1 + frame * 0.00025;
  return (
    <AbsoluteFill style={{ opacity, background: "#000" }}>
      <Img src={staticFile(m.file)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.42)", transform: "scale(1.15)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: S.photoTop, height: S.photoHeight, display: "flex", justifyContent: "center" }}>
        <Img
          src={staticFile(m.file)}
          style={{ height: "100%", maxWidth: 1800, objectFit: "contain", transform: `scale(${zoom})`, transformOrigin: "center 40%", boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}
        />
      </div>
      {credit}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the label

const LabelView: React.FC<{ label: Label; startFrame: number; durationInFrames: number }> = ({ label, startFrame, durationInFrames }) => {
  const opacity = useCrossfade(startFrame, durationInFrames);
  const p = usePop(4, 22);
  const L = N().label;
  const move = { opacity: opacity * p, transform: `translateX(${(1 - p) * -30}px)` };
  if (label.kind === "heading") {
    return (
      <div style={{ position: "absolute", left: L.left, top: L.top, ...move }}>
        <div style={{ display: "inline-block", padding: "10px 30px 14px", background: color.accent, fontFamily: font.body, fontWeight: 900, fontSize: L.nameSize, color: "#FFFFFF", lineHeight: 1.2 }}>{label.title}</div>
        {label.sub ? (
          <div style={{ marginTop: 10, display: "inline-block", padding: "6px 22px", background: "rgba(0,0,0,0.72)", fontFamily: font.body, fontWeight: 700, fontSize: L.subSize, color: "#FFFFFF" }}>{label.sub}</div>
        ) : null}
      </div>
    );
  }
  const e = label.entry;
  const s = N().status[e.status];
  return (
    <div style={{ position: "absolute", left: L.left, top: L.top, ...move }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 20px", background: color.accent, fontFamily: font.body, fontWeight: 900, fontSize: L.subSize, color: "#FFFFFF" }}>{e.date}</div>
        <div style={{ padding: "8px 28px 12px", background: "rgba(0,0,0,0.78)", fontFamily: font.body, fontWeight: 900, fontSize: L.nameSize, color: "#FFFFFF", lineHeight: 1.2 }}>{e.name}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, padding: "6px 20px", background: "rgba(0,0,0,0.72)", width: "fit-content" }}>
        <span style={{ fontFamily: font.body, fontWeight: 700, fontSize: L.subSize, color: "#FFFFFF" }}>{e.charge}</span>
        <span style={{ fontFamily: font.body, fontWeight: 700, fontSize: L.subSize, color: color.inkSoft }}>→</span>
        <span style={{ fontFamily: font.body, fontWeight: 900, fontSize: L.subSize, color: s.color === "#3E4756" ? "#C9D1DB" : s.color }}>{e.result}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- subtitles

/** Width of a row in full-width characters (Latin letters and digits count as about half). */
const rowWidth = (text: string) => [...text].reduce((w, ch) => w + (/[A-Za-z0-9.!?]/.test(ch) ? 0.56 : 1), 0);

/** Places a row may end: after 「、」, or after a particle when a new word starts. */
const CUT_AFTER = /[はがをにでとのもへや]/u;
const WORD_START = /[\p{Script=Han}\p{Script=Katakana}「『（0-9A-Za-z]/u;

/** Splits text into rows that fit at the fixed size, cutting at 「、」 first, then after a particle. */
function splitRows(text: string): string[] {
  if (text.includes("\n")) return text.split("\n");
  const max = SUB.maxRowChars;
  if (rowWidth(text) <= max) return [text];
  const chars = [...text];
  // the cut nearest the middle whose first part fits; 「、」 is preferred over a particle
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < chars.length - 1; i++) {
    const comma = chars[i - 1] === "、";
    const particle = CUT_AFTER.test(chars[i - 1]) && WORD_START.test(chars[i]);
    if (!comma && !particle) continue;
    const head = chars.slice(0, i).join("");
    if (rowWidth(head) > max) continue;
    const score = Math.abs(rowWidth(head) - rowWidth(text) / 2) + (comma ? 0 : 3);
    if (score < bestScore) [best, bestScore] = [i, score];
  }
  if (best < 0) return [text];
  return [chars.slice(0, best).join(""), ...splitRows(chars.slice(best).join(""))];
}

/** Rough reading length (morae), to share a line's time between its pages. */
const weight = (text: string) => [...text].reduce((w, ch) => w + (/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/u.test(ch) ? 0 : /\p{Script=Han}/u.test(ch) ? 1.8 : /[0-9]/u.test(ch) ? 1.6 : /[、。]/u.test(ch) ? 1.2 : 1), 0);

/**
 * Subtitle pages of at most two rows at one fixed size: a line is split into
 * sentences, each sentence into rows, and the rows are shown two at a time,
 * timed by reading length.
 */
const subtitlePages = captionCues.flatMap((cue) => {
  const sentences = cue.caption.split(/(?<=[。？])/u).map((p) => p.trim().replace(/。$/u, "")).filter(Boolean);
  const pages: string[][] = [];
  for (const s of sentences) {
    const rows = splitRows(s);
    for (let i = 0; i < rows.length; i += 2) pages.push(rows.slice(i, i + 2));
  }
  // short sentences that fit together on two rows share a page
  const merged = pages.reduce<string[][]>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.length === 1 && p.length === 1) last.push(p[0]);
    else acc.push([...p]);
    return acc;
  }, []);
  const total = merged.reduce((a, p) => a + weight(p.join("")), 0);
  let at = cue.start;
  return merged.map((rows, i) => {
    const start = at;
    at += ((cue.end - cue.start) * weight(rows.join(""))) / total;
    return { start, until: i === merged.length - 1 ? cue.until : at, rows };
  });
});

const Subtitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cue = subtitlePages.find((c) => t >= c.start && t < c.until);
  if (!cue) return null;
  const B = N().subtitle;
  // 「、」「。」 are not shown (the user's rule): a comma becomes a space, a period is dropped
  const rows = cue.rows.map((r) => r.replace(/、$/u, "").replace(/、/gu, "　").replace(/。/gu, ""));
  // one fixed size for every subtitle
  const size = SUB.fontSize;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: B.bottom, height: B.height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
      {rows.map((r) => (
        <div
          key={r}
          style={{
            fontFamily: font.body,
            fontWeight: SUB.fontWeight,
            fontSize: size,
            lineHeight: SUB.lineHeight,
            letterSpacing: SUB.letterSpacing,
            color: SUB.color,
            textShadow: `${outline(5)}, 0 6px 16px rgba(0,0,0,0.6)`,
            whiteSpace: "nowrap",
            fontFeatureSettings: '"palt"',
          }}
        >
          {r}
        </div>
      ))}
    </div>
  );
};

const VoiceCredit: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame / fps, [endingFrom, endingFrom + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 40, bottom: 20, opacity: p, fontFamily: font.body, fontWeight: 700, fontSize: 22, color: "#FFFFFF", textShadow: outline(2, "rgba(0,0,0,0.8)") }}>
      {PATTERN.design.ending.voiceCredit.replace("{speakerName}", SPEAKER_NAME)}
    </div>
  );
};

// ---------------------------------------------------------------- the video

export const NewsVideo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  const { fps } = useVideoConfig();
  const used: Record<string, number> = {};
  const frames = (s: { from: number; to: number }) => [Math.round(s.from * fps), Math.round(s.to * fps)] as const;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {timeline.media.map((s) => {
        const [start, end] = frames(s);
        const from = used[s.value] ?? 0;
        used[s.value] = from + (end - start);
        const duration = end - start + FADE;
        return (
          <Sequence key={`m${s.from}`} from={start} durationInFrames={duration} name={`media ${s.value}`}>
            <Picture mediaKey={s.value} from={from} startFrame={start} durationInFrames={duration} />
          </Sequence>
        );
      })}
      {timeline.labels.map((s) => {
        if (!s.value) return null;
        const [start, end] = frames(s);
        const duration = end - start + FADE;
        return (
          <Sequence key={`l${s.from}`} from={start} durationInFrames={duration} name="label" layout="none">
            <LabelView label={s.value} startFrame={start} durationInFrames={duration} />
          </Sequence>
        );
      })}
      <Subtitle />
      <VoiceCredit />
      {withAudio ? <Audio src={staticFile(AUDIO_SRC)} /> : null}
    </AbsoluteFill>
  );
};
