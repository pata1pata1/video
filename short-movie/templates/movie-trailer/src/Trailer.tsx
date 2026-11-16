import { loadFont as loadSerif } from "@remotion/google-fonts/NotoSerifJP";
import { loadFont as loadSans } from "@remotion/google-fonts/NotoSansJP";
import { AbsoluteFill, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// 縦型の映画予告編（アクション／壮大）。ナレーション（VOICEVOX）に合わせて画像を切り替え、
// 最後に無音のタイトルカード。値の意味は ../README.md。
const { fontFamily: serif } = loadSerif("normal", { weights: ["900"] });
const { fontFamily: sans } = loadSans("normal", { weights: ["900"] });

export const FPS = 30;
const W = 1080;
const BAR = 150; // 上下の黒帯（シネマスコープ風）
const CAPTION_Y = 1450; // 字幕の中心
const FLASH_FRAMES = 6;

type Card = { sentence: number; text: string; image?: string; start: number; end: number };
type Motion = { zoom?: "in" | "out"; shake?: number };
type Title = { main?: string; sub?: string; release?: string; image?: string; seconds?: number };
type Script = { captionColor?: string; motion?: Record<string, Motion>; title?: Title };
export type TrailerProps = { script: Script; timeline: { duration: number; cards: Card[] } };

const titleSeconds = (s: Script) => s.title?.seconds ?? 4;
export const totalFramesOf = (p: TrailerProps) => Math.ceil((p.timeline.duration + titleSeconds(p.script)) * FPS);

// 同じ画像が続く札をまとめて1カットにする
type Shot = { image?: string; start: number; end: number };
const shotsOf = (cards: Card[]): Shot[] => {
  const shots: Shot[] = [];
  for (const c of cards) {
    const last = shots[shots.length - 1];
    if (last && last.image === c.image) last.end = c.end;
    else shots.push({ image: c.image, start: c.start, end: c.end });
  }
  return shots;
};

const shakeOf = (frame: number, strength: number, seed: string) =>
  `translate(${(random(`${seed}x${frame}`) - 0.5) * strength}px, ${(random(`${seed}y${frame}`) - 0.5) * strength}px)`;

const Flash: React.FC<{ frames?: number }> = ({ frames = FLASH_FRAMES }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, frames], [0.85, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: "white", opacity }} />;
};

const Placeholder: React.FC<{ label: string; index: number }> = ({ label, index }) => {
  const hue = (index * 47 + 200) % 360;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, hsl(${hue},55%,22%), hsl(${(hue + 40) % 360},65%,7%))`,
        justifyContent: "center",
        alignItems: "center",
        color: "rgba(255,255,255,0.3)",
        fontFamily: sans,
        fontSize: 56,
      }}
    >
      {label}
    </AbsoluteFill>
  );
};

const ShotLayer: React.FC<{ shot: Shot; index: number; frames: number; motion: Motion }> = ({ shot, index, frames, motion }) => {
  const frame = useCurrentFrame();
  const t = frames > 1 ? frame / (frames - 1) : 0;
  const zoomIn = (motion.zoom ?? (index % 2 === 0 ? "in" : "out")) === "in";
  const scale = zoomIn ? interpolate(t, [0, 1], [1.04, 1.2]) : interpolate(t, [0, 1], [1.2, 1.04]);
  // カットの頭で強く揺れて収まる＋常に小さく揺れる
  const hit = interpolate(frame, [0, 10], [motion.shake ?? 18, 0], { extrapolateRight: "clamp" });
  const shake = shakeOf(frame, hit + 3, `s${index}`);
  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `${shake} scale(${scale})` }}>
        {shot.image ? (
          <Img src={staticFile(`images/${shot.image}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Placeholder label={`IMAGE ${index + 1}`} index={index} />
        )}
      </AbsoluteFill>
      {/* ティール＆オレンジの色味 */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,70,90,0.35), rgba(255,120,0,0.15))", mixBlendMode: "overlay" }} />
      <Flash />
    </AbsoluteFill>
  );
};

