// Phase 2: apply the approved cuts (input/decisions.json) to the source video.
//
//   preview → intermediate/cut-preview.mp4  (light: short side 540 px, CRF 28)
//   final   → intermediate/cut.mp4          (full resolution, CRF 18; only after the preview was checked)
//   both    → intermediate/timemap.json     (source time ↔ edited time)
//
// How the cut is made (one ffmpeg pass, no per-segment files):
//   - Cut boundaries are snapped to real video frame timestamps (ffprobe packet
//     list). The source is slightly variable frame rate, so nothing assumes a
//     fixed fps.
//   - Video: `select` keeps the frames inside the kept segments and `setpts`
//     shifts each frame by the total length removed before it.
//   - Audio: the source audio is decoded once to 48 kHz PCM, the same kept
//     segments are copied sample-exactly in Node, with an 8 ms fade at every
//     joint (no clicks); then it is muxed with the video. Video and audio use
//     the very same segment table, so sync cannot drift across joints.
//   - Rotation: ffmpeg's autorotate turns the decoded frames upright (180° here),
//     and the output carries no rotation metadata — checked after encoding.
//
// Safety: the source is only read; sha256 is re-checked before anything runs;
// decisions must match the current candidates and have no pending item; the
// output is written to a temp file and only kept if every check passes.

import fs from "node:fs";
import path from "node:path";
import { probeSource, type ProbeJson } from "./analyze.ts";
import type { CutCandidatesJson } from "./candidates.ts";
import { UserError } from "./cli.ts";
import { loadDecisions, unionSeconds, type DecisionsJson } from "./decisions.ts";
import { probeMedia, runTool } from "./engine.ts";
import { assertWritable, fingerprint, readJson, sha256File, sourcePath, writeJsonAtomic, writeTextAtomic, type Project } from "./project.ts";

export type CutQuality = "preview" | "final";

export type KeepSegment = {
  index: number;
  /** Source time (s): first kept frame's timestamp. */
  srcStart: number;
  /** Source time (s): timestamp of the first frame after the segment (or end of video). */
  srcEnd: number;
  outStart: number;
  outEnd: number;
  frames: number;
};

export type Timemap = {
  version: 1;
  createdAt: string;
  source: { file: string; sha256: string; durationSeconds: number; frames: number };
  candidatesFingerprint: string;
  /** Hash of the approved cut decisions this map was built from. */
  decisionsFingerprint: string;
  /** Boundaries are real frame timestamps of the source (variable frame rate safe). */
  frameSnapped: true;
  outputDurationSeconds: number;
  outputFrames: number;
  /** Kept parts in order. Edited time t_out = srcStart + (t_out - outStart) inverse; see srcToOut / outToSrc. */
  segments: KeepSegment[];
  /** Removed parts of the source, with the approved candidate IDs that caused them. */
  removed: { srcStart: number; srcEnd: number; candidateIds: string[] }[];
};

/** Source time → edited time (null when the moment was cut). */
export function srcToOut(map: Timemap, t: number): number | null {
  const s = map.segments.find((x) => t >= x.srcStart && t < x.srcEnd);
  return s ? s.outStart + (t - s.srcStart) : null;
}

/** Edited time → source time. */
export function outToSrc(map: Timemap, t: number): number {
  const s = map.segments.find((x) => t >= x.outStart && t < x.outEnd) ?? map.segments[map.segments.length - 1];
  return s.srcStart + (t - s.outStart);
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const SR = 48000;
const FADE_SAMPLES = Math.round(0.008 * SR);

type Log = (s: string) => void;

export type CutPlan = {
  segments: KeepSegment[];
  removed: Timemap["removed"];
  predictedSeconds: number;
  plannedSeconds: number;
  maxSnapSeconds: number;
  frameTimes: number[];
  videoEnd: number;
  decisionsFingerprint: string;
};

export async function frameTimestamps(file: string): Promise<number[]> {
  const { stdout } = await runTool("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "packet=pts_time",
    "-of", "csv=p=0",
    file,
  ]);
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/,$/, ""))
    .filter((l) => l !== "" && l !== "N/A") // Number("") is 0: an empty line must not become a frame at t=0
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

/** Index of the frame whose timestamp is nearest to t. */
function nearestFrame(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t) ? lo - 1 : lo;
}

