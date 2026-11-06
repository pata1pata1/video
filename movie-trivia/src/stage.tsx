import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Subtitle, usePop } from "./components";
import { PATTERN, type Stage } from "./pattern";
import { AUDIO_SRC, backgroundSegments, mediaFor, type MediaSource, type PanelDef, SCRIPT, segments, videoFrameFile } from "./timeline";
import { color, font } from "./theme";

/**
 * The panel look of pattern-01 (design.stage): real footage blurred and
 * darkened behind everything, one panel at a time (photo / headline /
 * findings / data / list) above a heading band, and short one-row subtitles.
 * Only used when the pattern has design.stage; other patterns never reach it.
 */
const S = () => PATTERN.design.stage as Stage;
const FADE = PATTERN.config.transition.fadeFrames;

/** Fades in over FADE frames (unless it starts the video) and out over the last FADE frames. */
const useCrossfade = (startFrame: number, durationInFrames: number, fade: number) => {
  const frame = useCurrentFrame();
  const fadeIn = startFrame === 0 ? 1 : interpolate(frame, [0, fade], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - fade, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return Math.min(fadeIn, fadeOut);
};

const mediaOf = (key: string): MediaSource => {
  const m = mediaFor(key);
  if (!m) throw new Error(`no media "${key}" in assets/asset-sources.json`);
  return m;
};

/** The file to show for a media key at a frame (a video plays from its JPEG sequence). */
const mediaFile = (key: string, frame: number): string => {
  const m = mediaOf(key);
  if (m.mediaType !== "video") return m.file;
  const still = videoFrameFile(key, frame);
  if (!still) throw new Error(`${key}: video frames missing — run node scripts/mt.mjs prepare-media --project=${SCRIPT.id}`);
  return still;
};

/** Stock and AI images are "image only"; anything else names its source. */
const isIllustrative = (m: MediaSource) => m.usageType === "illustrative" || m.provider === "pexels" || m.provider === "ai-generated";
const byline = (m: MediaSource) => `${m.sourceName}${m.creator ? ` / ${m.creator.trim()}` : ""}`;

/** Credit rows shown on a photo: the ledger's own text, or the pattern's wording. */
const photoCredit = (m: MediaSource): string[] => {
  const P = S().photo;
  if (m.onScreenCredit) return m.onScreenCredit.split("\n");
  if (m.provider === "ai-generated") return [P.illustrative, P.generated];
  if (isIllustrative(m)) return [P.illustrative, byline(m)];
  return [`${P.source}${byline(m)}`];
};

// ---------------------------------------------------------------- background

const BackgroundView: React.FC<{ mediaKey: string; from: number; startFrame: number; durationInFrames: number }> = ({ mediaKey, from, startFrame, durationInFrames }) => {
  const frame = useCurrentFrame();
  const B = S().background;
  const opacity = useCrossfade(startFrame, durationInFrames, B.fadeFrames);
  const m = mediaOf(mediaKey);
  const N = S().note;
  // a composed clip (sharp footage on its own blurred copy) is the screen itself
  const look: React.CSSProperties = m.composed
    ? {}
    : {
        // scaled up so the blurred edges stay off screen
        filter: `blur(${B.blur}px) saturate(${B.saturate})`,
        transform: `scale(${1.08 + frame * B.zoomPerFrame})`,
      };
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={staticFile(mediaFile(mediaKey, from + frame))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...look }} />
      {m.composed ? null : <AbsoluteFill style={{ background: `rgba(0,0,0,${B.dim})` }} />}
      {/* a photo behind a panel is credited on the panel itself */}
      <div
        style={{
          display: m.mediaType === "video" ? undefined : "none",
          position: "absolute",
          right: N.right,
          top: N.top,
          fontFamily: font.body,
          fontWeight: 700,
          fontSize: N.size,
          color: "rgba(255,255,255,0.78)",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }}
      >
        {m.onScreenCredit ?? (isIllustrative(m) ? N.illustrative : `${N.label}${byline(m)}`)}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- panels

/** The panel area: between the side margins, from the top margin down to the band. */
const Area: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const P = S().panel;
  return <div style={{ position: "absolute", left: P.left, right: P.right, top: P.top, height: P.bottom - P.top, ...style }}>{children}</div>;
};

