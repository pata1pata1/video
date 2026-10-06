import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { motion } from "../theme/tokens";

/**
 * Common transition: the scene fades in (with a slight rise) at its start and
 * fades out at its end. Use inside a <Sequence>, whose length is the scene's.
 */
export const SceneFade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const f = motion.fadeFrames;
  const opacity = Math.min(
    interpolate(frame, [0, f], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - f, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const rise = interpolate(frame, [0, f * 2], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity, transform: `translateY(${rise}px)` }}>{children}</AbsoluteFill>;
};