/** Approved cut ranges (adjusted range when given). Their fingerprint ties timemap.json to the decisions. */
export function approvedCuts(cuts: CutCandidatesJson, decisions: DecisionsJson): { id: string; start: number; end: number }[] {
  return cuts.items
    .filter((c) => decisions.cuts.items[c.id]?.decision === "cut")
    .map((c) => {
      const d = decisions.cuts.items[c.id];
      return { id: c.id, start: d.start ?? c.start, end: d.end ?? c.end };
    });
}

/** Checks the approvals and turns them into frame-snapped kept segments. */
export async function planCut(project: Project, log: Log): Promise<CutPlan> {
  const { paths } = project;
  const src = sourcePath(project);
  const cuts = readJson<CutCandidatesJson>(paths.cutCandidates);
  const decisions = loadDecisions(paths);

  // The candidate file must be the one the decisions were made against, and unmodified.
  if (fingerprint(cuts.items) !== cuts.fingerprint) throw new UserError("cut-candidates.json の内容が指紋と一致しません（手で編集された可能性）。停止しました。");
  if (decisions.cuts.candidatesFingerprint !== cuts.fingerprint) {
    throw new UserError("decisions.json の承認が今のカット候補に対応していません（候補が作り直された）。停止しました。");
  }
  if (cuts.inputs.sourceSha256 !== project.json.source!.sha256) throw new UserError("カット候補が今の元動画から作られていません。停止しました。");
  const pending = cuts.items.filter((c) => !decisions.cuts.items[c.id]);
  if (pending.length) throw new UserError(`未決定のカット候補が ${pending.length} 件あります（${pending.slice(0, 10).map((c) => c.id).join(", ")}…）。停止しました。`);

  const approved = approvedCuts(cuts, decisions);
  const decisionsFingerprint = fingerprint(approved);

  log("フレームの時刻を読み込み中…");
  const times = await frameTimestamps(src);
  if (times.length < 2) throw new UserError("映像のフレームを読めませんでした。");
  const lastDelta = times[times.length - 1] - times[times.length - 2];
  const videoEnd = times[times.length - 1] + lastDelta;

  // Union of approved ranges, clipped to the video.
  const sorted = approved
    .map((a) => ({ ...a, start: Math.max(0, a.start), end: Math.min(videoEnd, a.end) }))
    .filter((a) => a.end > a.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; ids: string[] }[] = [];
  for (const a of sorted) {
    const last = merged[merged.length - 1];
    if (last && a.start <= last.end) {
      last.end = Math.max(last.end, a.end);
      last.ids.push(a.id);
    } else merged.push({ start: a.start, end: a.end, ids: [a.id] });
  }
  const predictedSeconds = videoEnd - unionSeconds(merged);

  // Snap each removed range to frame boundaries: [frame a, frame b) is removed.
  let maxSnap = 0;
  const snapIdx = (t: number, edge: boolean) => {
    if (edge && t <= 0) return 0;
    if (edge && t >= videoEnd) return times.length;
    const i = nearestFrame(times, t);
    maxSnap = Math.max(maxSnap, Math.abs(times[i] - t));
    return i;
  };
  const removedIdx = merged
    .map((m) => ({ a: snapIdx(m.start, true), b: snapIdx(m.end, true), ids: m.ids }))
    .filter((m) => m.b > m.a);

  const segments: KeepSegment[] = [];
  const removed: Timemap["removed"] = [];
  const tAt = (i: number) => (i >= times.length ? videoEnd : times[i]);
  let cursor = 0;
  let out = 0;
  const pushKeep = (a: number, b: number) => {
    if (b <= a) return;
    const len = tAt(b) - tAt(a);
    segments.push({ index: segments.length, srcStart: r6(tAt(a)), srcEnd: r6(tAt(b)), outStart: r6(out), outEnd: r6(out + len), frames: b - a });
    out += len;
  };
  for (const m of removedIdx) {
    const a = Math.max(m.a, cursor);
    pushKeep(cursor, a);
    if (m.b > a) removed.push({ srcStart: r6(tAt(a)), srcEnd: r6(tAt(m.b)), candidateIds: m.ids });
    cursor = Math.max(cursor, m.b);
  }
  pushKeep(cursor, times.length);
  if (!segments.length) throw new UserError("すべての区間がカットされます。停止しました。");

  return {
    segments,
    removed,
    predictedSeconds,
    plannedSeconds: out,
    maxSnapSeconds: maxSnap,
    frameTimes: times,
    videoEnd,
    decisionsFingerprint,
  };
}

