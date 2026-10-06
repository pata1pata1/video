import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CardGrid } from "../components/CardGrid";
import { ChapterTitle } from "../components/ChapterTitle";
import { ChatBubbles } from "../components/ChatBubbles";
import { CompareCards } from "../components/CompareCards";
import { EndCard } from "../components/EndCard";
import { FitText } from "../components/FitText";
import { FlowSteps } from "../components/FlowSteps";
import { KeyPoints } from "../components/KeyPoints";
import { ScreenFrame, zoomView, type Media, type VideoSegment } from "../components/ScreenFrame";
import { TitleCard } from "../components/TitleCard";
import { revealFrames, revealProgress, revealStyle } from "../components/reveal";
import type { ScriptChapter, ScriptScene } from "../engine/types";
import type { Shot } from "../lessons/registry";
import { RecordingBeats, type Beat } from "./recording";
import { accentGradient, color, font } from "../theme/tokens";

/** What a scene renderer gets. Frames are relative to the scene's start. */
export type SceneProps = {
  scene: ScriptScene;
  chapter: ScriptChapter;
  /** Frame (relative to scene start) at which each of the scene's lines starts. */
  lineFrames: Record<string, number>;
  /** Line ids whose start reveals each entry of the scene's list. */
  cue?: string[];
  /** Screenshot / recording presentation (screenshot layout, bubbles with a recording). */
  shot?: Shot;
  /** Beats of a "recording" scene (registry.ts beats). */
  beats?: Beat[];
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Attach reveal frames to a list using the scene's cue. */
const timed = (texts: string[], { cue, lineFrames }: SceneProps) =>
  revealFrames(texts.length, cue, lineFrames).map((revealFrame, i) => ({ text: texts[i], revealFrame }));

const Heading: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 60 }) => (
  <div style={{ fontSize: size, fontWeight: font.bold, color: color.heading, lineHeight: 1.3 }}>{children}</div>
);

/** Width of the text panel beside a screen. */
const SIDE_PANEL = 600;

/** Small pills, e.g. lesson themes or glossary terms. */
const Chips: React.FC<{ items: { text: string; revealFrame: number }[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      {items.map((c) => (
        <div
          key={c.text}
          style={{
            ...revealStyle(revealProgress(frame, c.revealFrame)),
            padding: "12px 24px",
            borderRadius: 999,
            backgroundColor: color.surface,
            border: `1px solid ${color.border}`,
            fontSize: 30,
            fontWeight: font.medium,
            color: color.text,
          }}
        >
          {c.text}
        </div>
      ))}
    </div>
  );
};

/** Vertical numbered steps for a side panel. */
const SideSteps: React.FC<{ items: { text: string; revealFrame: number }[] }> = ({ items }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {items.map((s, i) => (
        <div key={s.text} style={{ ...revealStyle(revealProgress(frame, s.revealFrame), "x"), display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 48,
              height: 48,
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
          <div style={{ fontSize: 36, fontWeight: font.medium, color: color.text }}>{s.text}</div>
        </div>
      ))}
    </div>
  );
};

/** The shot's media for a scene, with its current view and recording segments. */
const useShot = (props: SceneProps, src: string) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { shot, lineFrames } = props;
  if (!shot) throw new Error(`Scene ${props.scene.id} has media but no shot config in registry.ts.`);
  const media: Media = { kind: /\.(mp4|webm|mov)$/i.test(src) ? "video" : "image", src, ...shot.size };
  const full = { x: 0, y: 0, w: shot.size.width, h: shot.size.height };
  const view = shot.focus ? zoomView(full, shot.focus, frame, Math.round((shot.zoomAtSeconds ?? 0) * fps)) : shot.view;
  const segments: VideoSegment[] | undefined = shot.segments?.map((s) => ({
    at: s.atLine !== undefined ? (lineFrames[s.atLine] ?? 0) : 0,
    from: s.from,
    to: s.to,
  }));
  return { media, view, segments };
};

const TitleScene: React.FC<SceneProps> = ({ scene }) => (
  <TitleCard title={str(scene.visual?.title)} subtitle={str(scene.visual?.subtitle)} />
);

const ChapterScene: React.FC<SceneProps> = ({ chapter }) => <ChapterTitle number={chapter.number} title={chapter.title} />;

const PointsScene: React.FC<SceneProps> = (props) => (
  <KeyPoints heading={str(props.scene.visual?.heading)} items={timed(strList(props.scene.visual?.items), props)} />
);

const CautionsScene: React.FC<SceneProps> = (props) => (
  <KeyPoints heading={str(props.scene.visual?.heading)} items={timed(strList(props.scene.visual?.items), props)} marker="caution" />
);

const MessageScene: React.FC<SceneProps> = ({ scene }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    <div
      style={{
        fontSize: 72,
        fontWeight: font.bold,
        color: color.heading,
        backgroundColor: color.surface,
        border: `2px solid ${color.border}`,
        boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        borderRadius: 28,
        padding: "64px 96px",
        textAlign: "center",
      }}
    >
      {str(scene.visual?.text)}
      <div style={{ margin: "36px auto 0", width: 120, height: 6, borderRadius: 3, background: accentGradient }} />
    </div>
  </AbsoluteFill>
);

