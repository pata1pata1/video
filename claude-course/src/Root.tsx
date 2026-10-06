import React from "react";
import { Composition } from "remotion";
import { LessonVideo, type LessonVideoProps } from "./engine/LessonVideo";
import { loadNarration } from "./engine/narration";
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
    </>
  );
};
