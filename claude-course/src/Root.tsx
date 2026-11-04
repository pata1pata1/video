import React from "react";
import { Composition } from "remotion";
import { LessonVideo, type LessonVideoProps } from "./engine/LessonVideo";
import { checkNarration, loadNarration } from "./engine/narration";
import { lessons } from "./lessons/registry";
import { VIDEO } from "./theme/tokens";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {lessons.map((entry) => (
        <Composition
          key={entry.compositionId}
          id={entry.compositionId}
          component={LessonVideo}
          width={VIDEO.width}
          height={VIDEO.height}
          fps={VIDEO.fps}
          // Placeholder; the real length comes from narration.json below.
          durationInFrames={VIDEO.fps}
          defaultProps={{ lessonKey: entry.key, narration: null } satisfies LessonVideoProps}
          calculateMetadata={async ({ props }) => {
            const narration = await loadNarration(entry.narrationFile, entry.script, entry.captions, entry);
            return {
              durationInFrames: Math.ceil(narration.durationSeconds * VIDEO.fps),
              props: { ...props, narration },
            };
          }}
        />
      ))}
      {/* Lessons in their own project folder: script, presentation and narration
          come as props (video/claude-course scripts/cc.mjs render). */}
      <Composition
        id="Lesson"
        component={LessonVideo}
        width={VIDEO.width}
        height={VIDEO.height}
        fps={VIDEO.fps}
        durationInFrames={VIDEO.fps}
        defaultProps={{ lessonKey: "", narration: null, lesson: null } satisfies LessonVideoProps}
        calculateMetadata={({ props }) => {
          const { lesson, narration } = props;
          if (!lesson || !narration) throw new Error("Lesson needs the lesson and narration props (node scripts/cc.mjs render).");
          checkNarration(narration, "narration.json", lesson.script, lesson.captions, lesson);
          return { durationInFrames: Math.ceil(narration.durationSeconds * VIDEO.fps) };
        }}
      />
    </>
  );
};