const CompareScene: React.FC<SceneProps> = (props) => {
  const v = props.scene.visual;
  const side = (o: unknown) => ({ title: str(obj(o).title), body: str(obj(o).body) });
  return <CompareCards left={side(v?.left)} right={side(v?.right)} actions={timed(strList(v?.actions), props)} />;
};

const FlowScene: React.FC<SceneProps> = (props) => {
  const v = props.scene.visual;
  const steps = strList(v?.steps);
  const note = str(v?.note);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 56 }}>
      <Heading>{str(v?.heading)}</Heading>
      <FlowSteps steps={timed(steps, props)} loop={v?.loop === true} boxWidth={steps.length > 3 ? 360 : 420} />
      {note && (
        <div
          style={{
            ...revealStyle(revealProgress(frame, 0)),
            padding: "14px 32px",
            borderRadius: 999,
            backgroundColor: color.cautionSoft,
            border: `1px solid ${color.cautionBorder}`,
            color: color.caution,
            fontSize: 32,
            fontWeight: font.bold,
          }}
        >
          {note}
        </div>
      )}
    </AbsoluteFill>
  );
};

const CardsScene: React.FC<SceneProps> = (props) => {
  const items = strList(props.scene.visual?.items);
  return <CardGrid heading={str(props.scene.visual?.heading)} items={timed(items, props)} columns={items.length === 4 ? 2 : 1} />;
};

const BubblesScene: React.FC<SceneProps> = (props) => {
  const v = props.scene.visual;
  const items = timed(strList(v?.items), props);
  const recording = str(v?.recording);
  if (!recording) {
    return (
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 240px", gap: 44 }}>
        <Heading>{str(v?.heading)}</Heading>
        <ChatBubbles items={items} maxWidth={1300} />
      </AbsoluteFill>
    );
  }
  return <BubblesWithRecording {...props} items={items} recording={recording} />;
};

const BubblesWithRecording: React.FC<SceneProps & { items: { text: string; revealFrame: number }[]; recording: string }> = (props) => {
  const { media, view, segments } = useShot(props, props.recording);
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 90px", gap: 56 }}>
      <div style={{ width: 800, display: "flex", flexDirection: "column", gap: 36 }}>
        <Heading size={52}>{str(props.scene.visual?.heading)}</Heading>
        <ChatBubbles items={props.items} maxWidth={800} fontSize={32} />
      </div>
      <ScreenFrame media={media} width={840} view={view} segments={segments} />
    </AbsoluteFill>
  );
};

/**
 * A real screen (screenshot or recording) on the dark video. Wide crops get
 * the heading above; otherwise a side panel (heading + caption / chips /
 * steps) sits left of the screen.
 */
const ScreenshotScene: React.FC<SceneProps> = (props) => {
  const v = props.scene.visual;
  const { media, view, segments } = useShot(props, str(v?.src));
  const heading = str(v?.heading);
  const note = str(v?.caption) || str(v?.highlight);
  const wide = view && view.w / view.h > 2.5;
  if (wide) {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 48 }}>
        <Heading>{heading}</Heading>
        <ScreenFrame media={media} width={1300} view={view} segments={segments} />
        {note && <div style={{ fontSize: 32, color: color.muted }}>{note}</div>}
      </AbsoluteFill>
    );
  }
  const chips = strList(v?.chips);
  const steps = strList(v?.steps);
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 90px", gap: 60 }}>
      <div style={{ width: SIDE_PANEL, display: "flex", flexDirection: "column", gap: 36 }}>
        <FitText text={heading} width={SIDE_PANEL} fontSize={48} style={{ fontWeight: font.bold, color: color.heading, lineHeight: 1.3 }} />
        {note && <FitText text={note} width={SIDE_PANEL} fontSize={30} style={{ color: color.muted, lineHeight: 1.5 }} />}
        {chips.length > 0 && <Chips items={timed(chips, props)} />}
        {steps.length > 0 && <SideSteps items={timed(steps, props)} />}
      </div>
      <ScreenFrame media={media} width={1920 - 180 - 60 - SIDE_PANEL} view={view} segments={segments} />
    </AbsoluteFill>
  );
};

const EndScene: React.FC<SceneProps> = ({ scene }) => (
  <EndCard message={str(scene.visual?.message)} next={str(scene.visual?.next)} credit={str(scene.visual?.credit)} />
);

const RecordingScene: React.FC<SceneProps> = ({ scene, beats, lineFrames }) => (
  <RecordingBeats sceneId={scene.id} beats={beats} lineFrames={lineFrames} />
);

const renderers: Record<string, React.FC<SceneProps>> = {
  title: TitleScene,
  chapter: ChapterScene,
  points: PointsScene,
  message: MessageScene,
  compare: CompareScene,
  bubbles: BubblesScene,
  flow: FlowScene,
  screenshot: ScreenshotScene,
  cards: CardsScene,
  cautions: CautionsScene,
  end: EndScene,
  recording: RecordingScene,
};

export const SceneView: React.FC<SceneProps> = (props) => {
  const Renderer = renderers[props.scene.layout];
  if (!Renderer) throw new Error(`No renderer for layout "${props.scene.layout}" (scene ${props.scene.id}).`);
  return <Renderer {...props} />;
};

/** Layouts whose scene fills the frame without the header (course / chapter label). */
export const fullBleedLayouts = new Set(["title", "chapter", "end"]);
