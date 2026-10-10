// Phase 3 final: intermediate/cut.mp4 + the approved subtitles (burned in, input/subtitle-style.json)
// + loudness normalised to -14 LUFS (true peak ≤ -1.5 dBTP) → output/final.mp4, then verified.
//   npm run render -- --project=<id> [--force]
// Written to output/final.partial.mp4 first and renamed only when every check passes.
// Report: output/final.report.json.

import fs from "node:fs";
import path from "node:path";
import { approvedBurnCues, burnRange } from "../src/burn.ts";
import { fmtTime, parseArgs, runCli, UserError } from "../src/cli.ts";
import { audioLagMs, frameTimestamps, grayFrame, monoFloat, outToSrc, readWav16, type Timemap } from "../src/cut.ts";
import { measureLoudness, probeMedia, runTool } from "../src/engine.ts";
import { assertSourceUnchanged, assertWritable, loadProject, sha256File, writeJsonAtomic } from "../src/project.ts";
import { checkCutInputs } from "../src/subtitles.ts";

const TARGET_LUFS = -14;
const TARGET_TP = -1.5;

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const { paths, json } = project;
  assertWritable(project);
  const final = path.join(paths.output, "final.mp4");
  const partial = path.join(paths.output, "final.partial.mp4");
  const reportFile = path.join(paths.output, "final.report.json");
  if (fs.existsSync(final) && !args.has("force")) throw new UserError(`${path.relative(paths.root, final)} は既にあります（作り直すなら --force）。`);

  // Inputs: source unchanged, cut.mp4 made from the current approvals, subtitles approved.
  const sourceFile = assertSourceUnchanged(project);
  const sourceSha256 = json.source!.sha256;
  if ((await sha256File(sourceFile)) !== sourceSha256) throw new UserError("元動画の sha256 が登録時と違います。");
  const { timemap, report: cutReport } = checkCutInputs(paths, sourceSha256);
  const plan = await approvedBurnCues(paths, json.id);
  console.log(`字幕 ${plan.cues.length} 件（1行 ${plan.cues.filter((c) => c.lines.length === 1).length}・2行 ${plan.cues.filter((c) => c.lines.length === 2).length}）、preset ${plan.preset.name}、${plan.width}×${plan.height}`);
  if (plan.cues.some((c) => c.lines.length > 2)) throw new UserError("3行以上の字幕があります。");

  // Loudness: measure, then one linear gain (loudnorm with the measured values).
  console.log("音量を測定中…");
  const before = await measureLoudness(paths.cutFinal, { targetLufs: TARGET_LUFS, truePeakDb: TARGET_TP, loudnessRange: 11 });
  const lra = Math.min(50, Math.max(11, Math.ceil(before.loudnessRangeLu + 1)));
  const audioFilter =
    `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${lra}` +
    `:measured_I=${before.integratedLufs}:measured_TP=${before.truePeakDb}:measured_LRA=${before.loudnessRangeLu}` +
    `:measured_thresh=${before.thresholdLufs}:offset=${before.targetOffsetLu}:linear=true:print_format=summary,aresample=48000`;
  console.log(`  cut.mp4: ${before.integratedLufs} LUFS、true peak ${before.truePeakDb} dBTP、LRA ${before.loudnessRangeLu} LU`);

  console.log("全編を書き出し中（字幕の画像を作ってから H.264 で書き出し。数分かかります）…");
  const t0 = Date.now();
  fs.rmSync(partial, { force: true });
  await burnRange(paths, plan, 0, plan.duration, partial, { audioFilter, timeoutMs: 3 * 60 * 60 * 1000 });
  console.log(`  書き出し ${((Date.now() - t0) / 1000).toFixed(0)}秒`);

  // ---- checks ----
  console.log("検証中…");
  const problems: string[] = [];
  const info = await probeMedia(partial);
  const { stdout: streamsOut } = await runTool("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,duration,sample_rate,channels,start_time:stream_side_data=rotation", "-of", "json", partial]);
  const streams = (JSON.parse(streamsOut) as { streams: Record<string, unknown>[] }).streams;
  const v = streams.find((s) => s.codec_type === "video")!;
  const a = streams.find((s) => s.codec_type === "audio");
  if (!a) problems.push("音声がない");
  const width = Number(v.width);
  const height = Number(v.height);
  if (width !== 1920 || height !== 1080) problems.push(`解像度が ${width}×${height}`);
  const rotation = Number((v.side_data_list as { rotation?: number }[] | undefined)?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  if (rotation !== 0) problems.push(`回転情報が付いている（${rotation}°）`);

  const times = await frameTimestamps(partial);
  const cutFrames = cutReport.actual.frames;
  if (times.length !== cutFrames) problems.push(`フレーム数が cut.mp4 と違う（${times.length}／${cutFrames}）`);
  // Every frame keeps its cut.mp4 time (no duplicated or shifted timestamps).
  const cutTimes = await frameTimestamps(paths.cutFinal);
  const maxFrameShiftMs = Math.round(Math.max(0, ...times.map((t, i) => Math.abs(t - (cutTimes[i] ?? Infinity)))) * 1e5) / 100;
  const dupTimes = times.filter((t, i) => i > 0 && t <= times[i - 1] + 1e-6).length;
  if (dupTimes) problems.push(`同じ時刻のフレームが ${dupTimes} 組ある`);
  if (!(maxFrameShiftMs <= 0.1)) problems.push(`フレームの時刻が cut.mp4 と最大 ${maxFrameShiftMs}ms 違う`);
  const lastGap = times.length > 1 ? times[times.length - 1] - times[times.length - 2] : 0;
  const videoSeconds = times.length ? times[times.length - 1] + lastGap : 0;
  const audioSeconds = Number(a?.duration ?? 0);
  if (Math.abs(videoSeconds - cutReport.actual.videoSeconds) > 0.02) problems.push(`映像の長さが cut.mp4 と ${(videoSeconds - cutReport.actual.videoSeconds).toFixed(3)}秒違う`);
  if (Math.abs(audioSeconds - cutReport.actual.audioSeconds) > 0.03) problems.push(`音声の長さが cut.mp4 と ${(audioSeconds - cutReport.actual.audioSeconds).toFixed(3)}秒違う`);
  const startDiff = Math.abs(Number(v.start_time ?? 0) - Number(a?.start_time ?? 0));
  if (startDiff > 0.005) problems.push(`映像と音声の開始時刻が ${(startDiff * 1000).toFixed(1)}ms 違う`);

  // Loudness of the result (ebur128, true peak).
  const { stderr: ebur } = await runTool("ffmpeg", ["-hide_banner", "-nostdin", "-i", partial, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { timeoutMs: 30 * 60 * 1000 });
  const summary = ebur.slice(ebur.lastIndexOf("Summary:"));
  const integrated = Number(summary.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s*(-?[\d.]+|-inf) dBFS/)?.[1]);
  const lraOut = Number(summary.match(/LRA:\s*(-?[\d.]+) LU/)?.[1]);
  if (!(Math.abs(integrated - TARGET_LUFS) <= 0.5)) problems.push(`ラウドネスが ${integrated} LUFS（目標 ${TARGET_LUFS}）`);
  if (!(truePeak <= -1.0)) problems.push(`true peak が ${truePeak} dBTP（-1.0 を超える）`);

  // Sync: final audio against the source audio through the timemap (end to end), and frames against cut.mp4.
  const work = fs.mkdtempSync(path.join(paths.intermediate, "render-verify-"));
  const audioChecks: { outT: number; srcT: number; lagMs: number; corr: number }[] = [];
  const videoChecks: { outT: number; mad: number; madNeighbours: number[] }[] = [];
  const subtitleChecks: { id: string; t: number; diff: number }[] = []; // diff: changed pixels in the subtitle band
  try {
    const decoded = path.join(work, "final-16k.wav");
    await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", partial, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", decoded]);
    const out = monoFloat(readWav16(decoded));
    const src = monoFloat(readWav16(paths.audioWav));
    const segs = (timemap as Timemap).segments.filter((s) => s.outEnd - s.outStart >= 2);
    const picks = Array.from(new Set(Array.from({ length: Math.min(10, segs.length) }, (_, i) => segs[Math.floor((i * (segs.length - 1)) / Math.max(1, Math.min(10, segs.length) - 1))])));
    for (const s of picks) {
      const outT = s.outStart + (s.outEnd - s.outStart) / 2 - 0.5;
      const srcT = outToSrc(timemap as Timemap, outT);
      const r = audioLagMs(src, out, srcT, outT, 16000);
      audioChecks.push({ outT: Math.round(outT * 1000) / 1000, srcT: Math.round(srcT * 1000) / 1000, ...r });
      if (Math.abs(r.lagMs) > 10 || r.corr < 0.8) problems.push(`音声の位置がずれている可能性（${fmtTime(outT)}: ${r.lagMs}ms、相関 ${r.corr}）`);
    }
    // Frames: the final frame should match cut.mp4 at the same time better than ±6 frames (upper part, above the subtitles).
    const top = (f: Float64Array) => f.subarray(0, 64 * 22);
    const madTop = (x: Float64Array, y: Float64Array) => {
      const p = top(x), q = top(y);
      let s = 0;
      for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]);
      return Math.round((s / p.length) * 100) / 100;
    };
    for (const s of picks.slice(0, 6)) {
      const k = times.findIndex((t) => t >= s.outStart + (s.outEnd - s.outStart) / 2);
      const t = times[k];
      const o = await grayFrame(partial, t + 0.002, work);
      const here = madTop(o, await grayFrame(paths.cutFinal, t + 0.002, work));
      const nb: number[] = [];
      for (const d of [-6, 6]) nb.push(madTop(o, await grayFrame(paths.cutFinal, times[k + d] + 0.002, work)));
      videoChecks.push({ outT: Math.round(t * 1000) / 1000, mad: here, madNeighbours: nb });
      if (!(here < Math.min(...nb)) && here > 0.5) problems.push(`映像の位置がずれている可能性（${fmtTime(t)}）`);
    }
    // Every subtitle is on screen: in the middle of each cue, the subtitle band (bottom 40% at
    // 480×108) has clearly changed pixels against cut.mp4 — even a one-character 「ね」 gives dozens.
    const band = async (file: string, t: number) => {
      const raw = path.join(work, "band.gray");
      await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-ss", t.toFixed(4), "-i", file, "-frames:v", "1",
        "-vf", "crop=iw:ih*0.4:0:ih*0.6,scale=480:108,format=gray", "-f", "rawvideo", raw]);
      return fs.readFileSync(raw);
    };
    for (const c of plan.cues) {
      const t = (c.start + c.end) / 2;
      const x = await band(partial, t);
      const y = await band(paths.cutFinal, t);
      let changed = 0;
      for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 48) changed++;
      subtitleChecks.push({ id: c.id, t: Math.round(t * 1000) / 1000, diff: changed });
    }
    const missing = subtitleChecks.filter((c) => c.diff < 20);
    if (missing.length) problems.push(`字幕が見えない可能性: ${missing.map((m) => m.id).join(", ")}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  // Integrity: decode every frame and sample; any error fails. (passthrough + the file's own time
  // base, so the null muxer does not round cut.mp4's uneven frame times to 1/60 s and complain.)
  const { stderr: decodeErr } = await runTool("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-i", partial, "-fps_mode", "passthrough", "-enc_time_base:v", "demux", "-f", "null", "-"], { timeoutMs: 60 * 60 * 1000, check: false });
  if (decodeErr.trim()) problems.push(`デコード時のエラー: ${decodeErr.trim().split("\n").slice(0, 3).join(" / ")}`);
  if ((await sha256File(sourceFile)) !== sourceSha256) problems.push("元動画の sha256 が変わった");

  const fpsOf = (r: unknown) => {
    const [n, d] = String(r).split("/").map(Number);
    return d ? n / d : NaN;
  };
  const report = {
    createdAt: new Date().toISOString(),
    output: "final.mp4",
    ok: problems.length === 0,
    problems,
    inputs: { cut: "intermediate/cut.mp4", cutFrames, subtitlesApproved: true, preset: plan.preset.name, sourceSha256 },
    file: { bytes: fs.statSync(partial).size, sha256: await sha256File(partial), formatSeconds: info.durationSeconds },
    video: { codec: v.codec_name, width, height, rotation, rFrameRate: v.r_frame_rate, avgFps: Math.round(fpsOf(v.avg_frame_rate) * 1000) / 1000, frames: times.length, seconds: Math.round(videoSeconds * 1e6) / 1e6 },
    audio: { codec: a?.codec_name, sampleRate: Number(a?.sample_rate), channels: Number(a?.channels), seconds: audioSeconds },
    loudness: {
      before: { integratedLufs: before.integratedLufs, truePeakDb: before.truePeakDb, lraLu: before.loudnessRangeLu },
      target: { integratedLufs: TARGET_LUFS, truePeakDb: TARGET_TP },
      after: { integratedLufs: integrated, truePeakDb: truePeak, lraLu: lraOut },
    },
    subtitles: { count: plan.cues.length, oneLine: plan.cues.filter((c) => c.lines.length === 1).length, twoLines: plan.cues.filter((c) => c.lines.length === 2).length, checks: subtitleChecks },
    sync: { startDiffMs: Math.round(startDiff * 10000) / 10, maxFrameShiftMs, duplicateFrameTimes: dupTimes, audioChecks, videoChecks },
  };
  writeJsonAtomic(reportFile, report);
  if (problems.length) {
    console.log(`！ 問題があるため final.mp4 にはしていません（${path.relative(paths.root, partial)} を残しています）:`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
    return;
  }
  fs.renameSync(partial, final);
  console.log(`→ ${path.relative(paths.root, final)}（${(report.file.bytes / 1e6).toFixed(1)} MB、${fmtTime(videoSeconds)}、${width}×${height}、${report.video.rFrameRate}）`);
  console.log(`  ラウドネス ${integrated} LUFS／true peak ${truePeak} dBTP／字幕 ${plan.cues.length} 件／音声のずれ 最大 ${Math.max(...audioChecks.map((c) => Math.abs(c.lagMs)))}ms`);
  console.log(`  検証結果: ${path.relative(paths.root, reportFile)}`);
});
