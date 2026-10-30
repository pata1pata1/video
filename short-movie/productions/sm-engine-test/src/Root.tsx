import { Composition } from "remotion";
import { FPS, totalFrames, Short } from "./Short";

export const RemotionRoot: React.FC = () => (
  <Composition id="Short" component={Short} durationInFrames={totalFrames} fps={FPS} width={1080} height={1920} />
);
