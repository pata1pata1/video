import React from "react";
import { Composition, Still } from "remotion";
import { Thumbnail } from "./Thumbnail";
import { NARRATION, SCRIPT } from "./timeline";
import { VIDEO } from "./theme";
import { TriviaVideo } from "./Video";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Trivia"
      component={TriviaVideo}
      durationInFrames={Math.ceil(NARRATION.durationSeconds * VIDEO.fps)}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
      defaultProps={{ withAudio: true }}
    />
    {SCRIPT.thumbnails.map((t) => (
      <Still key={t.id} id={`Thumbnail-${t.id}`} component={Thumbnail} width={1280} height={720} defaultProps={{ variant: t.id }} />
    ))}
  </>
);
