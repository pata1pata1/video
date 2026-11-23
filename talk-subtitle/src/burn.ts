// The subtitles as they will be burned in: the approved cues (draft + input/subtitles.json),
// laid out by the project's preset (input/subtitle-style.json; "fit-width" = one line unless it
// does not fit), each drawn once by Remotion as a transparent PNG and composited onto
// intermediate/cut.mp4 by ffmpeg during the cue's time range.
//
// talk-subtitle decides everything about the picture here (which cues, their lines and times,
// the fades, the brightness) and builds the filtergraph; remotion's core runs the steps
// (src/engine.ts: Remotion stills, burnOverlayGraph = the ffmpeg composite, the measured
// loudnorm filter, the BGM mix and the audio extraction).

import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import { frameTimestamps } from "./cut.ts";
import { loadSettings } from "./config.ts";
import { burnOverlayGraph, concatMedia, encodeAacLoudnorm, extractAudio, limitPeaksTowardLoudness, loudnormApplyFilter, measureLoudness, mixVoiceWithBgm, muxVideoAudio } from "./engine.ts";
import type { ProjectPaths } from "./paths.ts";
import { readJson, readJsonIfExists } from "./project.ts";
import { bundleCompositions, measureTextEm, renderStillPng } from "./render.ts";
import { effectiveCues, layoutCues, loadPreset, presetForSpeaker, loadSubtitleEdits, type SubtitleDraft, type SubtitlePreset } from "./subtitles.ts";
import { resolvePreset } from "../remotion/presetMath.ts";

export type BurnCue = { id: string; start: number; end: number; lines: string[]; speaker?: string };

export type BurnPlan = { cues: BurnCue[]; preset: SubtitlePreset; width: number; height: number; duration: number };

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

/**
 * The audio of the render: cut.mp4's voice, plus the BGM in input/bgm/ when there is one
 * (mixed once by the shared engine, intermediate/render-audio/mix.wav). null = no BGM (use cut.mp4's audio).
 */
export async function prepareRenderAudio(paths: ProjectPaths, duration: number, loudness: { targetLufs: number; truePeakDb: number } = { targetLufs: -14, truePeakDb: -1.5 }): Promise<{ file: string; bgm: string | null; gainDb: number; belowVoiceDb: number; limit: { gainDb: number; limitDb: number } }> {
  const dir = path.join(paths.input, "bgm");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => AUDIO_EXT.test(f)) : [];
  if (files.length > 1) throw new UserError(`input/bgm/ に音声が ${files.length} 個あります（1曲だけにしてください）: ${files.join(", ")}`);
  const belowVoiceDb = loadSettings(paths).render.bgmBelowVoiceDb;
  const work = path.join(paths.intermediate, "render-audio");
  fs.mkdirSync(work, { recursive: true });
  let source = paths.cutFinal;
  let bgm: string | null = null;
  let gainDb = 0;
  if (files.length === 1) {
    const voice = path.join(work, "voice.wav");
    const mix = path.join(work, "mix.wav");
    await extractAudio(paths.cutFinal, voice, { sampleRate: 48000, channels: 2, overwrite: true });
    const r = await mixVoiceWithBgm(voice, path.join(dir, files[0]), mix, { durationSeconds: duration, belowVoiceDb, overwrite: true });
    fs.rmSync(voice, { force: true });
    source = mix;
    bgm = files[0];
    gainDb = Math.round(r.gainDb * 10) / 10;
  }
  // Raise toward the target and limit the peaks first (2026-11-23, an: a 21 dB crest kept the
  // linear loudness pass at -15.8 LUFS). The loudness pass after this needs only a small gain.
  const limited = path.join(work, "limited.wav");
  const l = await limitPeaksTowardLoudness(source, limited, { ...loudness, overwrite: true });
  if (source !== paths.cutFinal) fs.rmSync(source, { force: true });
  return { file: limited, bgm, gainDb, belowVoiceDb, limit: { gainDb: l.gainDb, limitDb: l.limitDb } };
}

