// talk-subtitle's Remotion compositions (bundled with remotion's node_modules,
// see src/render.ts). SubtitleStill: one frame of cut.mp4 (a PNG in the public
// folder) with one subtitle on top, for checking the design. SubtitleOverlay: one
// subtitle on a transparent frame, composited onto cut.mp4 by ffmpeg (src/burn.ts).

import type React from "react";
import { AbsoluteFill, Composition, Img, staticFile } from "remotion";
import { Subtitle, type SubtitlePreset } from "./Subtitle.tsx";

type StillProps = { frame: string; text: string; preset: SubtitlePreset; width: number; height: number };

const SubtitleStill: React.FC<StillProps> = ({ frame, text, preset, width, height }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Img src={staticFile(frame)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    <Subtitle text={text} preset={preset} width={width} height={height} />
  </AbsoluteFill>
);

type OverlayProps = { text: string; preset: SubtitlePreset; width: number; height: number };

const SubtitleOverlay: React.FC<OverlayProps> = ({ text, preset, width, height }) => (
  <AbsoluteFill>
    <Subtitle text={text} preset={preset} width={width} height={height} />
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <>
  <Composition
    id="SubtitleStill"
    component={SubtitleStill as React.FC<Record<string, unknown>>}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ frame: "", text: "", preset: {} as SubtitlePreset, width: 1920, height: 1080 }}
    calculateMetadata={({ props }) => ({ width: Number(props.width), height: Number(props.height) })}
  />
  <Composition
    id="SubtitleOverlay"
    component={SubtitleOverlay as React.FC<Record<string, unknown>>}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ text: "", preset: {} as SubtitlePreset, width: 1920, height: 1080 }}
    calculateMetadata={({ props }) => ({ width: Number(props.width), height: Number(props.height) })}
  />
  </>
);
