import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { StatValue, usePop, useRamp } from "./components";
import { PATTERN } from "./pattern";
import { CHAPTERS, mediaFor, Points as PointsDef, SCRIPT, SceneDef, SPEAKER_NAME, Stat, videoFrameFile } from "./timeline";
import { Box, Brackets, Rings, ScanLine, TitleRings } from "./hud";
import { FilmOverlay } from "./film";
import { color, font, neon, onAccent, paper, rankColor, SUBTITLE_AREA } from "./theme";

/** Card sizes, dimming and the ending (patterns/<pattern>/design.json). */
const D = PATTERN.design;

/** The pattern's paper, with corner brackets for a HUD pattern. */
const Paper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={paper}>
    {D.hud ? <Brackets /> : null}
    {D.film ? <FilmOverlay /> : null}
    {children}
  </AbsoluteFill>
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
          opacity: bg || !D.title.accentDiscWhenNoFootage ? 0 : 0.95 * disc,
          transform: `scale(${0.9 + 0.1 * disc + frame * 0.0003})`,
        }}
      />
      {D.title.hud ? <TitleRings count={CHAPTERS.length} /> : null}
      <div style={{ position: "absolute", left: 140, top: 300, width: 1100 }}>
        {D.title.tag ? (
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 30, letterSpacing: "0.4em", color: color.accent, textShadow: neon(color.accent, 0.6), opacity: top, marginBottom: 18 }}>
            {D.title.tag}
          </div>
        ) : null}
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
            color: D.title.mainColor ?? t.ink,
            textShadow: D.title.mainColor ? neon(D.title.mainColor, 0.7) : t.shadow,
            marginTop: 14,
            opacity: main,
            transform: `translateY(${(1 - main) * 24}px)`,
            letterSpacing: "0.02em",
          }}
        >
          {SCRIPT.titleMain}
        </div>
        <div style={{ width: 300 * bar, height: 8, borderRadius: 4, background: color.accent, boxShadow: neon(color.accent, 0.6), margin: "30px 0 28px" }} />
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 44, color: t.ink, textShadow: t.shadow, opacity: sub }}>{SCRIPT.titleSub}</div>
      </div>
      {D.title.hud ? <ScanLine start={2} /> : null}
    </Backdrop>
  );
};

/** A chapter's first line: the numbered label card, or the rank card for a ranking pattern. */
export const ChapterCard: React.FC<{ scene: SceneDef; bg?: Bg }> = (props) => (D.chapterCard.style === "rank" ? <RankCard {...props} /> : <LabelCard {...props} />);

const LabelCard: React.FC<{ scene: SceneDef; bg?: Bg }> = ({ scene, bg }) => {
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
            textShadow: neon(color.accent, 0.6) ?? t.shadow,
            marginTop: 18,
            opacity: head,
            transform: `translateY(${(1 - head) * 20}px)`,
          }}
        >
          {scene.heading}
        </div>
        <div style={{ width: 240 * bar, height: 6, borderRadius: 3, background: color.accent, marginTop: 34 }} />
        <div style={{ display: "flex", gap: 14, marginTop: 50 }}>
          {CHAPTERS.map((c, i) => (
            <div
              key={c.id}
              style={{
                width: c === scene ? 44 : 14,
                height: 14,
                borderRadius: 7,
                background: i <= CHAPTERS.indexOf(scene) ? color.accent : t.line,
              }}
            />
          ))}
        </div>
      </Stage>
    </Backdrop>
  );
};