// ---------------------------------------------------------------- audio

type Pcm16 = { channels: number; sampleRate: number; data: Int16Array };

export function readWav16(file: string): Pcm16 {
  const buf = fs.readFileSync(file);
  let off = 12;
  let channels = 0;
  let sampleRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
    } else if (id === "data") {
      const bytes = Math.min(size, buf.length - off - 8);
      const data = new Int16Array(bytes >> 1);
      for (let i = 0; i < data.length; i++) data[i] = buf.readInt16LE(off + 8 + i * 2);
      return { channels, sampleRate, data };
    }
    off += 8 + size + (size & 1);
  }
  throw new UserError(`${file} に音声データがありません。`);
}

function writeWav16(file: string, pcm: Pcm16): void {
  const dataBytes = pcm.data.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(pcm.channels, 22);
  buf.writeUInt32LE(pcm.sampleRate, 24);
  buf.writeUInt32LE(pcm.sampleRate * pcm.channels * 2, 28);
  buf.writeUInt16LE(pcm.channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.data.buffer, pcm.data.byteOffset, dataBytes).copy(buf, 44);
  fs.writeFileSync(file, buf);
}

/**
 * Copies the kept segments sample-exactly. Output positions come from the
 * segment table (round(outStart·sr)), so rounding never accumulates.
 */
function cutAudio(src: Pcm16, segments: KeepSegment[]): Pcm16 {
  const ch = src.channels;
  const totalOut = Math.round(segments[segments.length - 1].outEnd * SR);
  const out = new Int16Array(totalOut * ch);
  const srcFrames = src.data.length / ch;
  for (const s of segments) {
    const o0 = Math.round(s.outStart * SR);
    const o1 = Math.round(s.outEnd * SR);
    const s0 = Math.round(s.srcStart * SR);
    const n = o1 - o0;
    const fadeIn = s.index > 0 ? Math.min(FADE_SAMPLES, n >> 1) : 0;
    const fadeOut = s.index < segments.length - 1 ? Math.min(FADE_SAMPLES, n >> 1) : 0;
    for (let i = 0; i < n; i++) {
      const si = s0 + i;
      if (si >= srcFrames) break;
      let g = 1;
      if (i < fadeIn) g = i / fadeIn;
      else if (i >= n - fadeOut) g = (n - 1 - i) / fadeOut;
      for (let c = 0; c < ch; c++) out[(o0 + i) * ch + c] = Math.round(src.data[si * ch + c] * g);
    }
  }
  return { channels: ch, sampleRate: SR, data: out };
}

// ---------------------------------------------------------------- video

export function filterScript(segments: KeepSegment[], quality: CutQuality, minFrameGap: number): string {
  // Tolerance well inside one frame. Boundaries are printed with 6 decimals while ffmpeg
  // compares exact rational times, so q must never be 0 (that let a removed frame in).
  if (!(minFrameGap > 0.004)) throw new Error(`フレーム間隔の最小値が不正です（${minFrameGap}）`);
  const q = Math.max(0.002, minFrameGap / 4).toFixed(6);
  const select = segments.map((s) => `gte(t,${s.srcStart}-${q})*lt(t,${s.srcEnd}-${q})`).join("+");
  // Removed time before segment k = srcStart_k - outStart_k; add the increments as step functions.
  let prevShift = 0;
  const steps: string[] = [];
  for (const s of segments) {
    const shift = r6(s.srcStart - s.outStart);
    if (shift - prevShift > 1e-9) steps.push(`gte(T,${s.srcStart}-${q})*${r6(shift - prevShift)}`);
    prevShift = shift;
  }
  const setpts = steps.length ? `PTS-(${steps.join("+")})/TB` : "PTS";
  const scale = quality === "preview" ? ",scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'" : "";
  return `[0:v]select='${select}',setpts='${setpts}'${scale},format=yuv420p[v]`;
}

// ---------------------------------------------------------------- checks