/** Measured one-pass linear loudnorm to the target (the same filter for the final render and the check clips). */
export async function loudnormFilter(file: string, targetLufs: number, truePeakDb: number) {
  const before = await measureLoudness(file, { targetLufs, truePeakDb, loudnessRange: 11 });
  const lra = Math.min(50, Math.max(11, Math.ceil(before.loudnessRangeLu + 1)));
  const filter = `${loudnormApplyFilter(before, { targetLufs, truePeakDb, loudnessRange: lra, linear: true, printFormat: "summary" })},aresample=48000`;
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
      .map(({ c, d }) => ({ id: c.id, start: Math.max(0, c.start + d), end: Math.min(c.end + d, duration), lines: lines.get(c.id) ?? c.text.split("\n"), speaker: c.speaker }))
      .filter((c) => c.end > c.start),
  };
}

/** Cues per part when a long video is burned in parts (each part is one ffmpeg run with this many PNG inputs). */
const CUES_PER_PART = 40;

/** The last whole millisecond strictly below t (core passes -ss / -t to ffmpeg with 3 decimals). */
function msBelow(t: number): number {
  return (Math.ceil(t * 1000 - 1e-6) - 1) / 1000;
}

/**
 * The whole of cut.mp4 with the cues burned in → output. A short video is one burnRange. A long one
 * (more than CUES_PER_PART cues) is burned in parts — one ffmpeg run with hundreds of PNG inputs exceeds
 * Windows' command-line limit and memory (live-talk, 785 cues, 2026-11-10). Parts are cut at whole
 * seconds (whole frames at 30/60 fps) where no subtitle is on screen, written video-only (an audio stream
 * in each part shifts the joined video by the AAC priming, 21 ms), joined by stream copy, and the audio
 * (cut.mp4's or the BGM mix) is normalised once for the whole video by the shared engine's
 * encodeAacLoudnorm (re-encodes until the AAC true peak is under the ceiling).
 */
