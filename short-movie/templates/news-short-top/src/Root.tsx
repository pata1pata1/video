import { Composition } from "remotion";
import { FPS, Short, totalFramesOf, type ShortProps } from "./Short";

// One app for every video: the video's script and card timeline come in as props
// (scripts/sm.mjs render), and the length follows the timeline.
const EMPTY: ShortProps = { script: {}, timeline: { duration: 0, cards: [] } };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, totalFramesOf(props.timeline)) })}
    durationInFrames={1}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
