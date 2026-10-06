import React from "react";
import { Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Frame } from "../components/Frame";
import { SceneFade } from "../components/SceneFade";
import { Subtitle } from "../components/Subtitle";
import { lessons } from "../lessons/registry";
import { SceneView, fullBleedLayouts } from "../scenes";
import { motion } from "../theme/tokens";
import { ContentHeightContext, contentHeight } from "./contentArea";
import type { Narration, TimedLine } from "./types";

export type LessonVideoProps = {
  lessonKey: string;
  /** Filled by calculateMetadata from narration.json; never hand-written. */
  narration: Narration | null;
  /**
   * false = leave narration.wav out (render --props='{"withAudio":false}'),
   * for a silent image-sequence render whose audio is muxed afterwards.
   */
  withAudio?: boolean;
};

/**
 * Line whose caption is on screen at time t: a line shows from its exact
 * start until it ends plus a short hold, cut off by the next line's start.
 * Starts are never moved, so captions never lead or lag the voice.
 */
const lineAt = (lines: TimedLine[], t: number): TimedLine | null => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (t < line.start) continue;
    const next = lines[i + 1];
    const until = Math.min(line.end + motion.subtitleHoldSeconds, next ? next.start : Infinity);
    return t < until ? line : null;
  }
  return null;
};

export const LessonVideo: React.FC<LessonVideoProps> = ({ lessonKey, narration, withAudio = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entry = lessons.find((l) => l.key === lessonKey);
  if (!entry) throw new Error(`Unknown lesson "${lessonKey}".`);
  if (!narration) throw new Error("narration is missing (calculateMetadata did not run).");

  const { script } = entry;
  const scenes = script.chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ chapter, scene })));
  const toFrame = (s: number) => Math.round(s * fps);

  // Each scene is on screen from a little before its first line until the
  // next scene takes over; the first starts at 0, the last runs to the end.
  const windows = scenes.map(({ scene }, i) => {
    const timed = narration.scenes[i];
    const from = i === 0 ? 0 : toFrame(timed.start - motion.sceneLeadSeconds);
    return { id: scene.id, from };
  });
  const bounds = windows.map((w, i) => ({
    from: w.from,
    to: i + 1 < windows.length ? windows[i + 1].from : durationInFrames,
  }));

  const currentIndex = Math.max(0, bounds.findIndex((b) => frame >= b.from && frame < b.to));
  const current = scenes[currentIndex];
  const line = lineAt(narration.lines, frame / fps);
  // Timing always from narration.json; wording may be a display-only override.
  const caption = line ? (entry.captions[line.id] ?? line.caption) : null;
  const showHeader = !entry.hideHeader && !fullBleedLayouts.has(current.scene.layout);

  return (
    <>
      {withAudio && <Audio src={staticFile(entry.audioFile)} />}
      <Frame
        course={script.course}
        chapterLabel={[current.chapter.number, current.chapter.title].join(String.fromCharCode(0x3000))}
        showHeader={showHeader}
        subtitle={<Subtitle text={caption} />}
      >
        {scenes.map(({ chapter, scene }, i) => {
          const { from, to } = bounds[i];
          const lineFrames = Object.fromEntries(
            narration.lines.filter((l) => l.sceneId === scene.id).map((l) => [l.id, toFrame(l.start) - from]),
          );
          return (
            <Sequence key={scene.id} from={from} durationInFrames={to - from} name={scene.id} layout="none">
              <ContentHeightContext.Provider value={contentHeight(!entry.hideHeader && !fullBleedLayouts.has(scene.layout))}>
                <SceneFade>
                  <SceneView
                    scene={scene}
                    chapter={chapter}
                    lineFrames={lineFrames}
                    cue={entry.cues[scene.id]}
                    shot={entry.shots[scene.id]}
                    beats={entry.beats?.[scene.id]}
                  />
                </SceneFade>
              </ContentHeightContext.Provider>
            </Sequence>
          );
        })}
      </Frame>
    </>
  );
};