/** A dark translucent box with a thin cyan edge. */
const Box: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => {
  const P = S().panel;
  return <div style={{ position: "relative", boxSizing: "border-box", background: P.fill, border: `${P.edgeWidth}px solid ${P.edge}`, ...style }}>{children}</div>;
};

/** Credit rows bottom-right of a picture. */
const Credit: React.FC<{ rows: string[] }> = ({ rows }) => (
  <div
    style={{
      position: "absolute",
      right: 10,
      bottom: 10,
      padding: "6px 14px",
      background: "rgba(0,0,0,0.62)",
      fontFamily: font.body,
      fontWeight: 700,
      fontSize: S().photo.creditSize,
      lineHeight: 1.3,
      color: "#FFFFFF",
      textAlign: "right",
    }}
  >
    {rows.map((r) => (
      <div key={r}>{r}</div>
    ))}
  </div>
);

/** A picture filling `style`'s box (cover), with its credit. */
const Picture: React.FC<{ mediaKey: string; from: number; fit?: "cover" | "contain"; style?: React.CSSProperties }> = ({ mediaKey, from, fit = "cover", style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "#000", ...style }}>
      <Img src={staticFile(mediaFile(mediaKey, from + frame))} style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} />
      <Credit rows={photoCredit(mediaOf(mediaKey))} />
    </div>
  );
};

/** The photo shown whole, as large as the area allows, sitting on the band. */
const PhotoPanel: React.FC<{ mediaKey: string; from: number }> = ({ mediaKey, from }) => {
  const frame = useCurrentFrame();
  const p = usePop(0, 24);
  const P = S().panel;
  return (
    <Area style={{ display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "relative", opacity: p, transform: `scale(${0.97 + 0.03 * p})`, transformOrigin: "center bottom" }}>
        <Img
          src={staticFile(mediaFile(mediaKey, from + frame))}
          style={{ display: "block", maxHeight: P.bottom - P.top, maxWidth: S().photo.maxWidth, boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
        />
        <Credit rows={photoCredit(mediaOf(mediaKey))} />
      </div>
    </Area>
  );
};

/** Longest row in characters (for shrinking a heading that would not fit). */
const longestRow = (text: string) => Math.max(...text.split("\n").map((r) => [...r].length));

const Headline: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => {
  const H = S().headline;
  const p = usePop(0, 22);
  const q = usePop(S().staggerFrames, 22);
  // padding is "top right bottom left" in px; the text width is what the box leaves
  const side = Number(H.padding.split(" ")[1].replace("px", ""));
  const room = H.maxWidth - side * 2 - S().panel.edgeWidth * 2;
  const titleSize = Math.min(H.titleSize, Math.floor(room / (longestRow(title) * 1.02)));
  const subSize = sub ? Math.min(H.subSize, Math.floor(room / (longestRow(sub) * 1.02))) : 0;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: H.centerY, display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
      <Box style={{ maxWidth: H.maxWidth, padding: H.padding, textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: titleSize,
            lineHeight: 1.24,
            letterSpacing: "0.02em",
            color: color.accent,
            textShadow: S().glow,
            whiteSpace: "pre",
          }}
        >
          {title}
        </div>
        {sub ? (
          <div style={{ fontFamily: font.body, fontWeight: 500, fontSize: subSize, lineHeight: 1.42, color: "#E8EEF3", marginTop: H.gap, whiteSpace: "pre", opacity: q }}>{sub}</div>
        ) : null}
      </Box>
    </div>
  );
};

/** Small magnifier or crosshair before a panel's Latin tag. */
const TagIcon: React.FC<{ kind: "find" | "target"; size: number }> = ({ kind, size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color.accent} strokeWidth={2.4} style={{ flex: "none" }}>
    {kind === "find" ? (
      <>
        <circle cx="10" cy="10" r="6.5" />
        <line x1="15" y1="15" x2="21" y2="21" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2.4" fill={color.accent} stroke="none" />
        <line x1="12" y1="1" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="1" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="23" y2="12" />
      </>
    )}
  </svg>
);

const Tag: React.FC<{ text: string; size: number; icon: "find" | "target" }> = ({ text, size, icon }) => (
  <>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <TagIcon kind={icon} size={size * 0.8} />
      <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: size, letterSpacing: "0.12em", color: color.accent, textShadow: "0 0 10px rgba(90,210,255,0.45)" }}>{text}</div>
    </div>
    <div style={{ height: 1, background: "rgba(255,255,255,0.14)", margin: "26px 0 34px" }} />
  </>
);

