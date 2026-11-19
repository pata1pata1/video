import { Composition } from "remotion";
import { ClipShort, FPS, totalFramesOf, type ClipShortProps } from "./ClipShort";

// One app for every X-clip video: the script (clip range, layout, dialogue lines) and the
// narration's card timeline come in as props (scripts/sm.mjs render). Length = the clip.
const EMPTY: ClipShortProps = { script: {}, timeline: { duration: 0, cards: [] } };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ClipShort"
    component={ClipShort}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, totalFramesOf(props)) })}
    durationInFrames={1}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
