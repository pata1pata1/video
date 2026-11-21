import { Composition } from "remotion";
import { DemoShort, totalFramesOf, type DemoProps } from "./DemoShort";
import { FPS } from "../shots.mjs";

// One app for every tool demo short: the script, its card timeline and the screen recordings' logs come in as props
// (scripts/sm.mjs render), and the length follows the timeline.
const EMPTY: DemoProps = { script: {}, timeline: { duration: 0, cards: [] } };

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DemoShort"
    component={DemoShort}
    defaultProps={EMPTY}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, totalFramesOf(props.timeline)) })}
    durationInFrames={1}
    fps={FPS}
    width={1080}
    height={1920}
  />
);