const Findings: React.FC<{ def: NonNullable<PanelDef["findings"]> }> = ({ def }) => {
  const F = S().findings;
  const box = usePop(0, 24);
  return (
    <Area>
      <Box style={{ height: "100%", padding: "52px 66px", opacity: box }}>
        <Tag text={def.tag ?? F.tag} size={F.tagSize} icon="find" />
        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          {def.items.map((it, i) => (
            <FindingRow key={it.head} index={i} head={it.head} body={it.body} badge={it.badge ?? F.badge} />
          ))}
        </div>
      </Box>
    </Area>
  );
};

const FindingRow: React.FC<{ index: number; head: string; body?: string; badge: string }> = ({ index, head, body, badge }) => {
  const F = S().findings;
  const p = usePop(6 + index * S().staggerFrames, 22);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 30, opacity: p, transform: `translateX(${(1 - p) * 30}px)` }}>
      <div style={{ flex: "none", width: 14, height: 14, marginTop: F.headSize * 0.12, background: color.accent, transform: "rotate(45deg)", boxShadow: "0 0 8px rgba(90,210,255,0.7)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: F.headSize, lineHeight: 1.25, color: color.ink }}>{head}</div>
        {body ? <div style={{ fontFamily: font.body, fontWeight: 500, fontSize: F.bodySize, lineHeight: 1.4, color: color.inkSoft, marginTop: 8 }}>{body}</div> : null}
      </div>
      {badge ? (
        <div
          style={{
            flex: "none",
            marginTop: F.headSize * 0.1,
            padding: "6px 18px",
            border: `2px solid ${color.accent}`,
            fontFamily: font.body,
            fontWeight: 900,
            fontSize: F.badgeSize,
            color: color.accent,
            background: "rgba(90,210,255,0.08)",
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
};

const DataPanel: React.FC<{ def: NonNullable<PanelDef["data"]>; from: number }> = ({ def, from }) => {
  const DD = S().data;
  const box = usePop(0, 24);
  // shrink the rows so they always fit above the band (top padding + tag + rows + bottom padding)
  const P = S().panel;
  const room = P.bottom - P.top - 52 * 2 - (DD.tagSize * 1.4 + 61);
  const rowHeight = DD.labelSize * 1.5 + 4 + DD.valueSize * 1.25;
  const k = Math.min(1, (room - 26 * (def.items.length - 1)) / (rowHeight * def.items.length));
  const rows = (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 * k }}>
      {def.items.map((it, i) => (
        <DataRow key={it.label} index={i} label={it.label} value={it.value} scale={k} />
      ))}
    </div>
  );
  return (
    <Area>
      <Box style={{ height: "100%", padding: "52px 66px", opacity: box, display: "flex", flexDirection: "column" }}>
        <Tag text={def.tag ?? DD.tag} size={DD.tagSize} icon="target" />
        {def.photo ? (
          <div style={{ flex: 1, display: "flex", gap: 56, minHeight: 0 }}>
            <div style={{ position: "relative", width: "42%", height: "100%" }}>
              <Picture mediaKey={def.photo} from={from} style={{ width: "100%", height: "100%" }} />
              {def.caption ? (
                <div style={{ position: "absolute", left: 0, top: 0, padding: "6px 14px", background: "rgba(0,0,0,0.7)", fontFamily: font.body, fontWeight: 700, fontSize: 24, color: "#FFFFFF" }}>
                  {def.caption}
                </div>
              ) : null}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center" }}>{rows}</div>
          </div>
        ) : (
          rows
        )}
      </Box>
    </Area>
  );
};

const DataRow: React.FC<{ index: number; label: string; value: string; scale: number }> = ({ index, label, value, scale }) => {
  const DD = S().data;
  const p = usePop(6 + index * S().staggerFrames, 22);
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: DD.labelSize * scale, lineHeight: 1.5, color: color.inkSoft }}>{label}</div>
      <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: DD.valueSize * scale, lineHeight: 1.25, color: color.ink, marginTop: 4 }}>{value}</div>
    </div>
  );
};

