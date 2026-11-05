// Remotion from talk-subtitle, through the shared engine (src/engine.ts → remotion
// core/render, Node API): the packages (bundler, renderer, react, remotion) and the
// headless Chrome are the ones installed in ../../remotion — nothing is installed here.
// talk-subtitle's own compositions live in talk-subtitle/remotion/.
//
// The Node API does not read remotion.config.ts (Rspack, Tailwind): the default
// webpack + esbuild bundler is used, both of which run under this PC's Smart App Control.

import path from "node:path";
import { bundleApp, headlessBrowserExecutable, measureTextWidthsEm, renderStillImage } from "./engine.ts";
import { TOOL_ROOT } from "./paths.ts";

/** talk-subtitle's Remotion app (SubtitleStill / SubtitleOverlay). */
export const COMPOSITIONS_APP = { appRoot: TOOL_ROOT, entryPoint: path.join("remotion", "index.ts") };

/** Bundles talk-subtitle/remotion with `publicDir` as the public folder. Returns the serve URL (a folder). */
export function bundleCompositions(publicDir: string, onProgress?: (p: number) => void): Promise<string> {
  return bundleApp({ app: COMPOSITIONS_APP, publicDir, onProgress });
}

export function renderStillPng(serveUrl: string, compositionId: string, inputProps: Record<string, unknown>, output: string): Promise<void> {
  return renderStillImage({ serveUrl, compositionId, inputProps, output, imageFormat: "png" });
}

/**
 * Widths (in em) of `texts` as the subtitle font draws them, measured by the same headless
 * Chrome that renders (canvas measureText, letter spacing included). Used to decide line breaks
 * by the real width of a line instead of a character count.
 */
export async function measureTextEm(texts: string[], font: { family: string; weight: number; letterSpacingEm: number }): Promise<number[]> {
  if (!headlessBrowserExecutable()) throw new Error("headless Chrome が見つかりません（remotion の node_modules/.remotion）。");
  const r = await measureTextWidthsEm(texts, font);
  if (!r.fontAvailable) throw new Error(`フォント ${font.family} が見つかりません。`);
  return r.widthsEm;
}
