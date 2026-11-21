import { loadFont } from "@remotion/google-fonts/NotoSansJP";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const { fontFamily } = loadFont("normal", { weights: ["900"] });

export const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;

type Card = { text: string; start: number; end: number; style?: "title" | "narration" };
type Line = { text: string; start: number; end: number };
type Script = {
  clip?: { file: string; start?: number; end: number; width: number; height: number };
  /** contain = whole clip, blurred copy behind it; cover = fill the screen (crops the sides). */
  layout?: { fit?: "contain" | "cover"; videoCenterY?: number; titleY?: number; captionY?: number; zoom?: number; titleMaxFont?: number };
  /** what people in the clip say (absolute seconds of the video), drawn white with a black outline */
  lines?: Line[];
  credit?: string;
};
/** The video (input/script.json) and the narration's card timeline (audio/timeline.json). */
export type ClipShortProps = { script: Record<string, unknown>; timeline: { duration: number; cards: Card[] } };
const clipSeconds = (s: Script) => (s.clip ? s.clip.end - (s.clip.start ?? 0) : 0);
export const totalFramesOf = (p: ClipShortProps) => Math.ceil(Math.max(clipSeconds(p.script as Script), p.timeline.duration) * FPS);
const f = (s: number) => Math.round(s * FPS);

// caption styles (the channel's own: red title, blue-outlined narration, black-outlined dialogue)
const STYLES = {
  title: { color: "#ff1a1a", stroke: "#ffffff", maxFont: 104, shadow: "drop-shadow(0 6px 8px rgba(0,0,0,0.75))" },
  narration: { color: "#ffffff", stroke: "#1450e6", maxFont: 88, shadow: "drop-shadow(0 4px 6px rgba(0,0,0,0.6))" },
  line: { color: "#ffffff", stroke: "#111111", maxFont: 84, shadow: "drop-shadow(0 4px 6px rgba(0,0,0,0.6))" },
} as const;
const MAX_WIDTH = WIDTH - 100;
const ems = (line: string) => [...line].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 0.6 : 1), 0);

const Telop: React.FC<{ text: string; kind: keyof typeof STYLES; y: number; maxFont?: number }> = ({ text, kind, y, maxFont }) => {
  const st = STYLES[kind];
  const fontSize = Math.min(maxFont ?? st.maxFont, Math.floor(MAX_WIDTH / Math.max(...text.split("\n").map(ems))));
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 260, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [kind === "title" ? 1.35 : 0.6, 1]);
  const opacity = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: y,
        width: WIDTH,
        transform: `translateY(-50%) scale(${scale})`,
        opacity,
        textAlign: "center",
        whiteSpace: "pre-line",
        fontFamily,
        fontWeight: 900,
        fontSize,
        lineHeight: 1.15,
        color: st.color,
        WebkitTextStroke: `${Math.round(fontSize * 0.2)}px ${st.stroke}`,
        paintOrder: "stroke fill",
        filter: st.shadow,
      }}
    >
      {text}
    </div>
  );
};

const Clip: React.FC<{ script: Script }> = ({ script }) => {
  const clip = script.clip!;
  const layout = script.layout ?? {};
  const src = staticFile(`video/${clip.file}`);
  const trimBefore = f(clip.start ?? 0);
  const fit = layout.fit ?? "contain";
  const zoom = layout.zoom ?? 1;
  // contain: full width, height by the clip's aspect, centred at videoCenterY
  const h = Math.min(HEIGHT, (WIDTH / clip.width) * clip.height) * zoom;
  const w = WIDTH * zoom;
  const cy = layout.videoCenterY ?? HEIGHT / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {fit === "contain" ? (
        <>
          <OffthreadVideo
            src={src}
            muted
            trimBefore={trimBefore}
            style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(36px) brightness(0.45)", transform: "scale(1.15)" }}
          />
          <OffthreadVideo
            src={src}
            muted
            trimBefore={trimBefore}
            style={{ position: "absolute", left: (WIDTH - w) / 2, top: cy - h / 2, width: w, height: h, objectFit: "cover" }}
          />
        </>
      ) : (
        <OffthreadVideo src={src} muted trimBefore={trimBefore} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
      )}
    </AbsoluteFill>
  );
};

export const ClipShort: React.FC<ClipShortProps> = ({ script: raw, timeline }) => {
  const script = raw as Script;
  if (!script.clip) return <AbsoluteFill style={{ backgroundColor: "#000" }} />;
  const total = totalFramesOf({ script: raw, timeline });
  // the title stays on screen from its start to the end; narration / dialogue sit lower, over the video
  const titleY = script.layout?.titleY ?? 330;
  // a smaller title for clips whose video fills the top of the frame (default: the title style's 104)
  const titleMaxFont = script.layout?.titleMaxFont;
  const y = script.layout?.captionY ?? 640;
  const cards = timeline.cards;
  // a dialogue line is hidden while a narration caption is on screen
  const isTitle = (c: Card) => c.style === "title";
  const covered = (l: Line) => cards.some((c) => !isTitle(c) && c.start < l.end && l.start < c.end);
  return (
    <AbsoluteFill>
      <Clip script={script} />
      {(script.lines ?? []).filter((l) => !covered(l)).map((l, i) => (
        <Sequence key={`l${i}`} from={f(l.start)} durationInFrames={Math.max(1, f(l.end) - f(l.start))}>
          <Telop text={l.text} kind="line" y={y} />
        </Sequence>
      ))}
      {cards.map((c, i) => (
        <Sequence key={`c${i}`} from={f(c.start)} durationInFrames={Math.max(1, (isTitle(c) ? total : Math.min(f(c.end), total)) - f(c.start))}>
          <Telop text={c.text} kind={isTitle(c) ? "title" : "narration"} y={isTitle(c) ? titleY : y} maxFont={isTitle(c) ? titleMaxFont : undefined} />
        </Sequence>
      ))}
      {script.credit ? (
        <div style={{ position: "absolute", right: 28, bottom: 230, fontFamily, fontWeight: 900, fontSize: 28, color: "rgba(255,255,255,0.75)", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>
          {script.credit}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
