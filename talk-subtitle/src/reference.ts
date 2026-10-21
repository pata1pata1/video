// reference projects: a horizontal video the user edited in another editor, kept to learn
// their editing style (docs/design.md §15). input/reference/ holds
//   source.<ext>     the original recording
//   final.<ext>      the user's finished video
//   subtitles.srt    optional (registered only; subtitle learning is S3)
// All three are only read. Analysis output goes to audio/ and intermediate/ as
// for production projects (the source side uses the same file names, so the
// existing transcribe step and the S1 observer work unchanged).

import fs from "node:fs";
import path from "node:path";
import { assertLandscape, probeSource, type ProbeJson } from "./analyze.ts";
import { UserError } from "./cli.ts";
import { loadSettings } from "./config.ts";
import { extractAudio } from "./engine.ts";
import { assertWritable, saveProjectJson, sha256File, VIDEO_EXTENSIONS, writeJsonAtomic, type Project, type SourceRecord } from "./project.ts";
import { runTranscribe } from "./steps.ts";
import { planTranscription, transcribeWav } from "./stt.ts";
import type { TranscriptFile } from "./transcript.ts";

type Log = (s: string) => void;

export function assertReference(project: Project): void {
  if (project.json.kind !== "reference") {
    throw new UserError(`案件 ${project.json.id} は reference ではありません（npm run new -- --id=… --kind=reference で作った案件だけが対象です）。`);
  }
}

function findOne(dir: string, base: string, exts: string[], required: boolean): string | null {
  const hits = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => path.parse(f).name.toLowerCase() === base && exts.includes(path.extname(f).toLowerCase()) && fs.statSync(path.join(dir, f)).isFile())
    : [];
  if (hits.length > 1) throw new UserError(`${dir} に ${base}.* が複数あります（${hits.join("、")}）。1つにしてください。`);
  if (!hits.length && required) throw new UserError(`${dir} に ${base}.<動画の拡張子> がありません（${exts.join(" ")}）。`);
  return hits[0] ?? null;
}

async function record(project: Project, name: string, prev: SourceRecord | undefined | null, replace: boolean, log: Log): Promise<{ rec: SourceRecord; changed: boolean }> {
  const file = path.join(project.paths.referenceDir, name);
  const rel = `input/reference/${name}`;
  const st = fs.statSync(file);
  // Same file, same size and mtime: reuse the recorded hash (a full re-hash is done with --verify).
  if (prev && prev.file === rel && prev.sizeBytes === st.size && Math.round(prev.mtimeMs) === Math.round(st.mtimeMs)) return { rec: prev, changed: false };
  log(`ハッシュを計算中（読み取りのみ）: ${rel}`);
  const sha256 = await sha256File(file);
  if (prev && (prev.file !== rel || prev.sha256 !== sha256) && !replace) {
    throw new UserError(`登録済みの ${prev.file} と違うファイルです。差し替える場合は --replace を付けてください（解析・文字起こし・復元は作り直しになります）。`);
  }
  const changed = !prev || prev.sha256 !== sha256;
  return { rec: { file: rel, sizeBytes: st.size, mtimeMs: st.mtimeMs, sha256, registeredAt: changed ? new Date().toISOString() : prev!.registeredAt }, changed };
}

