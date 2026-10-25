import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ChapterTag, Subtitle } from "./components";
import { BrushTag, Words } from "./film";
import { DIAGRAMS } from "./current-diagrams";
import { PATTERN } from "./pattern";
import { Board, ChapterCard, Ending, Footage, Points, StatCard, Title } from "./scenes";
import { AUDIO_SRC, lineStart, SCRIPT, Segment, segments, Shown } from "./timeline";
import { color } from "./theme";

const TAG = PATTERN.design.chapterTag;

/** The footage a segment shows (full frame, or behind a card). */
const footageOf = (s: Shown): string | undefined =>
  s.kind === "footage" ? s.key : s.kind === "title" || s.kind === "chapter" || s.kind === "stat" ? s.footage : undefined;

/** Each segment fades in over the previous one for this many frames. */
const FADE = PATTERN.config.transition.fadeFrames;

const SegmentView: React.FC<{ seg: Segment; startFrame: number; footageFrom: number }> = ({ seg, startFrame, footageFrom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = startFrame === 0 ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const steps = seg.steps.map((s) => ({ at: Math.round(s.at * fps), step: s.step }));
  const s = seg.shown;
  const key = footageOf(s);
  const bg = key ? { key, from: footageFrom } : undefined;
  let body: React.ReactNode;
  switch (s.kind) {
    case "title":
      body = <Title bg={bg} />;
      break;
    case "chapter":
      body = <ChapterCard scene={s.scene} bg={bg} />;
      break;
    case "footage":
      body = (
        <>
          <Footage mediaKey={s.key} startFrame={footageFrom} />
          {s.words ? <Words words={s.words} /> : null}
        </>
      );
      break;
    case "diagram": {
      const Diagram = DIAGRAMS[s.name];
      if (!Diagram) throw new Error(`unknown diagram "${s.name}" (add it to src/videos/${SCRIPT.id}/diagrams.tsx)`);
      body = <Diagram steps={steps} />;
      break;
    }
    case "stat":
      body = <StatCard stat={s.stat} bg={bg} />;
      break;
    case "points":
      body = <Points points={s.points} />;
      break;
    case "board":
      body = <Board opened={s.opened} />;
      break;
    case "ending": {
      const ending = SCRIPT.scenes[SCRIPT.scenes.length - 1];
      body = <Ending lineFrames={ending.lines.map((l) => Math.round((lineStart(l.id) - seg.from) * fps))} />;
      break;
    }
  }
  const tag = seg.chapter && s.kind !== "chapter" && s.kind !== "board";
  return (
    <AbsoluteFill style={{ opacity }}>
      {body}
      {tag ? (
        TAG.style === "brush" ? (
          <BrushTag heading={seg.chapter!.heading!} color={color.accent} />
        ) : (
          <ChapterTag number={seg.chapter!.number!} heading={seg.chapter!.heading!} onDark={!!key} />
        )
      ) : null}
    </AbsoluteFill>
  );
};

/** withAudio=false renders silent frames (the MP4 gets the narration in encode-mp4.mjs). */
export const TriviaVideo: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  const { fps } = useVideoConfig();
  // where each footage clip continues from (frames already shown of that clip)
  const used: Record<string, number> = {};
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      {segments.map((seg) => {
        const start = Math.round(seg.from * fps);
        const end = Math.round(seg.to * fps);
        const key = footageOf(seg.shown);
        const footageFrom = key ? (used[key] ?? 0) : 0;
        if (key) used[key] = footageFrom + (end - start);
        return (
          <Sequence key={`${seg.from}`} from={start} durationInFrames={end - start + FADE} name={seg.shown.kind}>
            <SegmentView seg={seg} startFrame={start} footageFrom={footageFrom} />
          </Sequence>
        );
      })}
      <Subtitle />
      {withAudio ? <Audio src={staticFile(AUDIO_SRC)} /> : null}
    </AbsoluteFill>
  );
};