const ListPanel: React.FC<{ def: NonNullable<PanelDef["list"]>; from: number }> = ({ def, from }) => {
  const L = S().list;
  const box = usePop(0, 24);
  const items = (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 34 }}>
      {/* the thin line joining the numbers */}
      <div style={{ position: "absolute", left: L.circle / 2 - 1, top: L.circle / 2, bottom: L.circle, width: 2, background: "rgba(90,210,255,0.5)" }} />
      {def.items.map((it, i) => (
        <ListRow key={it.head} index={i} head={it.head} body={it.body} />
      ))}
    </div>
  );
  return (
    <Area style={{ display: "flex", gap: 16, opacity: box }}>
      {def.photo ? (
        <Box style={{ width: "50%", height: "100%", padding: "70px 0 0" }}>
          <Picture mediaKey={def.photo} from={from} style={{ width: "100%", height: 560 }} />
        </Box>
      ) : null}
      <Box style={{ flex: 1, height: "100%", padding: "84px 60px", display: "flex", alignItems: "flex-start" }}>{items}</Box>
    </Area>
  );
};

const ListRow: React.FC<{ index: number; head: string; body?: string }> = ({ index, head, body }) => {
  const L = S().list;
  const p = usePop(6 + index * S().staggerFrames, 22);
  return (
    <div style={{ position: "relative", display: "flex", gap: 28, opacity: p, transform: `translateX(${(1 - p) * 24}px)` }}>
      <div
        style={{
          flex: "none",
          width: L.circle,
          height: L.circle,
          borderRadius: "50%",
          border: `3px solid ${color.accent}`,
          boxSizing: "border-box",
          background: "#0B1620",
          color: color.accent,
          fontFamily: font.body,
          fontWeight: 900,
          fontSize: L.circle * 0.52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {index + 1}
      </div>
      <div>
        <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: L.headSize, lineHeight: 1.2, color: color.ink }}>{head}</div>
        {body ? <div style={{ fontFamily: font.body, fontWeight: 500, fontSize: L.bodySize, lineHeight: 1.4, color: color.inkSoft, marginTop: 6 }}>{body}</div> : null}
      </div>
    </div>
  );
};