export async function burnWhole(
  paths: ProjectPaths,
  plan: BurnPlan,
  output: string,
  opts: { audioFilter?: string; audioInput?: string; timeoutMs?: number; log?: (s: string) => void; loudness: { targetLufs: number; truePeakDb: number } },
): Promise<{ parts: number }> {
  // A short video is one part but takes the same audio path (2026-11-24, ua: burning it with the
  // audio in one pass encoded the AAC once, and its true peak came out -0.8 dBTP over the -1 check;
  // encodeAacLoudnorm below re-encodes until the AAC is under the ceiling).
  const fadeOut = plan.preset.transition?.fadeOutSeconds ?? 0;
  const bounds: number[] = [0];
  let count = 0;
  for (let i = 0; i < plan.cues.length - 1; i++) {
    count++;
    if (count < CUES_PER_PART) continue;
    // A whole second inside the gap after cue i (after its fade-out, before the next cue).
    const s = Math.ceil(plan.cues[i].end + fadeOut + 0.001);
    if (s <= plan.cues[i + 1].start && s > bounds[bounds.length - 1] && s < plan.duration - 1) {
      bounds.push(s);
      count = 0;
    }
  }
  bounds.push(plan.duration);
  // Each part starts on a real frame of cut.mp4 (2026-11-23, an: the frames there sit up to 8 ms off the
  // 1/60 grid, so a part starting at a whole second re-timed its frames by 3.3 ms and lost one frame).
  const frames = await frameTimestamps(paths.cutFinal);
  // seeks[k]: what ffmpeg gets as -ss / -t. core passes them with 3 decimals, so it is the last whole
  // millisecond strictly before the part's first frame (2026-11-23, Windows talking-test-01: the frame at
  // 161.0066667 s became "-t 161.007", so the earlier part kept that frame too and it was there twice).
  // bounds[k] stays the exact frame time, for the part lengths when joining.
  const seeks = [...bounds];
  for (let k = 1; k < bounds.length - 1; k++) {
    const f = frames.find((t) => t >= bounds[k] - 1e-6);
    if (f !== undefined && f < bounds[k + 1]) {
      bounds[k] = f;
      seeks[k] = msBelow(f);
    }
  }
  const work = path.join(paths.intermediate, "render-parts");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    const parts: string[] = [];
    for (let k = 0; k < bounds.length - 1; k++) {
      const file = path.join(work, `part-${String(k + 1).padStart(3, "0")}.mp4`);
      opts.log?.(`  ${k + 1}/${bounds.length - 1}: ${bounds[k].toFixed(0)}–${bounds[k + 1].toFixed(0)}秒`);
      // -t is counted from the part's first frame (not from -ss), so the length too is the last whole
      // millisecond strictly under the frame-to-frame length (Windows talking-test-01: part 2 began 0.67 ms
      // after its -ss, and "-t 118.007" took the next part's first frame as well).
      const last = k === bounds.length - 2;
      const to = last ? plan.duration : seeks[k] + msBelow(bounds[k + 1] - bounds[k]);
      await burnRange(paths, plan, seeks[k], to, file, { timeoutMs: opts.timeoutMs, audio: false });
      parts.push(file);
    }
    // One part (a short video): it is the whole video already.
    const joined = parts.length === 1 ? parts[0] : path.join(work, "joined.mp4");
    if (parts.length > 1) {
      // Exact part lengths (from frame to frame): the demuxer's own per-file durations were ~0.7 ms short each (live-talk).
      await concatMedia(parts, joined, { overwrite: true, durations: bounds.slice(1).map((b, k) => b - bounds[k]) });
      for (const p of parts) fs.rmSync(p, { force: true });
    }
    const wav = path.join(work, "audio.wav");
    await extractAudio(opts.audioInput ?? paths.cutFinal, wav, { sampleRate: 48000, channels: 2, overwrite: true });
    const aac = path.join(work, "audio.m4a");
    const { targetLufs, truePeakDb } = opts.loudness;
    let r = await encodeAacLoudnorm(wav, aac, { targetLufs, truePeakCeiling: truePeakDb, overwrite: true });
    opts.log?.(`  音声: ${r.result.integratedLufs} LUFS／true peak ${r.result.truePeakDb} dBTP（${r.attempts} 回目で上限内）`);
    // Sharp transients (2026-11-24, ua: unboxing sounds) can rise ~1.7 dB in the AAC, and the encoder then
    // lowers the whole track to keep the peak (-15.3 LUFS). Limit those short peaks harder instead, so the
    // voice stays at the target: the limiter goes down by the shortfall each time.
    let marginDb = 1;
    for (let i = 0; i < 3 && r.result.integratedLufs < targetLufs - 0.5; i++) {
      marginDb = Number((marginDb + (targetLufs - r.result.integratedLufs) + 0.3).toFixed(2));
      const limited = path.join(work, `audio-limited-${i + 1}.wav`);
      await limitPeaksTowardLoudness(wav, limited, { targetLufs, truePeakDb, marginDb, overwrite: true });
      r = await encodeAacLoudnorm(limited, aac, { targetLufs, truePeakCeiling: truePeakDb, overwrite: true });
      opts.log?.(`  音声（ピークを ${(truePeakDb - marginDb).toFixed(1)}dB で抑え直し）: ${r.result.integratedLufs} LUFS／true peak ${r.result.truePeakDb} dBTP（${r.attempts} 回目で上限内）`);
    }
    // -t to the video's length (-shortest ended the copied AAC 49 ms early on live-talk).
    await muxVideoAudio(joined, aac, output, { overwrite: true, durationSeconds: plan.duration, timeoutMs: opts.timeoutMs });
    return { parts: parts.length };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
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
  opts: { audioFilter?: string; timeoutMs?: number; /** Audio file to use instead of cut.mp4's (same timeline, e.g. the BGM mix). */ audioInput?: string; /** false = video only. */ audio?: boolean } = {},
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
      await renderStillPng(serveUrl, "SubtitleOverlay", { text: c.lines.join("\n"), preset: presetForSpeaker(plan.preset, c.speaker), width: plan.width, height: plan.height }, png);
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
    // core runs ffmpeg: cut.mp4 [from, to) (frame times kept), the PNGs (looped at 60 fps for the fades),
    // the graph (from a file), H.264 CRF 18 + AAC 192k 48 kHz, faststart.
    await burnOverlayGraph(paths.cutFinal, pngInputs, output, {
      overwrite: true,
      graph: outLabel ? { filterGraph: chain.join(";\n"), outLabel } : null,
      // One decoder thread per PNG: with ~180 subtitles ffmpeg's default (a thread pool per input)
      // passes macOS's 2048 threads per process (EAGAIN "Resource temporarily unavailable", talk-002).
      pngInputArgs: [...(fade > 0 ? ["-loop", "1", "-framerate", "60"] : []), "-threads", "1"],
      filterComplexThreads: 1,
      audioInput: opts.audioInput,
      audio: opts.audio,
      from,
      duration: to < plan.duration ? to - from : undefined,
      audioFilter: opts.audioFilter,
      timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000,
    });
    return inRange;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
