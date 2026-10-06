// Encodes the video from a silent Remotion image sequence plus the
// generated narration, with ffmpeg-static only.
//
// Why not `remotion render` straight to MP4: on this PC Windows Smart App
// Control blocks the DLLs of Remotion's bundled compositor (ffmpeg/ffprobe),
// so Remotion renders frames only (--sequence --muted, withAudio=false) and
// this script does the encoding that the compositor would have done.
//
//   1. npx remotion render src/index.ts JapanTrivia frames --sequence --muted
//        --props=props-silent.json --image-format=jpeg --jpeg-quality=95
//   2. node scripts/encode-mp4.mjs [--script=japan-trivia] frames out/japan-trivia.mp4
//
// Video: libx264 CRF 18 preset slow, full-range JPEG -> limited-range BT.709,
// yuv420p, BT.709 tags. Audio: narration.wav (the video's only sound),
// two-pass loudnorm toward -16 LUFS, 48 kHz, AAC 192k stereo; the true peak
// is measured on the encoded AAC and kept at or below -1.5 dBTP.
// +faststart so playback can start before the whole file arrives.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { loadVideo } from "./lib/video.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");


const args = process.argv.slice(2);
const scriptId = args.find((a) => a.startsWith("--script="))?.split("=")[1];
const audioOnly = args.includes("--audio-only");
const positional = args.filter((a) => !a.startsWith("--"));
const [framesDir, outArg] = audioOnly ? [null, positional[0]] : positional;
if (!scriptId || !outArg || (!audioOnly && !framesDir)) {
  console.error(
    "Usage: node scripts/encode-mp4.mjs --script=<id> <frames-dir> <out.mp4>\n" +
      "       node scripts/encode-mp4.mjs --script=<id> --audio-only <out.m4a>   (soundtrack only, to listen to the BGM mix)",
  );
  process.exit(1);
}
// loudness targets, x264 settings and the BGM come from the pattern (render.json, bgm.json)
const { bgm: BGM, render } = loadVideo(scriptId);
const FPS = 30;
const TARGET_I = render.loudness.integratedLufs;
const TRUE_PEAK_CEILING = render.loudness.truePeakCeiling;
const LRA = render.loudness.lra;
const audioDir = path.join(ROOT, "public", "audio", scriptId);
const NARRATION = path.join(audioDir, "narration.wav");
const NARRATION_JSON = path.join(audioDir, "narration.json");
const out = path.resolve(outArg);

async function main() {
  if (audioOnly) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const result = await encodeAudio(out);
    console.log(`wrote ${path.relative(ROOT, out)} (${result.lufs} LUFS, true peak ${result.peak} dBTP)`);
    return;
  }
  const frames = fs.readdirSync(framesDir).filter((f) => /^element-\d+\.jpe?g$/.test(f)).sort();
  if (frames.length === 0) throw new Error(`No element-N.jpeg frames in ${framesDir}`);
  const digits = frames[0].match(/\d+/)[0].length;
  const ext = path.extname(frames[0]);
  const expected = Math.ceil(JSON.parse(fs.readFileSync(NARRATION_JSON, "utf8")).durationSeconds * FPS);
  if (frames.length !== expected) throw new Error(`${frames.length} frames, expected ${expected} (narration length).`);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmpVideo = `${out}.video.mp4`;
  const tmpAudio = `${out}.audio.m4a`;
  const tmp = `${out}.tmp.mp4`;

  // Video once.
  await run(ffmpegPath, [
    "-v", "error", "-y",
    "-framerate", String(FPS), "-start_number", String(Number(frames[0].match(/\d+/)[0])),
    "-i", path.join(framesDir, `element-%0${digits}d${ext}`),
    "-vf", "scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
    "-c:v", render.video.codec, "-preset", render.video.preset, "-crf", String(render.video.crf), "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-frames:v", String(frames.length), "-an",
    tmpVideo,
  ], { maxBuffer: 64 * 1024 * 1024 });

  const result = await encodeAudio(tmpAudio);

  await run(ffmpegPath, [
    "-v", "error", "-y", "-i", tmpVideo, "-i", tmpAudio,
    "-map", "0:v", "-map", "1:a", "-c", "copy", "-shortest", "-movflags", "+faststart",
    tmp,
  ]);
  fs.renameSync(tmp, out);
  fs.rmSync(tmpVideo, { force: true });
  fs.rmSync(tmpAudio, { force: true });
  console.log(`wrote ${path.relative(ROOT, out)} (${result.lufs} LUFS, true peak ${result.peak} dBTP)`);
}

/**
 * The soundtrack to normalize: narration.wav alone, or — when the script has
 * "bgm" — narration plus the BGM, mixed once to a 48 kHz float WAV:
 *   - BGM level set from measured loudness: belowVoiceDb under the narration
 *   - looped with 2 s crossfades to the video length, 1.5 s fade-in, 4 s fade-out
 *   - ducked a little more while someone is speaking (sidechain compressor)
 */