let frameSeq = 0;
/** One frame at t as 64×36 grayscale (via a temp file: runTool returns text only). */
export async function grayFrame(file: string, t: number, workDir: string): Promise<Float64Array> {
  const raw = path.join(workDir, `frame-${frameSeq++}.gray`);
  await runTool("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-ss", t.toFixed(4), "-i", file,
    "-frames:v", "1", "-vf", "scale=64:36,format=gray", "-f", "rawvideo", raw,
  ]);
  const bytes = fs.readFileSync(raw);
  fs.rmSync(raw, { force: true });
  return Float64Array.from(bytes.subarray(0, 64 * 36));
}

export function mad(a: Float64Array, b: Float64Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return n ? Math.round((s / n) * 100) / 100 : NaN;
}

/** Best lag (ms) between the edited audio and the source around a checkpoint. */
export function audioLagMs(src: Float32Array, out: Float32Array, srcT: number, outT: number, sr: number): { lagMs: number; corr: number } {
  const win = Math.round(1.0 * sr);
  const maxLag = Math.round(0.08 * sr);
  const o0 = Math.round(outT * sr);
  const s0 = Math.round(srcT * sr);
  let best = -Infinity;
  let bestLag = 0;
  let norm = 0;
  for (let i = 0; i < win; i++) norm += out[o0 + i] ** 2;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let dot = 0;
    let ns = 0;
    for (let i = 0; i < win; i++) {
      const v = src[s0 + lag + i] ?? 0;
      dot += out[o0 + i] * v;
      ns += v * v;
    }
    const c = dot / Math.sqrt(norm * ns || 1);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return { lagMs: Math.round((bestLag / sr) * 10000) / 10, corr: Math.round(best * 1000) / 1000 };
}

export function monoFloat(p: Pcm16): Float32Array {
  const n = p.data.length / p.channels;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < p.channels; c++) s += p.data[i * p.channels + c];
    out[i] = s / p.channels / 32768;
  }
  return out;
}

export type CutReport = {
  quality: CutQuality;
  output: string;
  createdAt: string;
  sourceSha256Verified: true;
  predictedSeconds: number;
  plannedSeconds: number;
  actual: { formatSeconds: number | null; videoSeconds: number; audioSeconds: number; frames: number };
  expectedFrames: number;
  maxSnapMs: number;
  rotation: { source: number; output: number; width: number; height: number; upright: boolean };
  audioChecks: { srcT: number; outT: number; lagMs: number; corr: number }[];
  videoChecks: { srcT: number; outT: number; mad: number; madNeighbours: number[] }[];
  problems: string[];
};

