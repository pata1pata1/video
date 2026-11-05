// The subtitles as they will be burned in: the approved cues (draft + input/subtitles.json),
// laid out by the project's preset (input/subtitle-style.json; "fit-width" = one line unless it
// does not fit), each drawn once by Remotion as a transparent PNG and composited onto
// intermediate/cut.mp4 by ffmpeg during the cue's time range.

import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import { loadSettings } from "./config.ts";
import { measureLoudness, mixVoiceWithBgm, runTool } from "./engine.ts";
import type { ProjectPaths } from "./paths.ts";
import { readJson, readJsonIfExists } from "./project.ts";
import { bundleCompositions, measureTextEm, renderStillPng } from "./render.ts";
import { effectiveCues, layoutCues, loadPreset, loadSubtitleEdits, type SubtitleDraft, type SubtitlePreset } from "./subtitles.ts";
import { resolvePreset } from "../remotion/presetMath.ts";

export type BurnCue = { id: string; start: number; end: number; lines: string[] };

export type BurnPlan = { cues: BurnCue[]; preset: SubtitlePreset; width: number; height: number; duration: number };

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

/**
 * The audio of the render: cut.mp4's voice, plus the BGM in input/bgm/ when there is one
 * (mixed once by the shared engine, intermediate/render-audio/mix.wav). null = no BGM (use cut.mp4's audio).
 */
export async function prepareRenderAudio(paths: ProjectPaths, duration: number): Promise<{ file: string; bgm: string; gainDb: number; belowVoiceDb: number } | null> {
  const dir = path.join(paths.input, "bgm");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => AUDIO_EXT.test(f)) : [];
  if (files.length === 0) return null;
  if (files.length > 1) throw new UserError(`input/bgm/ に音声が ${files.length} 個あります（1曲だけにしてください）: ${files.join(", ")}`);
  const belowVoiceDb = loadSettings(paths).render.bgmBelowVoiceDb;
  const work = path.join(paths.intermediate, "render-audio");
  fs.mkdirSync(work, { recursive: true });
  const voice = path.join(work, "voice.wav");
  const mix = path.join(work, "mix.wav");
  await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", paths.cutFinal, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", voice]);
  const r = await mixVoiceWithBgm(voice, path.join(dir, files[0]), mix, { durationSeconds: duration, belowVoiceDb, overwrite: true });
  fs.rmSync(voice, { force: true });
  return { file: mix, bgm: files[0], gainDb: Math.round(r.gainDb * 10) / 10, belowVoiceDb };
}

