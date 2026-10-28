import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import script from "../script.json";
import timeline from "../public/audio/timeline.json";
import { CAPTION_CENTER, CAPTION_MAX_FONT, CAPTION_MAX_WIDTH, HEIGHT, MAX_ZOOM, PANEL, WIDTH } from "./layout";

const { fontFamily } = loadFont("normal", { weights: ["900"] });

export const FPS = 30;
const TAIL = 0.3; // seconds after the last word
const FADE = 10; // crossfade between images, frames
export const totalFrames = Math.ceil((timeline.duration + TAIL) * FPS);

type Card = { text: string; image: string; start: number; end: number };
type Motion = { zoom: [number, number]; panX: [number, number] };
type Options = { panel?: typeof PANEL; motion?: Record<string, Motion>; captionColor?: string };
const options = script as Options;
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
        <ShotView shot={s} index={i} />
      </Sequence>
    ))}
    {cards.map((c, i) => (
      <Sequence key={i} from={f(c.start)} durationInFrames={(i < cards.length - 1 ? f(c.end) : totalFrames) - f(c.start)}>
        <Telop text={c.text} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