async function buildSoundtrack() {
  if (!BGM) return NARRATION;
  const bgmPath = path.join(ROOT, BGM.file);
  if (!fs.existsSync(bgmPath)) throw new Error(`BGM not found: ${BGM.file}`);
  const duration = JSON.parse(fs.readFileSync(NARRATION_JSON, "utf8")).durationSeconds;
  const voiceI = (await measureLoudnorm(NARRATION, TARGET_I, TRUE_PEAK_CEILING)).input_i;
  const bgmI = (await measureLoudnorm(bgmPath, TARGET_I, TRUE_PEAK_CEILING)).input_i;
  const gain = Number(voiceI) - (BGM.belowVoiceDb) - Number(bgmI);
  const bgmLen = Number((await probeDuration(bgmPath)).toFixed(3));
  const XFADE = 2;
  const copies = Math.max(1, Math.ceil((duration - XFADE) / (bgmLen - XFADE)));
  const labels = Array.from({ length: copies }, (_, i) => `[b${i}]`);
  let chain = labels[0];
  const joins = [];
  for (let i = 1; i < copies; i++) {
    joins.push(`${chain}${labels[i]}acrossfade=d=${XFADE}:c1=tri:c2=tri[j${i}]`);
    chain = `[j${i}]`;
  }
  const graph = [
    `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[voice][key]`,
    `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${gain.toFixed(2)}dB,asplit=${copies}${labels.join("")}`.replace(",asplit=1[b0]", "[b0]"),
    ...joins,
    `${chain}atrim=0:${duration},afade=t=in:d=1.5,afade=t=out:st=${(duration - 4).toFixed(3)}:d=4[bed]`,
    `[bed][key]sidechaincompress=threshold=0.03:ratio=3:attack=30:release=500[ducked]`,
    `[voice][ducked]amix=inputs=2:normalize=0:duration=first[mix]`,
  ].join(";");
  const mixPath = path.join(ROOT, ".cache", `${scriptId}-soundtrack.wav`);
  fs.mkdirSync(path.dirname(mixPath), { recursive: true });
  await run(ffmpegPath, ["-v", "error", "-y", "-i", NARRATION, "-i", bgmPath, "-filter_complex", graph, "-map", "[mix]", "-c:a", "pcm_f32le", mixPath], {
    maxBuffer: 16 * 1024 * 1024,
  });
  console.log(`BGM: ${BGM.file} (${bgmI} LUFS) at ${gain.toFixed(1)} dB, ${copies}x looped; narration ${voiceI} LUFS`);
  return mixPath;
}

async function probeDuration(file) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-i", file], { maxBuffer: 16 * 1024 * 1024 }).catch((e) => e);
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`cannot read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * 2-pass loudnorm of the soundtrack to AAC, then measure the AAC itself. AAC
 * can push the true peak above loudnorm's ceiling, so if the encoded peak is
 * over TRUE_PEAK_CEILING the TP target is lowered by the overshoot and the
 * audio is encoded again (the peak limit wins over -16 LUFS).
 */
async function encodeAudio(tmpAudio) {
  const SOURCE = await buildSoundtrack();
  const m = await measureLoudnorm(SOURCE, TARGET_I, TRUE_PEAK_CEILING);
  console.log(`soundtrack: ${m.input_i} LUFS, ${m.input_tp} dBTP, LRA ${m.input_lra}`);
  let tp = TRUE_PEAK_CEILING;
  let result;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
    await run(ffmpegPath, [
      "-v", "error", "-y", "-i", SOURCE,
      "-af", `loudnorm=I=${TARGET_I}:TP=${tp}:LRA=${LRA}:${measured},aresample=48000`,
      "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000",
      tmpAudio,
    ]);
    result = await measureAac(tmpAudio);
    console.log(`AAC (TP target ${tp}): ${result.lufs} LUFS, true peak ${result.peak} dBTP`);
    // ebur128 prints 0.1 dB steps, so a reading of -1.5 may be up to -1.45:
    // require one step of margin to be sure the real peak is <= the ceiling.
    if (result.peak <= TRUE_PEAK_CEILING - 0.1) break;
    if (attempt === 6) throw new Error(`True peak still ${result.peak} dBTP after ${attempt} attempts.`);
    tp = Number((tp - (result.peak - TRUE_PEAK_CEILING) - 0.2).toFixed(2));
  }
  return result;
}

async function measureLoudnorm(file, i, tp) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-nostats", "-i", file, "-af", `loudnorm=I=${i}:TP=${tp}:LRA=${LRA}:print_format=json`, "-f", "null", "-"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1));
}

/** Integrated loudness and true peak of an encoded file (ebur128, decoded as played). */
async function measureAac(file) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  return {
    lufs: Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)[1]),
    peak: Number(summary.match(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/)[1]),
  };
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
