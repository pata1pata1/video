import { Composition } from "remotion";
import { FPS, Trailer, totalFramesOf, type TrailerProps } from "./Trailer";

// One app for every trailer: the video's script and card timeline come in as props
// (scripts/sm.mjs render). Length = narration + the silent title card.
const EMPTY: TrailerProps = { script: {}, timeline: { duration: 0, cards: [] } };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Trailer"
    component={Trailer}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, totalFramesOf(props)) })}
    durationInFrames={1}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
