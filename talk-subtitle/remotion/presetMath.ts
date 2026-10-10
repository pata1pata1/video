// Pixel values a subtitle preset resolves to for a frame size. Plain .ts (no JSX)
// so that Node scripts can import it too (reports print these numbers).

export type SubtitlePreset = {
  font: { family: string; weight: number; sizeRatio: number; lineHeight: number; letterSpacingEm: number };
  color: string;
  stroke: { enabled: boolean; color: string; widthRatio: number; opacity: number };
  background: { enabled: boolean; color: string; opacity: number; paddingEm: [number, number]; radiusEm: number };
  shadow: { enabled: boolean; color: string; blurEm: number; opacity: number };
  position: { anchor: "bottom" | "top"; marginRatio: number; maxWidthRatio: number; align: "center" | "left" };
};

export function resolvePreset(p: SubtitlePreset, width: number, height: number) {
  const short = Math.min(width, height);
  const fontSize = short * p.font.sizeRatio;
  return {
    short,
    fontSize,
    strokeWidth: p.stroke.enabled ? fontSize * p.stroke.widthRatio : 0,
    margin: short * p.position.marginRatio,
    maxWidth: width * p.position.maxWidthRatio,
    lineHeightPx: fontSize * p.font.lineHeight,
  };
}