const CaptionLayer: React.FC<{ card: Card; frames: number; color: string }> = ({ card, frames, color }) => {
  const frame = useCurrentFrame();
  const inO = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const outO = interpolate(frame, [frames - 6, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const spacing = interpolate(frame, [0, frames], [0.45, 0.15], { extrapolateRight: "clamp" });
  const lines = card.text.split("\n");
  const fontSize = Math.min(84, Math.floor((W - 140) / Math.max(...lines.map((l) => l.length), 1) / (1 + spacing)));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", top: CAPTION_Y - 960 }}>
      <div
        style={{
          opacity: inO * outO,
          color: "white",
          fontFamily: serif,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.35,
          letterSpacing: `${spacing}em`,
          textAlign: "center",
          whiteSpace: "pre",
          textShadow: `0 0 18px ${color}, 0 0 40px rgba(0,0,0,0.95), 0 4px 10px rgba(0,0,0,0.9)`,
        }}
      >
        {card.text}
      </div>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ title: Title; color: string }> = ({ title, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  const scale = interpolate(slam, [0, 1], [2.6, 1]);
  const shake = shakeOf(frame, interpolate(frame, [0, 14], [36, 0], { extrapolateRight: "clamp" }), "title");
  const sub = interpolate(frame, [20, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rel = interpolate(frame, [40, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shine = interpolate(frame, [10, 60], [-400, 1400], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const main = title.main ?? "";
  const mainSize = Math.min(160, Math.floor((W - 160) / Math.max(main.length, 1) / 0.7));
  return (
    <AbsoluteFill style={{ backgroundColor: "black", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      {title.image ? (
        <AbsoluteFill style={{ opacity: 0.35 }}>
          <Img src={staticFile(`images/${title.image}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, #2a1a08 0%, #000 70%)" }} />
      )}
      <div style={{ transform: `${shake} scale(${scale})`, textAlign: "center" }}>
        <div
          style={{
            fontFamily: sans,
            fontWeight: 900,
            fontSize: mainSize,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: "transparent",
            backgroundImage: `linear-gradient(100deg, ${color} 0%, ${color} ${shine - 120}px, #fff6d8 ${shine}px, ${color} ${shine + 120}px, ${color} 100%)`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            filter: "drop-shadow(0 0 24px rgba(255,170,60,0.5))",
          }}
        >
          {main}
        </div>
      </div>
      {title.sub ? (
        <div style={{ position: "relative", opacity: sub, marginTop: 44, color: "#eee", fontFamily: serif, fontWeight: 900, fontSize: 54, letterSpacing: "0.35em" }}>{title.sub}</div>
      ) : null}
      {title.release ? (
        <div style={{ position: "relative", opacity: rel, marginTop: 130, color: "#bbb", fontFamily: sans, fontWeight: 900, fontSize: 42, letterSpacing: "0.2em" }}>{title.release}</div>
      ) : null}
      <Flash frames={10} />
    </AbsoluteFill>
  );
};

const CinemaOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7) 100%)" }} />
      <AbsoluteFill
        style={{ opacity: 0.06, backgroundImage: `repeating-linear-gradient(${(frame * 37) % 180}deg, #fff 0px, transparent 1px, transparent 3px)` }}
      />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: BAR, background: "black" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: BAR, background: "black" }} />
    </AbsoluteFill>
  );
};

const f = (sec: number) => Math.round(sec * FPS);

export const Trailer: React.FC<TrailerProps> = ({ script, timeline }) => {
  const color = script.captionColor ?? "#b8860b";
  const shots = shotsOf(timeline.cards);
  const endOfVoice = f(timeline.duration);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {shots.map((shot, i) => {
        const from = f(shot.start);
        const to = i + 1 < shots.length ? f(shots[i + 1].start) : endOfVoice;
        return (
          <Sequence key={`shot${i}`} from={from} durationInFrames={Math.max(1, to - from)}>
            <ShotLayer shot={shot} index={i} frames={Math.max(1, to - from)} motion={script.motion?.[shot.image ?? ""] ?? {}} />
          </Sequence>
        );
      })}
      {timeline.cards.map((card, i) => {
        const from = f(card.start);
        const frames = Math.max(1, f(card.end) - from);
        return card.text ? (
          <Sequence key={`cap${i}`} from={from} durationInFrames={frames}>
            <CaptionLayer card={card} frames={frames} color={color} />
          </Sequence>
        ) : null;
      })}
      <Sequence from={endOfVoice} durationInFrames={f(titleSeconds(script))}>
        <TitleCard title={script.title ?? {}} color={color} />
      </Sequence>
      <CinemaOverlay />
    </AbsoluteFill>
  );
};
