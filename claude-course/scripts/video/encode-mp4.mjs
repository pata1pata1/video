// Encodes a standalone video (free-trial / sales-intro) from a silent Remotion image sequence plus the
// generated narration, with ffmpeg-static only.
//
// Why not `remotion render` straight to MP4: on this PC Windows Smart App
// Control blocks the DLLs of Remotion's bundled compositor (ffmpeg/ffprobe),
// so Remotion renders frames only (--sequence --muted, withAudio=false) and
// this script does the encoding that the compositor would have done.
//
//   1. npx remotion render src/index.ts <FreeTrial|SalesIntro> <frames-dir> --sequence --muted
//        --props='{"withAudio":false}' --image-format=jpeg --jpeg-quality=95
//   2. node scripts/video/encode-mp4.mjs --lesson=<free-trial|sales-intro> <frames-dir> <out.mp4>
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
import { lessonPaths } from "../voicevox/lesson.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FPS = 30;
const TARGET_I = -16;
const TRUE_PEAK_CEILING = -1.5;
const LRA = 11;

const args = process.argv.slice(2);
const lessonArg = args.find((a) => a.startsWith("--lesson="));
const [framesDir, outArg] = args.filter((a) => !a.startsWith("--"));
if (!lessonArg || !framesDir || !outArg) {
  console.error("Usage: node scripts/video/encode-mp4.mjs --lesson=<free-trial|sales-intro> <frames-dir> <out.mp4>");
  process.exit(1);
}
const { audioDir } = lessonPaths(ROOT, lessonArg.slice("--lesson=".length));
const NARRATION = path.join(audioDir, "narration.wav");
const NARRATION_JSON = path.join(audioDir, "narration.json");
const out = path.resolve(outArg);

async function main() {
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
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-frames:v", String(frames.length), "-an",
    tmpVideo,
  ], { maxBuffer: 64 * 1024 * 1024 });

  // Audio: 2-pass loudnorm, then measure the AAC itself. AAC can push the
  // true peak above loudnorm's ceiling, so if the encoded peak is over
  // TRUE_PEAK_CEILING the TP target is lowered by the overshoot and the audio
  // is encoded again (the peak limit wins over -16 LUFS).
  const m = await measureLoudnorm(NARRATION, TARGET_I, TRUE_PEAK_CEILING);
  console.log(`narration: ${m.input_i} LUFS, ${m.input_tp} dBTP, LRA ${m.input_lra}`);
  let tp = TRUE_PEAK_CEILING;
  let result;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
    await run(ffmpegPath, [
      "-v", "error", "-y", "-i", NARRATION,
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
