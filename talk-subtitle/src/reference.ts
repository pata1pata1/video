// reference projects: a horizontal video the user edited in another editor, kept to learn
// their editing style (docs/design.md §15). input/reference/ holds
//   source/          the original recording (exactly one video)
//   final/           the user's finished video (exactly one) + optional one .srt
//   assets/          images, clips, music… used in the edit (any files, subfolders
//                    allowed; only listed with sha256 — not analyzed)
// or, the older flat layout, source.<ext> / final.<ext> / subtitles.srt.
// Everything there is only read. Analysis output goes to audio/ and intermediate/ as
// for production projects (the source side uses the same file names, so the
// existing transcribe step and the S1 observer work unchanged).

import fs from "node:fs";
import path from "node:path";
import { assertLandscape, probeSource, type ProbeJson } from "./analyze.ts";
import { UserError } from "./cli.ts";
import { loadSettings } from "./config.ts";
import { extractAudio } from "./engine.ts";
import { assertWritable, fingerprint, readJsonIfExists, saveProjectJson, sha256File, VIDEO_EXTENSIONS, writeJsonAtomic, type Project, type SourceRecord } from "./project.ts";
import { runTranscribe } from "./steps.ts";
import { planTranscription, transcribeWav } from "./stt.ts";
import type { TranscriptFile } from "./transcript.ts";

type Log = (s: string) => void;

export function assertReference(project: Project): void {
  if (project.json.kind !== "reference") {
    throw new UserError(`案件 ${project.json.id} は reference ではありません（npm run new -- --id=… --kind=reference で作った案件だけが対象です）。`);
  }
}

/** Files the OS or a sync tool drops into folders; never part of the material. */
const isJunk = (name: string) => name.startsWith(".") || /^(desktop\.ini|thumbs\.db)$/i.test(name);

function findOne(dir: string, base: string, exts: string[], required: boolean): string | null {
  const hits = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => path.parse(f).name.toLowerCase() === base && exts.includes(path.extname(f).toLowerCase()) && fs.statSync(path.join(dir, f)).isFile())
    : [];
  if (hits.length > 1) throw new UserError(`${dir} に ${base}.* が複数あります（${hits.join("、")}）。1つにしてください。`);
  if (!hits.length && required) throw new UserError(`${dir} に ${base}.<動画の拡張子> がありません（${exts.join(" ")}）。`);
  return hits[0] ?? null;
}

const filesIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !isJunk(f) && fs.statSync(path.join(dir, f)).isFile()) : []);

/**
 * The video in source/ or final/: exactly one, and nothing else but (final/ only) one .srt.
 * Returns paths relative to input/reference/.
 */
