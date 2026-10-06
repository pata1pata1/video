// Builds a lesson video's narration from lessons/lesson-XX/lesson.json
// (or lessons/free-trial/lesson.json for the free trial video) with
// the locally running VOICEVOX ENGINE (http://127.0.0.1:50021 only).
//
// Flow:
//   lesson.json (+ lessons/shared/pronunciation.json for readings)
//     -> per line: POST /audio_query -> POST /synthesis (24kHz mono 16bit)
//        (cached in .cache/voicevox/ by reading + speaker + settings + engine version)
//     -> join on one timeline: lead-in, line pauses, scene pauses,
//        silent scenes (durationSeconds), tail
//     -> measure loudness, apply one linear gain toward -16 LUFS (peak <= -1.5 dBTP)
//     -> ffmpeg-static: 48kHz / stereo / pcm_s16le
//   public/lessons/lesson-XX/audio/   (free trial: public/free-trial/audio/)
//     narration.wav   the whole video's audio track (starts at 0s)
//     narration.json  engine, speaker, settings, and every chapter/scene/line time
//     narration.srt   1 line = 1 cue (spoken wording)
//     captions.vtt    same cues/times, display wording (captions.json) and row breaks as the video
//
// All times come from the synthesized audio's actual sample counts.
//
// Usage:
//   node scripts/voicevox/build-narration.mjs --lesson=01 [--dry-run [--kana]] [--force]
//   node scripts/voicevox/build-narration.mjs --lesson=01 --line=l021   (preview one line)
//   node scripts/voicevox/build-narration.mjs --lesson=free-trial [...]  (free trial video, same options)
//
// --dry-run: validates the script, prints captions/readings, checks the engine.
//   Nothing is synthesized or written. With --kana it also asks the engine
//   (audio_query only) how each line will be read and estimates the length.
// --force:   allows overwriting existing outputs.
// --line:    synthesizes one line to .cache/voicevox/preview/<id>.wav to listen to
//            (free trial: .cache/voicevox/preview/free-trial/<id>.wav).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { ENGINE_URL, VOICE_SETTINGS, audioQuery, checkEngine, synthesize } from "./engine.mjs";
import { LESSON_KEY_HELP, lessonPaths, loadDictionary, loadLesson } from "./lesson.mjs";
import { displayCues, loadCaptionOverrides, toSrt, toVtt } from "./subtitles.mjs";
import { parseWav, sameFormat, wavHeader } from "./wav.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE_DIR = path.join(PROJECT_ROOT, ".cache", "voicevox");
const DICTIONARY = path.join(PROJECT_ROOT, "lessons", "shared", "pronunciation.json");

const OUTPUT_RATE = 48_000;
const LOUDNESS_TARGET_LUFS = -16;
const TRUE_PEAK_CEILING_DB = -1.5;
const OUTPUTS = ["narration.wav", "narration.json", "narration.srt", "captions.vtt"];

const USAGE =
  "Usage: node scripts/voicevox/build-narration.mjs --lesson=01|free-trial|sales-intro [--dry-run [--kana]] [--force] [--line=<id>]";

function parseArgs(argv) {
  const opts = { lesson: null, dryRun: false, kana: false, force: false, line: null };
  for (const arg of argv) {
    if (arg.startsWith("--lesson=")) opts.lesson = arg.slice("--lesson=".length);
    else if (arg.startsWith("--line=")) opts.line = arg.slice("--line=".length);
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--kana") opts.kana = true;
    else if (arg === "--force") opts.force = true;
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!opts.lesson) throw new Error(`${LESSON_KEY_HELP} is required.\n${USAGE}`);
  if (opts.kana && !opts.dryRun) throw new Error("--kana is only for --dry-run.");
  return opts;
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** Writes via a temp file + rename so a failed run never leaves a half file. */
function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/** Predicted length (s) of an audio_query result, the same way the engine lays it out. */
function queryLength(q) {
  let t = q.prePhonemeLength + q.postPhonemeLength;
  for (const phrase of q.accent_phrases) {
    for (const m of phrase.moras) t += (m.consonant_length ?? 0) + m.vowel_length;
    if (phrase.pause_mora) t += phrase.pause_mora.vowel_length;
  }
  return t / q.speedScale;
}

/** Synthesizes one line, reusing .cache/voicevox/<hash>.wav when present. */
async function synthesizeCached(reading, styleId, engineVersion) {
  const key = sha256(JSON.stringify({ engineVersion, styleId, settings: VOICE_SETTINGS, reading }));
  const wavFile = path.join(CACHE_DIR, `${key}.wav`);
  const metaFile = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(wavFile) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    return { wav: parseWav(fs.readFileSync(wavFile)), kana: meta.kana, cached: true };
  }
  const { bytes, wav, kana } = await synthesize(reading, styleId);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  writeAtomic(wavFile, bytes);
  writeAtomic(metaFile, JSON.stringify({ engineVersion, styleId, settings: VOICE_SETTINGS, reading, kana }, null, 2));
  return { wav, kana, cached: false };
}