export async function runCut(
  project: Project,
  options: { quality: CutQuality; force?: boolean; dryRun?: boolean; log?: Log },
): Promise<{ plan: CutPlan; report: CutReport | null }> {
  const log = options.log ?? (() => {});
  const { paths } = project;
  if (!options.dryRun) assertWritable(project);
  const src = sourcePath(project);
  const probe = readJson<ProbeJson>(paths.probe);

  log("元動画の sha256 を再確認中（読み取りのみ）…");
  const sha = await sha256File(src);
  if (sha !== project.json.source!.sha256) {
    throw new UserError(`元動画の sha256 が登録時と違います（${sha.slice(0, 12)}… ≠ ${project.json.source!.sha256.slice(0, 12)}…）。停止しました。`);
  }

  const plan = await planCut(project, log);
  const outFile = options.quality === "preview" ? paths.cutPreview : paths.cutFinal;
  log(`残す区間 ${plan.segments.length} 個、削る区間 ${plan.removed.length} 個（境目のフレーム合わせ 最大 ${(plan.maxSnapSeconds * 1000).toFixed(1)}ms）`);
  log(`長さ: 元 ${plan.videoEnd.toFixed(3)}秒 → 予定 ${plan.plannedSeconds.toFixed(3)}秒（承認から計算した見込み ${plan.predictedSeconds.toFixed(3)}秒）`);
  if (Math.abs(plan.plannedSeconds - plan.predictedSeconds) > 0.5) {
    throw new UserError(`フレーム合わせ後の長さが見込みから ${(plan.plannedSeconds - plan.predictedSeconds).toFixed(3)}秒ずれます。停止しました。`);
  }
  if (options.dryRun) {
    log(`[dry-run] 出力予定: ${outFile}（何も書き込んでいません）`);
    return { plan, report: null };
  }
  if (fs.existsSync(outFile) && !options.force) throw new UserError(`${outFile} はすでにあります。作り直す場合は --force を付けてください。`);

  const work = path.join(paths.intermediate, ".work");
  fs.mkdirSync(work, { recursive: true });
  const srcWav = path.join(work, "source-48k.wav");
  const cutWav = path.join(work, "cut-audio.wav");
  const script = path.join(work, "cut-filter.txt");
  const tmpOut = path.join(paths.intermediate, `.${path.basename(outFile, ".mp4")}.tmp-${process.pid}.mp4`);
  try {
    log("音声を 48kHz PCM に展開中…");
    await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", src, "-map", "0:a:0", "-vn", "-ac", "2", "-ar", String(SR), "-c:a", "pcm_s16le", srcWav], { timeoutMs: 60 * 60 * 1000 });
    const srcPcm = readWav16(srcWav);
    log("音声をサンプル単位でつなぎ合わせ中（つなぎ目 8ms フェード）…");
    writeWav16(cutWav, cutAudio(srcPcm, plan.segments));

    const gaps = plan.frameTimes.slice(1).map((t, i) => t - plan.frameTimes[i]);
    writeTextAtomic(script, filterScript(plan.segments, options.quality, Math.min(...gaps)));
    const video =
      options.quality === "preview"
        ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28"]
        : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"];
    log(`映像を書き出し中（${options.quality === "preview" ? "軽量プレビュー" : "本番品質"}）…`);
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", src,
      "-i", cutWav,
      "-filter_complex_script", script,
      "-map", "[v]", "-map", "1:a:0",
      ...video,
      "-fps_mode", "passthrough",
      // Keep the source time base (1/600 for iPhone). The default 1/fps grid rounds
      // a variable-frame-rate source so that two frames can land on the same
      // timestamp, and the duplicate gets dropped.
      "-enc_time_base:v", "demux",
      "-c:a", "aac", "-b:a", options.quality === "preview" ? "128k" : "192k",
      "-movflags", "+faststart",
      tmpOut,
    ], { timeoutMs: 4 * 60 * 60 * 1000 });

    log("書き出し結果を確認中…");
    const report = await verify(project, plan, options.quality, tmpOut, outFile, probe, srcPcm, cutWav);
    if (report.problems.length) {
      const kept = outFile.replace(/\.mp4$/, ".failed.mp4");
      fs.renameSync(tmpOut, kept);
      writeJsonAtomic(kept.replace(/\.mp4$/, ".report.json"), report);
      throw new UserError(`確認で問題が見つかったため停止しました（調査用に ${path.basename(kept)} を残しました）:\n  ${report.problems.join("\n  ")}`);
    }
    fs.renameSync(tmpOut, outFile);
    writeJsonAtomic(outFile.replace(/\.mp4$/, ".report.json"), report);
    const timemap: Timemap = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: { file: project.json.source!.file, sha256: sha, durationSeconds: r6(plan.videoEnd), frames: plan.frameTimes.length },
      candidatesFingerprint: readJson<CutCandidatesJson>(paths.cutCandidates).fingerprint,
      decisionsFingerprint: plan.decisionsFingerprint,
      frameSnapped: true,
      outputDurationSeconds: r6(plan.plannedSeconds),
      outputFrames: plan.segments.reduce((n, s) => n + s.frames, 0),
      segments: plan.segments,
      removed: plan.removed,
    };
    writeJsonAtomic(paths.timemap, timemap);
    return { plan, report };
  } finally {
    fs.rmSync(tmpOut, { force: true });
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function verify(
  project: Project,
  plan: CutPlan,
  quality: CutQuality,
  file: string,
  finalName: string,
  probe: ProbeJson,
  srcPcm: Pcm16,
  cutWav: string,
): Promise<CutReport> {
  const problems: string[] = [];
  const info = await probeMedia(file);
  const outTimes = await frameTimestamps(file);
  const expectedFrames = plan.segments.reduce((n, s) => n + s.frames, 0);
  const lastGap = outTimes.length > 1 ? outTimes[outTimes.length - 1] - outTimes[outTimes.length - 2] : 0;
  const videoSeconds = outTimes.length ? outTimes[outTimes.length - 1] + lastGap : 0;
  const { stdout } = await runTool("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "csv=p=0", file]);
  const audioSeconds = Number(stdout.trim());

  const dupes = outTimes.filter((t, i) => i > 0 && t <= outTimes[i - 1] + 1e-6).length;
  if (dupes) problems.push(`同じ時刻のフレームが ${dupes} 組ある`);
  if (outTimes.length !== expectedFrames) problems.push(`フレーム数が予定と違う（出力 ${outTimes.length}／予定 ${expectedFrames}）`);
  if (Math.abs(videoSeconds - plan.plannedSeconds) > 0.05) problems.push(`映像の長さが予定と ${(videoSeconds - plan.plannedSeconds).toFixed(3)}秒ずれる`);
  if (Math.abs(audioSeconds - plan.plannedSeconds) > 0.05) problems.push(`音声の長さが予定と ${(audioSeconds - plan.plannedSeconds).toFixed(3)}秒ずれる`);

  // Orientation: frames must already be upright and carry no rotation flag.
  const outProbe = await probeSource(file, "-");
  const rotation = outProbe.video?.rotation ?? -1;
  const expectW = quality === "preview" ? null : probe.video!.width;
  const landscapeSame = outProbe.video && probe.video && (outProbe.video.width > outProbe.video.height) === (probe.video.width > probe.video.height);
  const upright = rotation === 0 && !!landscapeSame && (expectW === null || outProbe.video!.width === expectW);
  if (!upright) problems.push(`向きが正しくない可能性（出力の回転 ${rotation}°、${outProbe.video?.width}×${outProbe.video?.height}）`);

  // Checkpoints: the middle of up to 8 kept segments spread over the timeline (≥ 2 s long).
  const long = plan.segments.filter((s) => s.outEnd - s.outStart >= 2);
  const picks = Array.from(new Set(Array.from({ length: Math.min(8, long.length) }, (_, i) => long[Math.floor((i * (long.length - 1)) / Math.max(1, Math.min(8, long.length) - 1))])));

  // Audio: decode the encoded file's audio and correlate with the source around each checkpoint.
  const decoded = path.join(path.dirname(cutWav), "decoded.wav");
  await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", decoded]);
  const outMono = monoFloat(readWav16(decoded));
  const srcMono16k = monoFloat(readWav16(project.paths.audioWav));
  const audioChecks = picks.map((s) => {
    const outT = s.outStart + (s.outEnd - s.outStart) / 2 - 0.5;
    const srcT = s.srcStart + (outT - s.outStart);
    return { srcT: r6(srcT), outT: r6(outT), ...audioLagMs(srcMono16k, outMono, srcT, outT, 16000) };
  });
  for (const a of audioChecks) if (Math.abs(a.lagMs) > 10 || a.corr < 0.8) problems.push(`音声の位置がずれている可能性（出力 ${a.outT.toFixed(2)}秒: ずれ ${a.lagMs}ms、相関 ${a.corr}）`);
  void srcPcm;

  // Video: the edited frame at outT should match the source frame at srcT better than its neighbours.
  const src = sourcePath(project);
  const videoChecks: CutReport["videoChecks"] = [];
  for (const s of picks.slice(0, 5)) {
    const i = Math.floor(s.frames / 2);
    const fi = nearestFrame(plan.frameTimes, s.srcStart) + i;
    const srcT = plan.frameTimes[fi];
    const outT = s.outStart + (srcT - s.srcStart);
    const o = await grayFrame(file, outT + 0.002, path.dirname(cutWav));
    const here = mad(o, await grayFrame(src, srcT + 0.002, path.dirname(cutWav)));
    const neighbours = [];
    for (const d of [-6, 6]) neighbours.push(mad(o, await grayFrame(src, plan.frameTimes[fi + d] + 0.002, path.dirname(cutWav))));
    videoChecks.push({ srcT: r6(srcT), outT: r6(outT), mad: here, madNeighbours: neighbours });
  }

  return {
    quality,
    output: path.basename(finalName),
    createdAt: new Date().toISOString(),
    sourceSha256Verified: true,
    predictedSeconds: r6(plan.predictedSeconds),
    plannedSeconds: r6(plan.plannedSeconds),
    actual: { formatSeconds: info.durationSeconds, videoSeconds: r6(videoSeconds), audioSeconds, frames: outTimes.length },
    expectedFrames,
    maxSnapMs: Math.round(plan.maxSnapSeconds * 10000) / 10,
    rotation: { source: probe.video?.rotation ?? 0, output: rotation, width: outProbe.video?.width ?? 0, height: outProbe.video?.height ?? 0, upright },
    audioChecks,
    videoChecks,
    problems,
  };
}
