// Step 1: inspect the source video and derive analysis files. The source is
// only read; every output goes to audio/ or intermediate/.

import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import { loadSettings } from "./config.ts";
import { detectSilence, extractAudio, measureLoudness, probeMedia, runTool, type Silence } from "./engine.ts";
import {
  assertWritable,
  listInputVideos,
  saveProjectJson,
  sha256File,
  writeJsonAtomic,
  type Project,
} from "./project.ts";

export type ProbeJson = {
  source: { file: string; sizeBytes: number; sha256: string };
  container: string | null;
  durationSeconds: number | null;
  video: {
    codec: string;
    /** Size as stored in the file. */
    storedWidth: number;
    storedHeight: number;
    /** Display rotation in degrees (0, 90, 180, 270). Phones often store portrait video as landscape + 90. */
    rotation: number;
    /** Size as displayed (rotation applied). Use these, never the stored ones. */
    width: number;
    height: number;
    fps: number | null;
    fpsFraction: string | null;
    aspectRatio: number;
    aspectLabel: string;
    orientation: "landscape" | "portrait" | "square";
    pixelFormat: string | null;
  } | null;
  audio: { codec: string; sampleRate: number | null; channels: number | null } | null;
  /** Whether review.html can play the source directly (otherwise a proxy is made). */
  browserPlayable: boolean;
  analyzedAt: string;
};

export type SilencesJson = {
  noiseDb: number;
  noiseDbSource: "settings" | "auto";
  minDetectSeconds: number;
  durationSeconds: number | null;
  silences: Silence[];
};

type RotationProbe = {
  streams?: { side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } }[];
};