function folderVideo(dir: string, folder: "source" | "final"): { video: string; srt: string | null } {
  const files = filesIn(dir);
  const videos = files.filter((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
  const srts = files.filter((f) => path.extname(f).toLowerCase() === ".srt");
  const label = folder === "source" ? "元動画" : "完成動画";
  if (videos.length !== 1) {
    throw new UserError(`input/reference/${folder}/ には${label}を1本だけ置いてください（今は ${videos.length}本${videos.length ? `：${videos.join("、")}` : ""}。動画の拡張子 ${VIDEO_EXTENSIONS.join(" ")}）。`);
  }
  if (folder === "final" && srts.length > 1) throw new UserError(`input/reference/final/ の SRT は1つにしてください（${srts.join("、")}）。`);
  const other = files.filter((f) => f !== videos[0] && !(folder === "final" && f === srts[0]));
  if (other.length) throw new UserError(`input/reference/${folder}/ に${label}${folder === "final" ? "と SRT " : ""}以外のファイルがあります（${other.join("、")}）。素材は input/reference/assets/ に置いてください。`);
  return { video: `${folder}/${videos[0]}`, srt: folder === "final" && srts[0] ? `final/${srts[0]}` : null };
}

/** Where the source / final / srt are: the folder layout (standard) or the older flat files. Paths relative to input/reference/. */
function locateReference(project: Project): { source: string; final: string; srt: string | null; layout: "folders" | "flat" } {
  const p = project.paths;
  const flatSource = findOne(p.referenceDir, "source", VIDEO_EXTENSIONS, false);
  const flatFinal = findOne(p.referenceDir, "final", VIDEO_EXTENSIONS, false);
  const folderUsed = filesIn(p.referenceSourceDir).length > 0 || filesIn(p.referenceFinalDir).length > 0;
  if (folderUsed && (flatSource || flatFinal)) {
    throw new UserError("input/reference/ に、フォルダ（source/・final/）と直下のファイル（source.*・final.*）の両方があります。どちらか一方にしてください（標準はフォルダ）。");
  }
  if (!folderUsed && (flatSource || flatFinal)) {
    if (!flatSource || !flatFinal) throw new UserError(`input/reference/ に ${flatSource ? "final" : "source"}.<動画の拡張子> がありません。`);
    return { source: flatSource, final: flatFinal, srt: findOne(p.referenceDir, "subtitles", [".srt"], false), layout: "flat" };
  }
  const source = folderVideo(p.referenceSourceDir, "source");
  const final = folderVideo(p.referenceFinalDir, "final");
  return { source: source.video, final: final.video, srt: final.srt, layout: "folders" };
}

/** rel: path inside input/reference/ (forward slashes). */
async function record(project: Project, relInRef: string, prev: SourceRecord | undefined | null, replace: boolean, log: Log): Promise<{ rec: SourceRecord; changed: boolean }> {
  const file = path.join(project.paths.referenceDir, ...relInRef.split("/"));
  const rel = `input/reference/${relInRef}`;
  const st = fs.statSync(file);
  // Same file, same size and mtime: reuse the recorded hash.
  if (prev && prev.file === rel && prev.sizeBytes === st.size && Math.round(prev.mtimeMs) === Math.round(st.mtimeMs)) return { rec: prev, changed: false };
  log(`ハッシュを計算中（読み取りのみ）: ${rel}`);
  const sha256 = await sha256File(file);
  if (prev && (prev.file !== rel || prev.sha256 !== sha256) && !replace) {
    throw new UserError(`登録済みの ${prev.file} と違うファイルです。差し替える場合は --replace を付けてください（解析・文字起こし・復元は作り直しになります）。`);
  }
  const changed = !prev || prev.sha256 !== sha256;
  return { rec: { file: rel, sizeBytes: st.size, mtimeMs: st.mtimeMs, sha256, registeredAt: changed ? new Date().toISOString() : prev!.registeredAt }, changed };
}

export type AssetKind = "image" | "video" | "audio" | "subtitle" | "document" | "other";
export type AssetRecord = { file: string; kind: AssetKind; sizeBytes: number; mtimeMs: number; sha256: string };
export type ReferenceAssetsJson = { version: 1; updatedAt: string; root: "input/reference/assets"; count: number; totalBytes: number; items: AssetRecord[] };

const ASSET_KINDS: [AssetKind, string[]][] = [
  ["image", [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".svg", ".psd", ".ai"]],
  ["video", VIDEO_EXTENSIONS],
  ["audio", [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aif", ".aiff"]],
  ["subtitle", [".srt", ".vtt", ".ass"]],
  ["document", [".txt", ".md", ".pdf", ".docx", ".xlsx", ".csv", ".json"]],
];
const assetKind = (f: string): AssetKind => ASSET_KINDS.find(([, exts]) => exts.includes(path.extname(f).toLowerCase()))?.[0] ?? "other";

/** Every file under assets/ (subfolders too), relative with forward slashes. Symlinks are not followed. */
function walkAssets(root: string, sub = ""): string[] {
  const dir = path.join(root, sub);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (isJunk(e.name)) continue;
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkAssets(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}

/** Lists input/reference/assets/ with sha256 (unchanged size + mtime reuse the previous hash). The files are not analyzed. */
async function registerAssets(project: Project, log: Log): Promise<ReferenceAssetsJson> {
  const { paths } = project;
  const prev = new Map((readJsonIfExists<ReferenceAssetsJson>(paths.referenceAssets)?.items ?? []).map((a) => [a.file, a]));
  const items: AssetRecord[] = [];
  for (const rel of walkAssets(paths.referenceAssetsDir)) {
    const st = fs.statSync(path.join(paths.referenceAssetsDir, ...rel.split("/")));
    const p = prev.get(rel);
    if (p && p.sizeBytes === st.size && Math.round(p.mtimeMs) === Math.round(st.mtimeMs)) {
      items.push(p);
      continue;
    }
    log(`素材のハッシュを計算中（読み取りのみ）: assets/${rel}`);
    items.push({ file: rel, kind: assetKind(rel), sizeBytes: st.size, mtimeMs: st.mtimeMs, sha256: await sha256File(path.join(paths.referenceAssetsDir, ...rel.split("/"))) });
  }
  const json: ReferenceAssetsJson = {
    version: 1,
    updatedAt: new Date().toISOString(),
    root: "input/reference/assets",
    count: items.length,
    totalBytes: items.reduce((n, a) => n + a.sizeBytes, 0),
    items,
  };
  writeJsonAtomic(paths.referenceAssets, json);
  return json;
}

/** Registers source / final / srt in project.json and lists assets/ (sha256 only; nothing is analyzed). */
export async function registerReference(project: Project, options: { replace?: boolean; log?: Log } = {}) {
  assertReference(project);
  assertWritable(project);
  const log = options.log ?? (() => {});
  const { paths } = project;
  const where = locateReference(project);
  // Horizontal only: both videos are checked before anything is recorded.
  assertLandscape(await probeSource(path.join(paths.referenceDir, ...where.source.split("/")), ""), `元動画（input/reference/${where.source}）`);
  assertLandscape(await probeSource(path.join(paths.referenceDir, ...where.final.split("/")), ""), `完成動画（input/reference/${where.final}）`);
  const prev = project.json.reference;
  const source = await record(project, where.source, prev?.source, !!options.replace, log);
  const final = await record(project, where.final, prev?.final, !!options.replace, log);
  const srt = where.srt ? await record(project, where.srt, prev?.srt, !!options.replace, log) : null;
  const assets = fs.existsSync(paths.referenceAssetsDir) ? await registerAssets(project, log) : null;
  project.json.reference = {
    source: source.rec,
    final: final.rec,
    srt: srt?.rec ?? null,
    assets: assets ? { count: assets.count, totalBytes: assets.totalBytes, fingerprint: fingerprint(assets.items.map((a) => [a.file, a.sha256])) } : null,
  };
  project.json.source = source.rec;
  saveProjectJson(project);
  return { sourceChanged: source.changed, finalChanged: final.changed, srt: !!srt, layout: where.layout, assets };
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
