import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import { AbsoluteFill, Easing, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { FPS, PANEL, ZOOM_SECONDS, segmentsOf } from "../shots.mjs";

const { fontFamily } = loadFont("normal", { weights: ["700", "900"] });

const TAIL = 0.3; // seconds after the last word
const FADE = 8; // frames
const ACCENT_DEFAULT = "#22d3ee";
const HIGHLIGHT = "#ffd400";

type Rect = { x: number; y: number; w: number; h: number };
type Card = { text: string; start: number; end: number; shot?: unknown; textCard?: { rows: string[] }; badge?: string };
/** The video (input/script.json), its card timeline (audio/timeline.json) and the recordings' logs, passed as props per render. */
export type DemoProps = { script: Record<string, unknown>; timeline: { duration: number; cards: Card[] }; captures?: Record<string, unknown> };
type Segment = {
  start: number;
  end: number;
  shot: unknown;
  textCard: { rows: string[] } | null;
  src?: string;
  media?: { width: number; height: number };
  from?: number;
  to?: number;
  rate?: number;
  views?: { at: number; view: Rect }[];
  highlight?: { at: number; rect: Rect } | null;
  dummy?: boolean;
  recordedAt?: string;
};

export const totalFramesOf = (t: DemoProps["timeline"]) => Math.ceil((t.duration + TAIL) * FPS);
const fr = (s: number) => Math.round(s * FPS);

/** "11/22 収録" in Japan time. */
const recorded = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} 収録`;
};

const Pill: React.FC<{ text: string; bg: string; color?: string }> = ({ text, bg, color = "#fff" }) => (
  <div style={{ fontFamily, fontWeight: 900, fontSize: 30, lineHeight: 1, padding: "12px 20px", borderRadius: 999, background: bg, color, boxShadow: "0 4px 14px rgba(0,0,0,.35)", whiteSpace: "pre" }}>{text}</div>
);

/** One recorded operation in the panel: plays its own time range (fast-forward labelled), zooms to the operated element, highlights it. */
const ScreenSegment: React.FC<{ seg: Segment }> = ({ seg }) => {
  const lf = useCurrentFrame();
  const t = seg.start + lf / FPS;
  const [a, b] = seg.views!;
  const k = interpolate(t, [b.at, b.at + ZOOM_SECONDS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const mix = (p: number, q: number) => p + (q - p) * k;
  const view = { x: mix(a.view.x, b.view.x), y: mix(a.view.y, b.view.y), w: mix(a.view.w, b.view.w), h: mix(a.view.h, b.view.h) };
  const scale = Math.min(PANEL.w / view.w, PANEL.h / view.h);
  const offX = (PANEL.w - view.w * scale) / 2;
  const offY = (PANEL.h - view.h * scale) / 2;
  const rate = seg.rate ?? 1;
  const playFrames = Math.max(1, Math.round((((seg.to ?? 0) - (seg.from ?? 0)) / rate) * FPS));
  const video = <OffthreadVideo src={staticFile(seg.src!)} muted playbackRate={rate} trimBefore={Math.round((seg.from ?? 0) * FPS)} style={{ width: "100%", height: "100%" }} />;
  const h = seg.highlight;
  const hOpacity = h ? interpolate(t, [h.at, h.at + 0.25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const speed = Math.abs(rate - 1) > 0.05 ? `${rate > 1 ? "早送り" : "スロー"} ×${rate.toFixed(1)}` : null;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h, borderRadius: 28, overflow: "hidden", background: "#0d1526", boxShadow: "0 18px 50px rgba(0,0,0,.55)", border: "2px solid rgba(255,255,255,.12)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: seg.media!.width, height: seg.media!.height, transformOrigin: "0 0", transform: `translate(${offX - view.x * scale}px, ${offY - view.y * scale}px) scale(${scale})` }}>
          <Sequence durationInFrames={playFrames} layout="none">
            {video}
          </Sequence>
          <Sequence from={playFrames} layout="none">
            <Freeze frame={playFrames - 1}>{video}</Freeze>
          </Sequence>
        </div>
        {h && (
          <div
            style={{
              position: "absolute",
              left: offX + (h.rect.x - view.x) * scale,
              top: offY + (h.rect.y - view.y) * scale,
              width: h.rect.w * scale,
              height: h.rect.h * scale,
              border: `8px solid ${HIGHLIGHT}`,
              borderRadius: 18,
              boxShadow: `0 0 0 6px rgba(0,0,0,.25), 0 0 40px ${HIGHLIGHT}`,
              opacity: hOpacity,
              boxSizing: "border-box",
            }}
          />
        )}
        <div style={{ position: "absolute", left: 20, top: 20, display: "flex", gap: 12 }}>
          <Pill text={`実際の操作画面${seg.recordedAt ? `・${recorded(seg.recordedAt)}` : ""}`} bg="rgba(10,16,32,.82)" />
          {seg.dummy && <Pill text="テスト用ダミー画面" bg="#d62828" />}
        </div>
        {speed && (
          <div style={{ position: "absolute", right: 20, top: 20 }}>
            <Pill text={speed} bg={HIGHLIGHT} color="#111" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

/** Big text instead of a screen (e.g. the closing). */
const TextSegment: React.FC<{ rows: string[]; accent: string }> = ({ rows, accent }) => {
  const lf = useCurrentFrame();
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: PANEL.x, top: PANEL.y, width: PANEL.w, height: PANEL.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              fontFamily,
              fontWeight: 900,
              fontSize: 104,
              lineHeight: 1.2,
              color: i % 2 ? accent : "#fff",
              textAlign: "center",
              opacity: interpolate(lf, [i * 6, i * 6 + FADE], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(lf, [i * 6, i * 6 + FADE], [30, 0], { extrapolateRight: "clamp" })}px)`,
            }}
          >
            {r}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const DemoShort: React.FC<DemoProps> = ({ script, timeline, captures }) => {
  const accent = (script.captionColor as string) ?? ACCENT_DEFAULT;
  const title = String(script.title ?? "").split("|");
  const segs = segmentsOf(timeline, captures ?? {}) as Segment[];
  const total = totalFramesOf(timeline);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 70% at 50% 0%, #16264a 0%, #0a1020 60%)", fontFamily }}>
      {/* the topic stays on top for the whole video */}
      <div style={{ position: "absolute", left: 40, right: 40, top: 70, height: 230, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 6 }}>
        {title.map((row, i) => (
          <div key={i} style={{ fontWeight: 900, fontSize: 78, lineHeight: 1.15, color: i === title.length - 1 && title.length > 1 ? accent : "#fff", textAlign: "center", textShadow: "0 4px 18px rgba(0,0,0,.6)" }}>
            {row}
          </div>
        ))}
      </div>
      {segs.map((s, i) => {
        const from = fr(s.start);
        const to = i === segs.length - 1 ? total : fr(s.end);
        return (
          <Sequence key={i} from={from} durationInFrames={Math.max(1, to - from)} layout="none">
            {s.src ? <ScreenSegment seg={s} /> : s.textCard ? <TextSegment rows={s.textCard.rows} accent={accent} /> : null}
          </Sequence>
        );
      })}
      {timeline.cards.map((c, i) => {
        const from = fr(c.start);
        const to = i === timeline.cards.length - 1 ? total : fr(c.end);
        return (
          <Sequence key={`c${i}`} from={from} durationInFrames={Math.max(1, to - from)} layout="none">
            {c.badge && (
              <div style={{ position: "absolute", left: PANEL.x, top: PANEL.y + PANEL.h + 22 }}>
                <Pill text={c.badge} bg={accent} color="#08101f" />
              </div>
            )}
            <div style={{ position: "absolute", left: 50, right: 50, top: 1470, height: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 74, lineHeight: 1.25, color: "#fff", textAlign: "center", WebkitTextStroke: "14px #050a16", paintOrder: "stroke fill", whiteSpace: "pre-wrap" }}>
                {c.text.split("|").join("\n")}
              </div>
            </div>
          </Sequence>
        );
      })}
      {script.credit ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, textAlign: "center", fontWeight: 700, fontSize: 26, color: "rgba(255,255,255,.55)" }}>{String(script.credit)}</div>
      ) : null}
    </AbsoluteFill>
  );
};
