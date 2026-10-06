import type React from "react";
import { Easing, interpolate } from "remotion";
import { motion } from "../theme/tokens";

/** Frames between items that are revealed by the same line. */
const SAME_LINE_STAGGER = 8;
/** Frames between items when a scene has no cues. */
const DEFAULT_STAGGER = 6;

/**
 * Frame (relative to the scene start) at which each of `count` items appears.
 * cue[i] names the line whose start reveals item i; items sharing a line are
 * staggered slightly. Without a cue, items appear one after another at once.
 */
export const revealFrames = (
  count: number,
  cue: string[] | undefined,
  lineFrames: Record<string, number>,
): number[] => {
  const seen: Record<string, number> = {};
  return Array.from({ length: count }, (_, i) => {
    const id = cue?.[i];
    if (id === undefined || lineFrames[id] === undefined) return i * DEFAULT_STAGGER;
    const k = seen[id] ?? 0;
    seen[id] = k + 1;
    return lineFrames[id] + k * SAME_LINE_STAGGER;
  });
};

/** 0 → 1 over motion.revealFrames starting at `at`. */
export const revealProgress = (frame: number, at: number): number =>
  interpolate(frame, [at, at + motion.revealFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

/** Style for an item that fades in with a small slide. */
export const revealStyle = (t: number, axis: "x" | "y" = "y"): React.CSSProperties => ({
  opacity: t,
  transform: axis === "x" ? `translateX(${(1 - t) * 28}px)` : `translateY(${(1 - t) * 18}px)`,
});