/** A rank's card: the rank inside rotating rings, the heading, and the countdown so far. */
const RankCard: React.FC<{ scene: SceneDef; bg?: Bg }> = ({ scene, bg }) => {
  const t = tone(!!bg);
  const head = usePop(10);
  const row = usePop(16);
  const fill = rankColor(scene.number!);
  const here = CHAPTERS.indexOf(scene);
  const size = D.chapterCard.badgeSize ?? 300;
  return (
    <Backdrop bg={bg} dim={D.dim.chapter}>
      <Stage>
        <Rings size={size} ink={fill}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: size * 0.075, letterSpacing: "0.3em", marginLeft: "0.3em", color: t.soft }}>{D.chapterCard.badgeLabel}</div>
          <div style={{ fontFamily: font.display, fontWeight: 900, fontSize: size * 0.36, lineHeight: 1, color: "#FFFFFF", textShadow: neon(fill) }}>{scene.number}</div>
        </Rings>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: D.chapterCard.headingSize,
            color: t.ink,
            textShadow: neon(fill, 0.5) ?? t.shadow,
            marginTop: 26,
            opacity: head,
            transform: `translateY(${(1 - head) * 24}px)`,
          }}
        >
          {scene.heading}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 34, opacity: row }}>
          {CHAPTERS.map((c, i) => (
            <div
              key={c.id}
              style={{
                width: 56,
                height: 40,
                fontFamily: font.display,
                fontWeight: 700,
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "skewX(-14deg)",
                boxSizing: "border-box",
                color: i === here ? onAccent : i < here ? t.soft : t.line,
                background: i === here ? fill : i < here ? `${color.accent}22` : "transparent",
                border: `2px solid ${i === here ? fill : i < here ? `${color.accent}66` : t.line}`,
                boxShadow: i === here ? `0 0 14px ${fill}` : undefined,
              }}
            >
              <span style={{ transform: "skewX(14deg)" }}>{c.number}</span>
            </div>
          ))}
        </div>
      </Stage>
    </Backdrop>
  );
};

/**
 * The ranking board: every rank from 1 down, two columns when there are more
 * than five. Ranks not introduced yet (`opened` counts from the script's first
 * rank, the lowest) show the pattern's "hidden" text.
 */
export const Board: React.FC<{ opened: number }> = ({ opened }) => {
  const B = D.board ?? { title: "RANKING", hidden: "？？？", rowSize: 42 };
  const head = usePop(0);
  const ranks = [...CHAPTERS].sort((a, b) => a.number! - b.number!);
  const columns = ranks.length > 5 ? [ranks.slice(0, Math.ceil(ranks.length / 2)), ranks.slice(Math.ceil(ranks.length / 2))] : [ranks];
  return (
    <Paper>
      <Stage>
        <div style={{ opacity: head, marginBottom: 30, textAlign: "center", transform: `translateY(${(1 - head) * 20}px)` }}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 26, letterSpacing: "0.4em", marginLeft: "0.4em", color: color.accent, textShadow: neon(color.accent, 0.5) }}>{B.title}</div>
          <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: 58, color: color.ink, marginTop: 6 }}>{SCRIPT.titleMain}</div>
        </div>
        <div style={{ display: "flex", gap: 40 }}>
          {columns.map((col, ci) => (
            <div key={ci} style={{ width: 780, display: "flex", flexDirection: "column", gap: 14 }}>
              {col.map((c) => (
                <BoardRow key={c.id} scene={c} open={CHAPTERS.indexOf(c) < opened} hidden={B.hidden} size={B.rowSize} delay={6 + (ranks.length - c.number!) * 3} />
              ))}
            </div>
          ))}
        </div>
      </Stage>
    </Paper>
  );
};