/** Registers source / final / srt in project.json (sha256). */
export async function registerReference(project: Project, options: { replace?: boolean; log?: Log } = {}) {
  assertReference(project);
  assertWritable(project);
  const log = options.log ?? (() => {});
  const dir = project.paths.referenceDir;
  const sourceName = findOne(dir, "source", VIDEO_EXTENSIONS, true)!;
  const finalName = findOne(dir, "final", VIDEO_EXTENSIONS, true)!;
  const srtName = findOne(dir, "subtitles", [".srt"], false);
  // Horizontal only: both videos are checked before anything is recorded.
  assertLandscape(await probeSource(path.join(dir, sourceName), ""), `元動画（input/reference/${sourceName}）`);
  assertLandscape(await probeSource(path.join(dir, finalName), ""), `完成動画（input/reference/${finalName}）`);
  const prev = project.json.reference;
  const source = await record(project, sourceName, prev?.source, !!options.replace, log);
  const final = await record(project, finalName, prev?.final, !!options.replace, log);
  const srt = srtName ? await record(project, srtName, prev?.srt, !!options.replace, log) : null;
  project.json.reference = { source: source.rec, final: final.rec, srt: srt?.rec ?? null };
  project.json.source = source.rec;
  saveProjectJson(project);
  return { sourceChanged: source.changed, finalChanged: final.changed, srt: !!srt };
}

/** ffprobe + 16 kHz mono WAV for both videos. */
export async function analyzeReference(project: Project, options: { replace?: boolean; force?: boolean; log?: Log } = {}): Promise<{ source: ProbeJson; final: ProbeJson }> {
  const log = options.log ?? (() => {});
  const { paths } = project;
  const reg = await registerReference(project, { replace: options.replace, log });
  const ref = project.json.reference!;
  const sourceFile = path.join(paths.root, ref.source.file);
  const finalFile = path.join(paths.root, ref.final.file);
  log("ffprobe で解析中…");
  const source = await probeSource(sourceFile, ref.source.sha256);
  const final = await probeSource(finalFile, ref.final.sha256);
  if (!source.audio || !final.audio) throw new UserError("元動画と完成動画の両方に音声が必要です（音声で対応を取ります）。");
  assertLandscape(source, "元動画");
  assertLandscape(final, "完成動画");
  writeJsonAtomic(paths.probe, source);
  writeJsonAtomic(paths.finalProbe, final);
  if (reg.sourceChanged || options.force || !fs.existsSync(paths.audioWav)) {
    log("元動画の音声を抽出中（16kHz モノラル）…");
    await extractAudio(sourceFile, paths.audioWav, { sampleRate: 16000, channels: 1, overwrite: true });
  }
  if (reg.finalChanged || options.force || !fs.existsSync(paths.finalWav)) {
    log("完成動画の音声を抽出中（16kHz モノラル）…");
    await extractAudio(finalFile, paths.finalWav, { sampleRate: 16000, channels: 1, overwrite: true });
  }
  return { source, final };
}

/** Transcribes both (an existing transcript is kept unless force). */
export async function transcribeReference(project: Project, options: { force?: boolean; backend?: string; log?: Log } = {}) {
  assertReference(project);
  const log = options.log ?? (() => {});
  const { paths } = project;
  if (!fs.existsSync(paths.audioWav) || !fs.existsSync(paths.finalWav)) throw new UserError(`解析がまだです（npm run reference -- analyze --project=${project.json.id}）。`);
  if (options.force || !fs.existsSync(paths.transcript)) {
    log("— 元動画 —");
    await runTranscribe(project, { force: options.force, backend: options.backend, log });
  } else log("元動画の文字起こしはあります（やり直すなら --force）");
  if (options.force || !fs.existsSync(paths.finalTranscript)) {
    log("— 完成動画 —");
    const settings = loadSettings(paths);
    const plan = planTranscription(settings.transcribe, "", { backend: options.backend });
    if (plan.problems.length) throw new UserError(plan.problems.join("\n"));
    let last = -1;
    const t = await transcribeWav(paths.finalWav, plan, settings.transcribe, (r) => {
      const pct = Math.floor(r * 10) * 10;
      if (pct > last) log(`  進捗 ${(last = pct)}%`);
    });
    const ref = project.json.reference!;
    const out: TranscriptFile = { ...t, talkSubtitle: { sourceFile: ref.final.file, sourceSha256: ref.final.sha256, prompt: "", glossaryFingerprint: "" } };
    writeJsonAtomic(paths.finalTranscript, out);
  } else log("完成動画の文字起こしはあります（やり直すなら --force）");
}