/** The band under the panel: a cyan line on top and the current topic in glowing cyan. */
const Band: React.FC<{ label: string; startFrame: number; durationInFrames: number }> = ({ label, startFrame, durationInFrames }) => {
  const B = S().band;
  const P = S().panel;
  const opacity = useCrossfade(startFrame, durationInFrames, FADE);
  return (
    <div
      style={{
        position: "absolute",
        left: P.left,
        right: P.right,
        top: B.top,
        height: B.height,
        boxSizing: "border-box",
        background: B.fill,
        borderTop: `${B.lineWidth}px solid ${B.line}`,
        boxShadow: `0 -2px 12px rgba(90,210,255,0.25)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.body,
        fontWeight: 900,
        fontSize: B.size,
        letterSpacing: "0.03em",
        color: color.accent,
        textShadow: S().glow,
        whiteSpace: "nowrap",
        opacity,
      }}
    >
      {label}
    </div>
  );
};

/** The media key a panel plays (so a video in a panel continues where it was left). */
const panelMedia = (p: PanelDef) => p.photo ?? p.data?.photo ?? p.list?.photo;

const PanelView: React.FC<{ panel: PanelDef; from: number; startFrame: number; durationInFrames: number }> = ({ panel, from, startFrame, durationInFrames }) => {
  const opacity = useCrossfade(startFrame, durationInFrames, FADE);
  let body: React.ReactNode = null;
  if (panel.photo) body = <PhotoPanel mediaKey={panel.photo} from={from} />;
  else if (panel.headline) body = <Headline title={panel.headline.title} sub={panel.headline.sub} />;
  else if (panel.findings) body = <Findings def={panel.findings} />;
  else if (panel.data) body = <DataPanel def={panel.data} from={from} />;
  else if (panel.list) body = <ListPanel def={panel.list} from={from} />;
  return <AbsoluteFill style={{ opacity }}>{body}</AbsoluteFill>;
};

/** The whole pattern-01 video: background track, panels, band, subtitles, narration. */
export const StageVideo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  const { fps } = useVideoConfig();
  const B = S().background;
  // frames already shown of each clip, counted apart for the background and the panels
  const used: Record<string, number> = {};
  const usedInPanels: Record<string, number> = {};
  const frames =(from: number, to: number) => [Math.round(from * fps), Math.round(to * fps)] as const;
  // consecutive panels with the same label share one band (so it does not blink)
  const bands: { label: string; from: number; to: number }[] = [];
  for (const seg of segments) {
    const label = seg.shown.kind === "panel" ? seg.shown.panel.label : undefined;
    const last = bands[bands.length - 1];
    if (last && last.label === label && last.to === seg.from) last.to = seg.to;
    else if (label) bands.push({ label, from: seg.from, to: seg.to });
  }
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      {backgroundSegments.map((b) => {
        const [start, end] = frames(b.from, b.to);
        const from = used[b.key] ?? 0;
        used[b.key] = from + (end - start);
        // runs on under the next one while that fades in (the last one past the end, so it never fades out)
        const duration = end - start + B.fadeFrames;
        return (
          <Sequence key={`bg${b.from}`} from={start} durationInFrames={duration} name={`bg ${b.key}`}>
            <BackgroundView mediaKey={b.key} from={from} startFrame={start} durationInFrames={duration} />
          </Sequence>
        );
      })}
      {segments.map((seg) => {
        if (seg.shown.kind !== "panel") return null;
        const [start, end] = frames(seg.from, seg.to);
        const key = panelMedia(seg.shown.panel);
        const from = key ? (usedInPanels[key] ?? 0) : 0;
        if (key) usedInPanels[key] = from + (end - start);
        const duration = end - start + FADE;
        return (
          <Sequence key={`p${seg.from}`} from={start} durationInFrames={duration} name="panel">
            <PanelView panel={seg.shown.panel} from={from} startFrame={start} durationInFrames={duration} />
          </Sequence>
        );
      })}
      {bands.map((b) => {
        const [start, end] = frames(b.from, b.to);
        const duration = end - start + FADE;
        return (
          <Sequence key={`b${b.from}`} from={start} durationInFrames={duration} name="band">
            <Band label={b.label} startFrame={start} durationInFrames={duration} />
          </Sequence>
        );
      })}
      <Subtitle />
      {withAudio ? <Audio src={staticFile(AUDIO_SRC)} /> : null}
    </AbsoluteFill>
  );
};
