import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { StatValue, usePop, useRamp } from "./components";
import { PATTERN } from "./pattern";
import { CHAPTERS, mediaFor, Points as PointsDef, SCRIPT, SceneDef, SPEAKER_NAME, Stat, videoFrameFile } from "./timeline";
import { color, font, SUBTITLE_AREA } from "./theme";

/** Card sizes, dimming and the ending (patterns/<pattern>/design.json). */
const D = PATTERN.design;

const Paper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: color.bg }}>{children}</AbsoluteFill>
);

/** Footage to show behind a card: the clip and the frame it continues from. */
export type Bg = { key: string; from: number } | undefined;

/** Paper, or the footage darkened so white type reads on it. */
const Backdrop: React.FC<{ bg: Bg; dim: number; children: React.ReactNode }> = ({ bg, dim, children }) =>
  bg ? (
    <AbsoluteFill>
      <Footage mediaKey={bg.key} startFrame={bg.from} dim={dim} />
      {children}
    </AbsoluteFill>
  ) : (
    <Paper>{children}</Paper>
  );

/** Text colors for paper or for darkened footage. */
const tone = (onDark: boolean) =>
  onDark
    ? { ink: "#FFFFFF", soft: "rgba(255,255,255,0.82)", line: "rgba(255,255,255,0.35)", shadow: "0 2px 16px rgba(0,0,0,0.6)" }
    : { ink: color.ink, soft: color.inkSoft, line: color.line, shadow: undefined };

/** Content area above the subtitles. */
const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: SUBTITLE_AREA, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...style }}>
    {children}
  </div>
);

