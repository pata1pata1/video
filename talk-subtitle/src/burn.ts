// The subtitles as they will be burned in: the approved cues (draft + input/subtitles.json),
// laid out by the project's preset (input/subtitle-style.json; "fit-width" = one line unless it
// does not fit), each drawn once by Remotion as a transparent PNG and composited onto
// intermediate/cut.mp4 by ffmpeg during the cue's time range.

import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import { runTool } from "./engine.ts";
import type { ProjectPaths } from "./paths.ts";
import { readJson, readJsonIfExists } from "./project.ts";
import { bundleCompositions, measureTextEm, renderStillPng } from "./render.ts";
import { effectiveCues, layoutCues, loadPreset, loadSubtitleEdits, type SubtitleDraft, type SubtitlePreset } from "./subtitles.ts";
import { resolvePreset } from "../remotion/presetMath.ts";

export type BurnCue = { id: string; start: number; end: number; lines: string[] };

export type BurnPlan = { cues: BurnCue[]; preset: SubtitlePreset; width: number; height: number; duration: number };

/** Approved cues with their burn-in lines. Stops when the subtitles are not approved. */
export async function approvedBurnCues(paths: ProjectPaths, project: string): Promise<BurnPlan> {
  const draft = readJsonIfExists<SubtitleDraft>(paths.subtitlesDraft);
  if (!draft) throw new UserError("字幕案がありません（npm run subtitles -- draft）。");
  const edits = loadSubtitleEdits(paths, project);
  if (!edits.approved || edits.approved.draftFingerprint !== draft.fingerprint) throw new UserError("字幕がまだ承認されていません（npm run subtitles -- approve）。");
  const preset = loadPreset(paths);
  const report = readJson<{ rotation: { width: number; height: number } }>(paths.cutFinal.replace(/\.mp4$/, ".report.json"));
  const { width, height } = report.rotation; // cut.mp4 is upright
  const duration = draft.inputs.cutOutputSeconds;
  const cues = effectiveCues(draft, edits);
  const lines = new Map<string, string[]>();
  if (preset.layout.lineBreak === "fit-width") {
    const layout = await layoutCues(cues, resolvePreset(preset, width, height), preset.layout.maxLines, (t) => measureTextEm(t, preset.font));
    for (const l of layout) lines.set(l.id, l.lines);
  }
  return {
    preset,
    width,
    height,
    duration,
    // The last cue may end a hair after the video: clamp to the video.
    cues: cues
      .map((c) => ({ id: c.id, start: c.start, end: Math.min(c.end, duration), lines: lines.get(c.id) ?? c.text.split("\n") }))
      .filter((c) => c.end > c.start),
  };
}

/**
 * cut.mp4 [from, to) with the cues burned in → output (H.264 + AAC). The cue PNGs are rendered
 * into intermediate/render-overlay and removed afterwards. Returns the cues in the range.
 */
export async function burnRange(
  paths: ProjectPaths,
  plan: BurnPlan,
  from: number,
  to: number,
  output: string,
  opts: { audioFilter?: string; timeoutMs?: number } = {},
): Promise<BurnCue[]> {
  const inRange = plan.cues.filter((c) => c.end > from && c.start < to);
  const stage = path.join(paths.intermediate, "render-overlay");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    const serveUrl = await bundleCompositions(stage);
    const pngs: string[] = [];
    for (const c of inRange) {
      const png = path.join(stage, `${c.id}.png`);
      await renderStillPng(serveUrl, "SubtitleOverlay", { text: c.lines.join("\n"), preset: plan.preset, width: plan.width, height: plan.height }, png);
      pngs.push(png);
    }
    // A chain of overlays, each shown during its cue (times relative to `from`).
    const chain = inRange.map((c, i) => {
      const s = Math.max(0, c.start - from).toFixed(3);
      const e = (c.end - from).toFixed(3);
      return `[${i === 0 ? "0:v" : `v${i}`}][${i + 1}:v]overlay=0:0:enable='gte(t,${s})*lt(t,${e})'[v${i + 1}]`;
    });
    await runTool("ffmpeg", [
      "-v", "error",
      // The whole video is read as is (no seek), so frame and audio timestamps stay those of cut.mp4.
      ...(from > 0 ? ["-ss", from.toFixed(3)] : []),
      ...(to < plan.duration ? ["-t", (to - from).toFixed(3)] : []),
      "-i", paths.cutFinal,
      ...pngs.flatMap((p) => ["-i", p]),
      ...(chain.length ? ["-filter_complex", chain.join(";"), "-map", `[v${inRange.length}]`] : ["-map", "0:v"]),
      "-map", "0:a?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-fps_mode", "passthrough", "-enc_time_base:v", "demux", // keep cut.mp4's frame times exactly (no rounding to 1/fps)
      ...(opts.audioFilter ? ["-af", opts.audioFilter] : []),
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      "-y", output,
    ], { timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000 });
    return inRange;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