/** Runs ffmpeg's loudnorm analysis and returns integrated LUFS / true peak. */
async function measureLoudness(file) {
  const { stderr } = await execFileAsync(ffmpegPath, [
    "-hide_banner", "-nostats", "-i", file,
    "-af", `loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=${TRUE_PEAK_CEILING_DB}:print_format=json`,
    "-f", "null", "-",
  ], { maxBuffer: 16 * 1024 * 1024 });
  const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
  const m = JSON.parse(json);
  return { integratedLufs: Number(m.input_i), truePeakDb: Number(m.input_tp) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const paths = lessonPaths(PROJECT_ROOT, opts.lesson);
  const dictionary = loadDictionary(DICTIONARY);
  const { lesson, raw, lines, errors, warnings } = loadLesson(PROJECT_ROOT, opts.lesson, dictionary);
  const styleId = lesson.voice?.speaker;
  const audioDir = paths.audioDir;
  const outputs = Object.fromEntries(OUTPUTS.map((f) => [f, path.join(audioDir, f)]));

  console.log(`Lesson:   ${opts.lesson} (${lesson.id}) ${lesson.title ?? ""}`);
  console.log(`Output:   ${path.relative(PROJECT_ROOT, audioDir)}`);
  console.log(`Speaker:  style ID ${styleId}`);
  console.log(`Settings: ${JSON.stringify(VOICE_SETTINGS)}`);
  console.log(`Timing:   ${JSON.stringify(lesson.timing)}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`ERROR ${e}`);
    throw new Error(`${errors.length} problem(s) in lesson.json. Nothing was synthesized.`);
  }

  if (opts.line) {
    const line = lines.find((l) => l.id === opts.line);
    if (!line) throw new Error(`Line "${opts.line}" not found.`);
    const info = await checkEngine(styleId);
    const { wav, kana } = await synthesizeCached(line.reading, styleId, info.version);
    const previewDir = path.join(CACHE_DIR, "preview", paths.previewSubdir);
    fs.mkdirSync(previewDir, { recursive: true });
    const file = path.join(previewDir, `${line.id}.wav`);
    fs.writeFileSync(file, Buffer.concat([wavHeader(wav.data.length, wav), wav.data]));
    console.log(`${line.id}  ${line.text}\n  読み: ${line.reading}\n  kana: ${kana}\n  ${(wav.frames / wav.sampleRate).toFixed(3)}s -> ${file}`);
    return;
  }

  console.log(`Lines (${lines.length}):`);
  let sceneId = null;
  for (const l of lines) {
    if (l.sceneId !== sceneId) console.log(`  [${(sceneId = l.sceneId)}]`);
    console.log(`    ${l.id} (${String(l.width).padStart(4)}) ${l.caption}`);
    if (l.reading !== l.text) console.log(`         読み: ${l.reading}`);
  }

  const existing = OUTPUTS.filter((f) => fs.existsSync(outputs[f]));

  if (opts.dryRun) {
    let info = null;
    try {
      info = await checkEngine(styleId);
      console.log(`Engine:   OK (VOICEVOX ENGINE ${info.version}) ${info.speakerName} ${info.styleName}`);
    } catch (err) {
      console.log(`Engine:   NOT READY — ${err.message}`);
    }
    if (opts.kana && info) {
      const t = lesson.timing;
      let speech = 0;
      console.log("Kana (engine's reading, audio_query only):");
      for (const l of lines) {
        const q = await audioQuery(l.reading, styleId);
        const len = queryLength(q);
        speech += len;
        console.log(`  ${l.id} ${len.toFixed(2)}s ${q.kana}`);
      }
      const scenes = lesson.chapters.flatMap((c) => c.scenes);
      const silent = scenes.reduce((s, sc) => s + (sc.lines.length ? 0 : sc.durationSeconds), 0);
      const pauses =
        t.leadInSeconds + t.tailOutSeconds + (scenes.length - 1) * t.scenePauseSeconds +
        scenes.reduce((s, sc) => s + Math.max(0, sc.lines.length - 1), 0) * t.linePauseSeconds;
      console.log(`Estimate: speech ${speech.toFixed(1)}s + silence ${(silent + pauses).toFixed(1)}s = ${(speech + silent + pauses).toFixed(1)}s`);
    }
    if (existing.length > 0) console.log(`Existing outputs (need --force): ${existing.join(", ")}`);
    console.log("Dry run: nothing synthesized or written.");
    return;
  }

  if (existing.length > 0 && !opts.force) {
    throw new Error(`Output already exists: ${existing.join(", ")}\nRe-run with --force to overwrite.`);
  }
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error("ffmpeg-static binary not found. Run `npm approve-scripts ffmpeg-static` and `npm rebuild ffmpeg-static`.");
  }

  const info = await checkEngine(styleId);
  console.log(`Engine:   VOICEVOX ENGINE ${info.version}, ${info.speakerName} ${info.styleName}`);

  const clips = new Map();
  let fresh = 0;
  for (const [i, l] of lines.entries()) {
    const clip = await synthesizeCached(l.reading, styleId, info.version);
    const first = clips.values().next().value;
    if (first && !sameFormat(first.wav, clip.wav)) throw new Error(`${l.id}: WAV format differs from the first line.`);
    clips.set(l.id, clip);
    if (!clip.cached) fresh++;
    process.stdout.write(`\r  synthesized ${i + 1}/${lines.length} (${fresh} new, ${i + 1 - fresh} cached)`);
  }
  process.stdout.write("\n");

  // Lay everything out at VOICEVOX's native rate with exact sample counts.
  const fmt = clips.values().next().value.wav;
  const rate = fmt.sampleRate;
  const frames = (sec) => Math.round(sec * rate);
  const t = lesson.timing;
  const chunks = [];
  let cursor = 0;
  const silence = (n) => {
    if (n > 0) chunks.push(Buffer.alloc(n * fmt.frameBytes));
    cursor += n;
  };
  const at = (f) => Number((f / rate).toFixed(3));

  const lineTimes = [];
  const sceneTimes = [];
  const chapterTimes = [];
  silence(frames(t.leadInSeconds));
  let firstScene = true;
  for (const chapter of lesson.chapters) {
    const chapterStart = firstScene ? cursor : cursor + frames(t.scenePauseSeconds);
    for (const scene of chapter.scenes) {
      if (!firstScene) silence(frames(t.scenePauseSeconds));
      firstScene = false;
      const sceneStart = cursor;
      if (scene.lines.length === 0) {
        silence(frames(scene.durationSeconds));
      } else {
        scene.lines.forEach((sl, i) => {
          if (i > 0) silence(frames(t.linePauseSeconds));
          const { wav, kana } = clips.get(sl.id);
          const l = lines.find((x) => x.id === sl.id);
          const start = cursor;
          chunks.push(wav.data.subarray(0, wav.frames * wav.frameBytes));
          cursor += wav.frames;
          lineTimes.push({
            id: l.id, chapterId: chapter.id, sceneId: scene.id,
            start: at(start), end: at(cursor),
            text: l.text, caption: l.caption, reading: l.reading, kana,
          });
        });
      }
      sceneTimes.push({ id: scene.id, chapterId: chapter.id, layout: scene.layout, start: at(sceneStart), end: at(cursor) });
    }
    chapterTimes.push({ id: chapter.id, number: chapter.number, title: chapter.title, start: at(chapterStart), end: at(cursor) });
  }
  silence(frames(t.tailOutSeconds));
  const totalFrames = cursor;
  const joined = Buffer.concat(chunks);

  fs.mkdirSync(audioDir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-narration-"));
  let loudness;
  try {
    const rawPath = path.join(tmpDir, "joined.wav");
    fs.writeFileSync(rawPath, Buffer.concat([wavHeader(joined.length, fmt), joined]));

    // Resample first (float, no gain) and measure that, so the true peak is
    // the one of the delivered 48kHz file, not of the 24kHz source.
    const resampled = path.join(tmpDir, "resampled.wav");
    await execFileAsync(ffmpegPath, [
      "-v", "error", "-y", "-i", rawPath,
      "-ar", String(OUTPUT_RATE), "-ac", "2", "-c:a", "pcm_f32le",
      resampled,
    ]);
    const measured = await measureLoudness(resampled);
    const gainDb = Number(
      Math.min(LOUDNESS_TARGET_LUFS - measured.integratedLufs, TRUE_PEAK_CEILING_DB - measured.truePeakDb).toFixed(2),
    );
    console.log(`Loudness: ${measured.integratedLufs} LUFS, peak ${measured.truePeakDb} dBTP -> gain ${gainDb} dB`);

    // A single linear gain: no compression, no timing change.
    const tmpWav = path.join(tmpDir, "narration.wav");
    await execFileAsync(ffmpegPath, [
      "-v", "error", "-y", "-i", resampled,
      "-af", `volume=${gainDb}dB`,
      "-c:a", "pcm_s16le",
      tmpWav,
    ]);
    const result = await measureLoudness(tmpWav);
    loudness = {
      measured,
      gainDb,
      result,
      targetLufs: LOUDNESS_TARGET_LUFS,
      truePeakCeilingDb: TRUE_PEAK_CEILING_DB,
    };
    console.log(`Result:   ${result.integratedLufs} LUFS, peak ${result.truePeakDb} dBTP`);
    const out = parseWav(fs.readFileSync(tmpWav));
    const expected = totalFrames / rate;
    const actual = out.frames / out.sampleRate;
    if (Math.abs(actual - expected) > 0.005) {
      throw new Error(`Converted WAV is ${actual.toFixed(4)}s, expected ${expected.toFixed(4)}s. Stopping.`);
    }
    fs.copyFileSync(tmpWav, `${outputs["narration.wav"]}.tmp`);
    fs.renameSync(`${outputs["narration.wav"]}.tmp`, outputs["narration.wav"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const durationSeconds = at(totalFrames);
  const meta = {
    generator: "scripts/voicevox/build-narration.mjs",
    generatedAt: new Date().toISOString(),
    lesson: opts.lesson,
    lessonId: lesson.id,
    sourceHash: sha256(raw + dictionary.raw),
    engine: { url: ENGINE_URL, version: info.version },
    speaker: { styleId, name: info.speakerName, style: info.styleName },
    credit: `VOICEVOX:${info.speakerName}`,
    settings: { ...VOICE_SETTINGS, ...t },
    loudness,
    source: { sampleRate: rate, channels: fmt.channels, bitsPerSample: fmt.bitsPerSample },
    output: { file: "narration.wav", sampleRate: OUTPUT_RATE, channels: 2, codec: "pcm_s16le" },
    durationSeconds,
    chapters: chapterTimes,
    scenes: sceneTimes,
    lines: lineTimes,
  };
  writeAtomic(outputs["narration.json"], JSON.stringify(meta, null, 2) + "\n");
  writeAtomic(outputs["narration.srt"], toSrt(lineTimes));
  const overrides = loadCaptionOverrides(paths.captionsFile);
  writeAtomic(outputs["captions.vtt"], toVtt(displayCues(lineTimes, overrides)));

  const mmss = `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toFixed(1).padStart(4, "0")}`;
  console.log(`Wrote ${OUTPUTS.join(", ")}`);
  console.log(`Duration: ${durationSeconds}s (${mmss}), ${sceneTimes.length} scenes, ${lineTimes.length} cues`);
  console.log(`Credit:   ${meta.credit}`);
}

main().catch((err) => {
  console.error("Narration build failed.");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