/** Measured one-pass linear loudnorm to the target (the same filter for the final render and the check clips). */
export async function loudnormFilter(file: string, targetLufs: number, truePeakDb: number) {
  const before = await measureLoudness(file, { targetLufs, truePeakDb, loudnessRange: 11 });
  const lra = Math.min(50, Math.max(11, Math.ceil(before.loudnessRangeLu + 1)));
  const filter =
    `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}` +
    `:measured_I=${before.integratedLufs}:measured_TP=${before.truePeakDb}:measured_LRA=${before.loudnessRangeLu}` +
    `:measured_thresh=${before.thresholdLufs}:offset=${before.targetOffsetLu}:linear=true:print_format=summary,aresample=48000`;
  return { before, filter };
}

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
    // The project's display delay (settings.json render.subtitleDelaySeconds) shifts every cue alike.
    cues: cues
      .map((c) => ({ c, d: loadSettings(paths).render.subtitleDelaySeconds }))
      .map(({ c, d }) => ({ id: c.id, start: Math.max(0, c.start + d), end: Math.min(c.end + d, duration), lines: lines.get(c.id) ?? c.text.split("\n") }))
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
  opts: { audioFilter?: string; timeoutMs?: number; /** Audio file to use instead of cut.mp4's (same timeline, e.g. the BGM mix). */ audioInput?: string } = {},
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
    // Brightness first (the picture only, not the subtitles): luma scaled up from black (limited range 16–235).
    const brightness = loadSettings(paths).render.brightness;
    if (!(brightness > 0 && brightness <= 3)) throw new UserError(`settings.json の render.brightness（${brightness}）は 0〜3 の数で指定してください。`);
    const pre = brightness === 1 ? [] : [`[0:v]lutyuv=y='clip(16+(val-16)*${brightness},16,235)'[b0]`];
    const base = pre.length ? "b0" : "0:v";
    const tr = plan.preset.transition ?? {};
    const fadeIn = tr.fadeInSeconds ?? 0;
    const fadeOut = tr.fadeOutSeconds ?? 0;
    const fromOpacity = tr.fadeInFromOpacity ?? 0;
    if (!(fadeIn >= 0 && fadeIn <= 1 && fadeOut >= 0 && fadeOut <= 1 && fromOpacity >= 0 && fromOpacity < 1)) {
      throw new UserError("subtitle-style.json の transition は fadeInSeconds／fadeOutSeconds が 0〜1 秒、fadeInFromOpacity が 0〜1 未満です。");
    }
    const fade = Math.max(fadeIn, fadeOut);
    const pngInputs: string[] = [];
    let chain: string[];
    let outLabel: string | null;
    if (fade > 0 && inRange.length) {
      // Fades: two subtitle tracks (odd / even cues), each one transparent stream of the cues in
      // order (gaps = transparent), so a cue can fade out while the next fades in on the other track.
      // Times on a 1/60 s grid relative to `from`; a cue's fade-out never runs into its track's next cue.
      const FPS = 60;
      const len = Math.round((to - from) * FPS);
      const fr = (t: number) => Math.min(len, Math.max(0, Math.round((t - from) * FPS)));
      const inF = Math.round(fadeIn * FPS);
      const outF = Math.round(fadeOut * FPS);
      const { width: W, height: H } = plan;
      chain = [...pre];
      const tracks: string[] = [];
      for (const parity of [0, 1]) {
        const parts: string[] = [];
        let cursor = 0;
        inRange.forEach((c, i) => {
          if (i % 2 !== parity) return;
          const a = Math.max(fr(c.start), cursor);
          const nextSame = inRange[i + 2];
          const b = Math.min(fr(c.end) + outF, nextSame ? fr(nextSame.start) : len, len);
          if (b <= a) return;
          if (a > cursor) {
            chain.push(`color=c=black@0:s=${W}x${H}:r=${FPS}:d=${((a - cursor) / FPS).toFixed(6)},format=rgba,setsar=1[g${parity}_${i}]`);
            parts.push(`[g${parity}_${i}]`);
          }
          const n = b - a;
          const fo = Math.min(outF, Math.floor(n / 2));
          const fi = Math.min(inF, n - fo);
          pngInputs.push(pngs[i]);
          const k = pngInputs.length; // input index (0 is cut.mp4)
          const id = `${parity}_${i}`;
          const outFade = fo ? `,fade=t=out:s=${n - fo - (fi ? fi : 0)}:n=${fo}:alpha=1` : "";
          if (fi) {
            // Fade-in from fadeInFromOpacity: the alpha of the first fi frames is scaled up frame by frame.
            const ramp = `(${fromOpacity}+${(1 - fromOpacity).toFixed(4)}*N/${fi})`;
            chain.push(
              `[${k}:v]format=rgba,setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS,split[fa${id}][fb${id}]`,
              `[fa${id}]trim=end_frame=${fi},setpts=PTS-STARTPTS,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${ramp}'[fi${id}]`,
              `[fb${id}]trim=start_frame=${fi},setpts=PTS-STARTPTS${outFade}[fr${id}]`,
              `[fi${id}][fr${id}]concat=n=2:v=1:a=0[c${id}]`,
            );
          } else {
            chain.push(`[${k}:v]format=rgba,setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS${outFade.replace(`s=${n - fo}`, `s=${n - fo}`)}[c${id}]`);
          }
          parts.push(`[c${id}]`);
          cursor = b;
        });
        if (!parts.length) continue;
        chain.push(`${parts.join("")}concat=n=${parts.length}:v=1:a=0[t${parity}]`);
        tracks.push(`[t${parity}]`);
      }
      let cur = `[${base}]`;
      tracks.forEach((t, i) => {
        chain.push(`${cur}${t}overlay=0:0:eof_action=pass[o${i}]`);
        cur = `[o${i}]`;
      });
      outLabel = tracks.length ? cur : pre.length ? "[b0]" : null;
    } else {
      // A chain of overlays, each shown during its cue (times relative to `from`).
      pngInputs.push(...pngs);
      chain = [
        ...pre,
        ...inRange.map((c, i) => {
          const s = Math.max(0, c.start - from).toFixed(3);
          const e = (c.end - from).toFixed(3);
          return `[${i === 0 ? base : `v${i}`}][${i + 1}:v]overlay=0:0:enable='gte(t,${s})*lt(t,${e})'[v${i + 1}]`;
        }),
      ];
      outLabel = inRange.length ? `[v${inRange.length}]` : pre.length ? "[b0]" : null;
    }
    const graphFile = path.join(stage, "filtergraph.txt");
    fs.writeFileSync(graphFile, chain.join(";\n"));
    const loop = fade > 0 ? ["-loop", "1", "-framerate", "60"] : [];
    await runTool("ffmpeg", [
      "-v", "error",
      // The whole video is read as is (no seek), so frame and audio timestamps stay those of cut.mp4.
      ...(from > 0 ? ["-ss", from.toFixed(3)] : []),
      ...(to < plan.duration ? ["-t", (to - from).toFixed(3)] : []),
      "-i", paths.cutFinal,
      ...pngInputs.flatMap((p) => [...loop, "-i", p]),
      ...(opts.audioInput ? [...(from > 0 ? ["-ss", from.toFixed(3)] : []), ...(to < plan.duration ? ["-t", (to - from).toFixed(3)] : []), "-i", opts.audioInput] : []),
      // The graph goes in a file (-filter_complex_script; ffmpeg 6.1): with ~100 subtitles it is longer than Windows allows on a command line.
      ...(outLabel ? ["-filter_complex_script", graphFile, "-map", outLabel] : ["-map", "0:v"]),
      "-map", opts.audioInput ? `${pngInputs.length + 1}:a` : "0:a?",
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