const BoardRow: React.FC<{ scene: SceneDef; open: boolean; hidden: string; size: number; delay: number }> = ({ scene, open, hidden, size, delay }) => {
  const p = usePop(delay);
  const fill = rankColor(scene.number!);
  return (
    <Box
      edge={open ? fill : color.line}
      lit={open}
      radius={56}
      style={{ height: 104, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}
      inner={{ display: "flex", alignItems: "center", gap: 26, padding: "0 30px 0 34px" }}
    >
      <div style={{ flex: "none", width: 70, fontFamily: font.display, fontWeight: 900, fontSize: 46, color: open ? fill : color.inkFaint, textShadow: open ? neon(fill, 0.5) : undefined, textAlign: "center" }}>
        {scene.number}
      </div>
      <div style={{ width: 2, height: 52, background: open ? `${fill}88` : color.line }} />
      <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: size, color: open ? color.ink : color.inkFaint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {open ? scene.heading : hidden}
      </div>
    </Box>
  );
};

/** Stock or supplied footage, full frame, with its credit top-right. `dim` darkens it under a card (not the credit). */
export const Footage: React.FC<{ mediaKey: string; startFrame: number; dim?: number }> = ({ mediaKey, startFrame, dim = 0 }) => {
  const frame = useCurrentFrame();
  const media = mediaFor(mediaKey);
  if (!media) throw new Error(`no media "${mediaKey}" in sources.json`);
  const fill: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
  // a film pattern blurs and desaturates the picture
  const F = D.film;
  const look = F ? { filter: `blur(${F.blur}px) saturate(${F.saturate})`, transform: "scale(1.03)" } : undefined;
  let img: React.ReactNode;
  if (media.mediaType === "video") {
    // keep counting from where this footage was left, so a clip used again does not restart
    const still = videoFrameFile(mediaKey, startFrame + frame);
    if (!still) throw new Error(`${mediaKey}: video frames missing — run node scripts/prepare-media.mjs --script=${SCRIPT.id}`);
    img = <Img src={staticFile(still)} style={{ ...fill, ...look }} />;
  } else if (F) {
    // a photo (often a person or a document) is shown whole and sharp, framed on a blurred copy of itself
    img = (
      <>
        <Img src={staticFile(media.file)} style={{ ...fill, filter: `blur(28px) saturate(${F.saturate}) brightness(0.5)`, transform: "scale(1.1)" }} />
        <Img
          src={staticFile(media.file)}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            maxWidth: "78%",
            maxHeight: "80%",
            transform: `translate(-50%, -54%) scale(${1 + frame * 0.0003})`,
            filter: `saturate(${F.saturate + 0.2})`,
            border: "3px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.85)",
          }}
        />
      </>
    );
  } else {
    img = <Img src={staticFile(media.file)} style={{ ...fill, transform: `scale(${1 + frame * 0.0004})` }} />;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {img}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.35) 100%)" }} />
      {/* a HUD pattern darkens toward its navy paper, others toward black */}
      {dim > 0 ? <AbsoluteFill style={{ background: D.hud ? `${color.bg}${Math.round(dim * 255).toString(16).padStart(2, "0")}` : `rgba(0,0,0,${dim})` }} /> : null}
      <FilmOverlay />
      {/* top-left when the chapter tag takes the top-right */}
      <div
        style={{
          position: "absolute",
          ...(D.footageCredit.left !== undefined ? { left: D.footageCredit.left } : { right: 72 }),
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
          <span
            style={{
              fontFamily: font.display,
              fontWeight: 900,
              fontSize: 260,
              lineHeight: 1,
              color: bg ? color.accentOnDark : color.accent,
              textShadow: neon(color.accent) ?? t.shadow,
              fontVariantNumeric: "tabular-nums",
            }}
          >
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
    <Box
      edge={color.line}
      radius={16}
      style={{ marginBottom: 22, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}
      inner={{ display: "flex", alignItems: "center", gap: 30, padding: "26px 36px" }}
    >
      <div
        style={{
          flex: "none",
          width: 60,
          height: 60,
          borderRadius: 30,
          background: color.accent,
          boxShadow: neon(color.accent, 0.5),
          color: onAccent,
          fontFamily: font.display,
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
    </Box>
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
        <div style={{ width: 240 * bar, height: 6, borderRadius: 3, background: color.accent, boxShadow: neon(color.accent, 0.6), margin: "30px 0" }} />
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
  const move = { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
  if (D.panel) {
    return (
      <Box edge={accent ? color.accent : color.line} lit={accent} radius={0} style={move} inner={{ padding: "22px 46px", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: font.emoji, fontSize: 42 }}>{icon}</span>
        <span style={{ fontFamily: font.body, fontWeight: 900, fontSize: 42, color: accent ? color.accent : color.ink, textShadow: accent ? neon(color.accent, 0.5) : undefined }}>{label}</span>
      </Box>
    );
  }
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
        color: accent ? onAccent : color.ink,
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
