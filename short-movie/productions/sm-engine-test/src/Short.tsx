import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import script from "../script.json";
import timeline from "../public/audio/timeline.json";
import { CAPTION_CENTER, CAPTION_MAX_FONT, CAPTION_MAX_WIDTH, HEIGHT, MAX_ZOOM, PANEL, VIDEO_BAND_BOX, VIDEO_PANEL, WIDTH } from "./layout";

const { fontFamily } = loadFont("normal", { weights: ["900"] });

export const FPS = 30;
const TAIL = 0.3; // seconds after the last word
const FADE = 10; // crossfade between images, frames
export const totalFrames = Math.ceil((timeline.duration + TAIL) * FPS);

type Card = { text: string; image: string; start: number; end: number };
type Motion = { zoom: [number, number]; panX: [number, number] };
// Video panel mode: a card's "image" names an entry of script.json "clips" instead of a file in public/images/.
// A clip is a source range (from/to, s) stretched to the shot length, or a still frame (public/video/) pushed in.
type Clip = { from?: number; to?: number; still?: string; x?: number; zoom?: [number, number]; origin?: [number, number] };
type Video = { src: string; width: number; height: number };
type Options = {
  panel?: typeof PANEL;
  motion?: Record<string, Motion>;
  captionColor?: string;
  video?: Video;
  clips?: Record<string, Clip>;
  footer?: string;
};
const options = script as unknown as Options;
const cards = timeline.cards as Card[];
const panel = options.panel ?? PANEL;
const f = (s: number) => Math.round(s * FPS);

// consecutive cards on the same image form one shot
type Shot = { image: string; from: number; to: number };
const shots: Shot[] = [];
for (const c of cards) {
  const last = shots[shots.length - 1];
  if (last && last.image === c.image) last.to = f(c.end);
  else shots.push({ image: c.image, from: f(c.start), to: f(c.end) });
}
shots[shots.length - 1].to = totalFrames;

// Default slow motions, used in turn unless script.json "motion" names one for the image.
const DEFAULT_MOTIONS: Motion[] = [
  { zoom: [1.0, MAX_ZOOM], panX: [0, 0] },
  { zoom: [MAX_ZOOM, 1.0], panX: [0, 0] },
  { zoom: [1.0, MAX_ZOOM], panX: [-6, 6] },
  { zoom: [MAX_ZOOM, 1.0], panX: [6, -6] },
];
const ORIGIN_Y = 85; // % of the panel: keeps the footer near its place

// The caption band and the panel border stay still; only the inside of the picture panel
// zooms / pans (clipped to the panel), so the image's headlines and footer never leave it.
const ShotView: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const len = shot.to - shot.from;
  const m = options.motion?.[shot.image] ?? DEFAULT_MOTIONS[index % DEFAULT_MOTIONS.length];
  const p = interpolate(frame, [0, len + FADE], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(p, [0, 1], m.zoom);
  const x = interpolate(p, [0, 1], m.panX);
  const opacity = index === 0 ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const src = staticFile(`images/${shot.image}`);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={src} style={{ width: WIDTH, height: HEIGHT }} />
      <div style={{ position: "absolute", ...panel, overflow: "hidden" }}>
        <Img
          src={src}
          style={{
            position: "absolute",
            left: -panel.left,
            top: -panel.top,
            width: WIDTH,
            height: HEIGHT,
            transform: `translateX(${x}px) scale(${scale})`,
            transformOrigin: `${panel.left + panel.width / 2}px ${panel.top + (panel.height * ORIGIN_Y) / 100}px`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// Video panel mode: the frame of a finished image (caption box, panel border, footer) is drawn here,
// and the panel shows the source video filling its height (sides cropped, "x" = crop position %).
const ClipView: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const clip = options.clips![shot.image];
  const video = options.video!;
  const p = VIDEO_PANEL;
  const srcW = video.width * (p.height / video.height);
  const len = shot.to - shot.from + FADE;
  const zoom = clip.zoom ?? (index % 2 ? [MAX_ZOOM, 1.0] : [1.0, MAX_ZOOM]);
  const scale = interpolate(frame, [0, len], zoom, { extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const opacity = index === 0 ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const [ox, oy] = clip.origin ?? [50, 50];
  const style = {
    position: "absolute" as const,
    left: -(srcW - p.width) * ((clip.x ?? 50) / 100),
    top: 0,
    width: srcW,
    height: p.height,
    transform: `scale(${scale})`,
    transformOrigin: `${(srcW * ox) / 100}px ${(p.height * oy) / 100}px`,
  };
  return (
    <div style={{ position: "absolute", ...p, overflow: "hidden", opacity, backgroundColor: "#000" }}>
      {clip.still ? (
        <Img src={staticFile(`video/${clip.still}`)} style={style} />
      ) : (
        <OffthreadVideo
          src={staticFile(`video/${video.src}`)}
          muted
          trimBefore={f(clip.from!)}
          playbackRate={(clip.to! - clip.from!) / (len / FPS)}
          style={style}
        />
      )}
    </div>
  );
};

const VideoFrame: React.FC = () => {
  const p = VIDEO_PANEL;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", ...VIDEO_BAND_BOX, borderRadius: 18, border: "2px solid rgba(90,150,255,0.45)", background: "linear-gradient(180deg,#0b1630,#081022)" }} />
      <div style={{ position: "absolute", left: p.left - 3, top: p.top - 3, width: p.width, height: p.height, border: "3px solid rgba(90,150,255,0.55)", borderRadius: 6 }} />
      {options.footer ? (
        <div style={{ position: "absolute", left: p.left, top: p.top + p.height - 110, width: p.width, height: 110, background: "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.75))" }}>
          <div style={{ position: "absolute", bottom: 26, width: "100%", textAlign: "center", color: "#dfe8ff", fontFamily, fontWeight: 900, fontSize: 30, letterSpacing: 2 }}>{options.footer}</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Vrew-style telop: white bold gothic with a thick colored outline, pops in small → full size.
// Always at the same place (CAPTION_CENTER), at most 2 lines, never moved per image.
// rough text width in em: half-width characters are narrower
const ems = (line: string) => [...line].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.6 : 1), 0);
const Telop: React.FC<{ text: string }> = ({ text }) => {
  const fontSize = Math.min(CAPTION_MAX_FONT, Math.floor(CAPTION_MAX_WIDTH / Math.max(...text.split("\n").map(ems))));
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 260, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [0.6, 1]);
  const opacity = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  const boxWidth = WIDTH - 88;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: CAPTION_CENTER.x - boxWidth / 2,
          top: CAPTION_CENTER.y,
          transform: `translateY(-50%) scale(${scale})`,
          opacity,
          width: boxWidth,
          textAlign: "center",
          whiteSpace: "pre-line",
          fontFamily,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.12,
          color: "#ffffff",
          WebkitTextStroke: `${Math.round(fontSize * 0.22)}px ${options.captionColor ?? "#c8102e"}`,
          paintOrder: "stroke fill",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.6))",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Short: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#050a18" }}>
    {shots.map((s, i) => (
      <Sequence key={`${s.image}-${i}`} from={s.from} durationInFrames={s.to - s.from + (i < shots.length - 1 ? FADE : 0)}>
        {options.clips ? <ClipView shot={s} index={i} /> : <ShotView shot={s} index={i} />}
      </Sequence>
    ))}
    {options.clips ? <VideoFrame /> : null}
    {cards.map((c, i) => (
      <Sequence key={i} from={f(c.start)} durationInFrames={(i < cards.length - 1 ? f(c.end) : totalFrames) - f(c.start)}>
        <Telop text={c.text} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