export const Title: React.FC<{ bg?: Bg }> = ({ bg }) => {
  const frame = useCurrentFrame();
  const t = tone(!!bg);
  const disc = usePop(0, 30);
  const top = usePop(6);
  const main = usePop(12);
  const bar = useRamp(20, 18);
  const sub = usePop(26);
  return (
    <Backdrop bg={bg} dim={D.dim.title}>
      {/* a plain orange disc, half off the right edge (on paper only) */}
      <div
        style={{
          position: "absolute",
          right: -260,
          top: 120,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 40%, ${D.title.accentDiscHighlight}, ${color.accent} 70%)`,
          opacity: bg ? 0 : 0.95 * disc,
          transform: `scale(${0.9 + 0.1 * disc + frame * 0.0003})`,
        }}
      />
      <div style={{ position: "absolute", left: 140, top: 300, width: 1100 }}>
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 50, color: t.soft, textShadow: t.shadow, opacity: top, transform: `translateY(${(1 - top) * 20}px)` }}>
          {SCRIPT.titleTop}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: 104,
            whiteSpace: "nowrap",
            lineHeight: 1.18,
            color: t.ink,
            textShadow: t.shadow,
            marginTop: 14,
            opacity: main,
            transform: `translateY(${(1 - main) * 24}px)`,
            letterSpacing: "0.02em",
          }}
        >
          {SCRIPT.titleMain}
        </div>
        <div style={{ width: 300 * bar, height: 8, borderRadius: 4, background: color.accent, margin: "30px 0 28px" }} />
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 44, color: t.ink, textShadow: t.shadow, opacity: sub }}>{SCRIPT.titleSub}</div>
      </div>
    </Backdrop>
  );
};

export const ChapterCard: React.FC<{ scene: SceneDef; bg?: Bg }> = ({ scene, bg }) => {
  const t = tone(!!bg);
  const label = usePop(0);
  const head = usePop(6);
  const bar = useRamp(12, 16);
  return (
    <Backdrop bg={bg} dim={D.dim.chapter}>
      <Stage>
        <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: 44, color: color.accent, opacity: label, letterSpacing: "0.1em" }}>
          {D.chapterCard.labelFormat.replace("{n}", String(scene.number))}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: 110,
            color: t.ink,
            textShadow: t.shadow,
            marginTop: 18,
            opacity: head,
            transform: `translateY(${(1 - head) * 20}px)`,
          }}
        >
          {scene.heading}
        </div>
        <div style={{ width: 240 * bar, height: 6, borderRadius: 3, background: color.accent, marginTop: 34 }} />
        <div style={{ display: "flex", gap: 14, marginTop: 50 }}>
          {CHAPTERS.map((c) => (
            <div
              key={c.id}
              style={{
                width: c.number === scene.number ? 44 : 14,
                height: 14,
                borderRadius: 7,
                background: c.number! <= scene.number! ? color.accent : t.line,
              }}
            />
          ))}
        </div>
      </Stage>
    </Backdrop>
  );
};

/** Stock or supplied footage, full frame, with its credit top-right. `dim` darkens it under a card (not the credit). */
export const Footage: React.FC<{ mediaKey: string; startFrame: number; dim?: number }> = ({ mediaKey, startFrame, dim = 0 }) => {
  const frame = useCurrentFrame();
  const media = mediaFor(mediaKey);
  if (!media) throw new Error(`no media "${mediaKey}" in sources.json`);
  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  let img: React.ReactNode;
  if (media.mediaType === "video") {
    // keep counting from where this footage was left, so a clip used again does not restart
    const still = videoFrameFile(mediaKey, startFrame + frame);
    if (!still) throw new Error(`${mediaKey}: video frames missing — run node scripts/prepare-media.mjs --script=${SCRIPT.id}`);
    img = <Img src={staticFile(still)} style={fill} />;
  } else {
    img = <Img src={staticFile(media.file)} style={{ ...fill, transform: `scale(${1 + frame * 0.0004})` }} />;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {img}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.35) 100%)" }} />
      {dim > 0 ? <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} /> : null}
      <div
        style={{
          position: "absolute",
          right: 72,
          top: 62,
          fontFamily: font.body,
          fontWeight: 500,
          fontSize: 22,
          color: "rgba(255,255,255,0.85)",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }}
      >
        {D.footageCredit.label}{media.sourceName}
        {media.creator ? ` / ${media.creator.trim()}` : ""}
      </div>
    </AbsoluteFill>
  );
};

export const StatCard: React.FC<{ stat: Stat; bg?: Bg }> = ({ stat, bg }) => {
  const t = tone(!!bg);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop(2, 16);
  const count = interpolate(frame, [4, 4 + fps * D.statCard.countUpSeconds], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label = usePop(14);
  return (
    <Backdrop bg={bg} dim={D.dim.stat}>
      <Stage>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, textShadow: t.shadow, opacity: pop, transform: `scale(${0.92 + 0.08 * pop})` }}>
          <span style={{ fontFamily: font.body, fontWeight: 900, fontSize: 260, lineHeight: 1, color: bg ? color.accentOnDark : color.accent, fontVariantNumeric: "tabular-nums" }}>
            <StatValue value={stat.value} progress={count} />
          </span>
          <span style={{ fontFamily: font.body, fontWeight: 900, fontSize: 96, color: t.ink }}>{stat.unit}</span>
        </div>
        <div style={{ width: 120, height: 6, borderRadius: 3, background: t.line, margin: "36px 0 30px" }} />
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 46, color: t.ink, textShadow: t.shadow, opacity: label }}>{stat.label}</div>
      </Stage>
    </Backdrop>
  );
};

export const Points: React.FC<{ points: PointsDef }> = ({ points }) => {
  const head = usePop(0);
  return (
    <Paper>
      <Stage>
        <div style={{ width: 1240 }}>
          <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: 60, color: color.ink, opacity: head, marginBottom: 40 }}>
            {points.title}
          </div>
          {points.items.map((text, i) => (
            <PointRow key={text} index={i} text={text} />
          ))}
        </div>
      </Stage>
    </Paper>
  );
};

const PointRow: React.FC<{ index: number; text: string }> = ({ index, text }) => {
  const p = usePop(10 + index * 12);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 30,
        background: color.card,
        border: `2px solid ${color.line}`,
        borderRadius: 16,
        padding: "26px 36px",
        marginBottom: 22,
        opacity: p,
        transform: `translateX(${(1 - p) * 40}px)`,
      }}
    >
      <div
        style={{
          flex: "none",
          width: 60,
          height: 60,
          borderRadius: 30,
          background: color.accent,
          color: "#FFFFFF",
          fontFamily: font.body,
          fontWeight: 900,
          fontSize: 34,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {index + 1}
      </div>
      <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 48, color: color.ink }}>{text}</div>
    </div>
  );
};

/**
 * Ending: thanks, title, the pattern's buttons (each appears with the Nth
 * line of the ending scene, `atLine`) and the voice credit.
 * `lineFrames`: local frame at which each ending line starts.
 */
export const Ending: React.FC<{ lineFrames: number[] }> = ({ lineFrames }) => {
  const title = usePop(0);
  const bar = useRamp(8, 18);
  const buttons = D.ending.buttons.map((b, i, all) => {
    const line = Math.min(b.atLine, lineFrames.length) - 1;
    // buttons on the same line come in one after another
    const before = all.slice(0, i).filter((o) => Math.min(o.atLine, lineFrames.length) - 1 === line).length;
    return { ...b, start: lineFrames[line] + before * 6, accent: "accent" in b && !!b.accent };
  });
  return (
    <Paper>
      <Stage>
        <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: 96, color: color.ink, opacity: title, transform: `translateY(${(1 - title) * 20}px)` }}>
          {SCRIPT.endingTitle ?? D.ending.title}
        </div>
        <div style={{ width: 240 * bar, height: 6, borderRadius: 3, background: color.accent, margin: "30px 0" }} />
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 36, color: color.inkSoft, opacity: title }}>{SCRIPT.title}</div>
        <div style={{ display: "flex", gap: 32, marginTop: 64 }}>
          {buttons.map((b) => (
            <EndButton key={b.label} {...b} />
          ))}
        </div>
      </Stage>
      <div style={{ position: "absolute", right: 72, bottom: SUBTITLE_AREA + 10, fontFamily: font.body, fontWeight: 500, fontSize: 24, color: color.inkSoft }}>
        {D.ending.voiceCredit.replace("{speakerName}", SPEAKER_NAME)}
      </div>
    </Paper>
  );
};

const EndButton: React.FC<{ icon: string; label: string; accent: boolean; start: number }> = ({ icon, label, accent, start }) => {
  const p = usePop(start, 16);
  return (
    <div
      style={{
        padding: "22px 46px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        borderRadius: 999,
        fontFamily: font.body,
        fontWeight: 900,
        fontSize: 42,
        color: accent ? "#FFFFFF" : color.ink,
        background: accent ? color.accent : color.card,
        border: accent ? "none" : `2px solid ${color.line}`,
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <span style={{ fontFamily: font.emoji }}>{icon}</span>
      {label}
    </div>
  );
};