async function readRotation(file: string): Promise<number> {
  const { stdout } = await runTool("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-print_format", "json",
    "-show_streams",
    file,
  ]);
  const s = (JSON.parse(stdout) as RotationProbe).streams?.[0];
  const raw = s?.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? Number(s?.tags?.rotate ?? 0);
  return (((Math.round(raw / 90) * 90) % 360) + 360) % 360;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function aspectLabel(w: number, h: number): string {
  const known: [string, number][] = [["16:9", 16 / 9], ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:4", 3 / 4], ["1:1", 1], ["21:9", 21 / 9], ["4:5", 4 / 5]];
  const r = w / h;
  const hit = known.find(([, v]) => Math.abs(v - r) / v < 0.01);
  if (hit) return hit[0];
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

const BROWSER_VIDEO_CODECS = ["h264", "vp8", "vp9", "av1"];
const BROWSER_CONTAINERS = [".mp4", ".m4v", ".mov", ".webm"];

export async function probeSource(file: string, sha256: string): Promise<ProbeJson> {
  const info = await probeMedia(file);
  let video: ProbeJson["video"] = null;
  if (info.video) {
    const rotation = await readRotation(file);
    const swap = rotation === 90 || rotation === 270;
    const width = swap ? info.video.height : info.video.width;
    const height = swap ? info.video.width : info.video.height;
    video = {
      codec: info.video.codec,
      storedWidth: info.video.width,
      storedHeight: info.video.height,
      rotation,
      width,
      height,
      fps: info.video.fps,
      fpsFraction: info.video.fpsFraction,
      aspectRatio: Math.round((width / height) * 10000) / 10000,
      aspectLabel: aspectLabel(width, height),
      orientation: width > height ? "landscape" : width < height ? "portrait" : "square",
      pixelFormat: info.video.pixelFormat,
    };
  }
  return {
    source: { file: info.fileName, sizeBytes: info.sizeBytes, sha256 },
    container: info.formatName,
    durationSeconds: info.durationSeconds,
    video,
    audio: info.audio,
    browserPlayable:
      video !== null &&
      BROWSER_VIDEO_CODECS.includes(video.codec) &&
      BROWSER_CONTAINERS.includes(path.extname(file).toLowerCase()),
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Picks the source in input/ and records it in project.json (with sha256).
 * Refuses silently switching to another file: --replace-source is needed.
 */
export async function registerSource(
  project: Project,
  options: { source?: string; replace?: boolean },
): Promise<{ file: string; sha256: string; changed: boolean }> {
  const { paths, json } = project;
  const videos = listInputVideos(paths);
  let name = options.source ? path.basename(options.source) : undefined;
  if (options.source && path.resolve(paths.input, name!) !== path.resolve(paths.input, options.source)) {
    throw new UserError("--source= には input/ の中のファイル名だけを指定してください。");
  }
  if (!name) {
    if (json.source && !options.replace) name = path.basename(json.source.file);
    else if (videos.length === 1) name = videos[0];
    else if (videos.length === 0) throw new UserError(`元動画がありません。${paths.input} に動画ファイルを1本置いてください。`);
    else throw new UserError(`input/ に動画が複数あります（${videos.join("、")}）。--source=<ファイル名> で指定してください。`);
  }
  const file = path.join(paths.input, name);
  if (!fs.existsSync(file)) throw new UserError(`元動画が見つかりません: ${file}`);

  process.stderr.write(`元動画のハッシュを計算中（読み取りのみ）: ${name}\n`);
  const sha256 = await sha256File(file);
  const st = fs.statSync(file);
  const rel = `input/${name}`;
  const prev = json.source;
  if (prev && (prev.file !== rel || prev.sha256 !== sha256) && !options.replace) {
    throw new UserError(
      `登録済みの元動画（${prev.file}）と違うファイルです。差し替える場合は --replace-source を付けてください。` +
        "（差し替えると、以降の文字起こし・候補・承認はすべて作り直しになります）",
    );
  }
  const changed = !prev || prev.sha256 !== sha256;
  if (changed || prev.sizeBytes !== st.size || Math.round(prev.mtimeMs) !== Math.round(st.mtimeMs)) {
    assertWritable(project);
    json.source = {
      file: rel,
      sizeBytes: st.size,
      mtimeMs: st.mtimeMs,
      sha256,
      registeredAt: changed ? new Date().toISOString() : prev!.registeredAt,
    };
    saveProjectJson(project);
  }
  return { file, sha256, changed };
}

/** Light H.264 copy for review.html when the source cannot play in a browser. Rotation is baked in. */
export async function makeReviewProxy(source: string, output: string): Promise<void> {
  const tmp = path.join(path.dirname(output), `.review-proxy.tmp-${process.pid}.mp4`);
  try {
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", source,
      "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      tmp,
    ]);
    fs.renameSync(tmp, output);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export function silenceThreshold(meanVolumeDb: number, settings: ReturnType<typeof loadSettings>["silence"]): number {
  if (settings.noiseDb !== null) return settings.noiseDb;
  const auto = Math.round(meanVolumeDb - settings.noiseOffsetDb);
  return Math.min(settings.noiseMaxDb, Math.max(settings.noiseMinDb, auto));
}

export async function analyzeProject(
  project: Project,
  options: { source?: string; replaceSource?: boolean; force?: boolean; log?: (s: string) => void },
): Promise<{ probe: ProbeJson; silences: SilencesJson; proxyMade: boolean }> {
  const log = options.log ?? (() => {});
  assertWritable(project);
  const { paths } = project;
  const settings = loadSettings(paths);
  const { file, sha256, changed } = await registerSource(project, { source: options.source, replace: options.replaceSource });
  const redo = changed || options.force;

  log("ffprobe で解析中…");
  const probe = await probeSource(file, sha256);
  if (!probe.audio) throw new UserError("元動画に音声がありません。");
  writeJsonAtomic(paths.probe, probe);

  if (redo || !fs.existsSync(paths.audioWav)) {
    log("音声を抽出中（16kHz モノラル）…");
    await extractAudio(file, paths.audioWav, { sampleRate: 16000, channels: 1, overwrite: true });
  }

  log("音量を測定中…");
  const loudness = await measureLoudness(paths.audioWav);
  writeJsonAtomic(paths.loudness, loudness);

  const noiseDb = silenceThreshold(loudness.meanVolumeDb, settings.silence);
  log(`無音を検出中（しきい値 ${noiseDb}dB）…`);
  const list = await detectSilence(paths.audioWav, { noiseDb, minSilenceSeconds: settings.silence.minDetectSeconds });
  const silences: SilencesJson = {
    noiseDb,
    noiseDbSource: settings.silence.noiseDb !== null ? "settings" : "auto",
    minDetectSeconds: settings.silence.minDetectSeconds,
    durationSeconds: probe.durationSeconds,
    silences: list,
  };
  writeJsonAtomic(paths.silences, silences);

  let proxyMade = false;
  if (!probe.browserPlayable && (redo || !fs.existsSync(paths.proxy))) {
    log(`ブラウザで再生できない形式（${probe.video?.codec ?? "映像なし"}）なので、確認用のプロキシ動画を作成中…`);
    await makeReviewProxy(file, paths.proxy);
    proxyMade = true;
  }
  return { probe, silences, proxyMade };
}
