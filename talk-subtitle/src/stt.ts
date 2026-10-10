// Speech-to-text with a selectable backend, one output format.
//
//   auto            Windows → faster-whisper, other platforms (Mac) → whisper-cpp
//   whisper-cpp     remotion's whisper.cpp (src/core/speech). Blocked by Smart App Control on the Windows PC.
//   faster-whisper  talk-subtitle/.venv + python/fw_transcribe.py (CPU, int8; PyAV never loaded)
//
// Both read audio/source-16k.wav made by `npm run analyze` (the source video is
// never touched) and return the same Transcript shape (src/transcript.ts).
// Fully local; no paid API.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { UserError } from "./cli.ts";
import type { Settings } from "./config.ts";
import { getWhisperStatus, transcribeFile } from "./engine.ts";
import { TOOL_ROOT } from "./paths.ts";
import type { SttBackend, SttBackendSetting, Transcript, TranscriptSegment } from "./transcript.ts";
import { STT_BACKENDS } from "./transcript.ts";

export const VENV_DIR = path.join(TOOL_ROOT, ".venv");
export const MODELS_DIR = path.join(TOOL_ROOT, ".local", "models");
export const FW_SCRIPT = path.join(TOOL_ROOT, "python", "fw_transcribe.py");
export const FW_REQUIREMENTS = path.join(TOOL_ROOT, "python", "requirements.txt");

const NO_SPACE_LANGUAGES = ["ja", "zh", "th", "lo", "my"];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function venvPython(): string {
  return process.platform === "win32" ? path.join(VENV_DIR, "Scripts", "python.exe") : path.join(VENV_DIR, "bin", "python");
}

/** faster-whisper's Hugging Face repo for a model name (as faster_whisper.utils maps it). */
export function fasterWhisperRepo(model: string): string {
  const known: Record<string, string> = {
    "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    turbo: "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "large-v3": "Systran/faster-whisper-large-v3",
    "large-v2": "Systran/faster-whisper-large-v2",
    medium: "Systran/faster-whisper-medium",
    small: "Systran/faster-whisper-small",
    base: "Systran/faster-whisper-base",
  };
  return known[model] ?? model;
}

export function fasterWhisperModelPresent(model: string): boolean {
  const dir = path.join(MODELS_DIR, `models--${fasterWhisperRepo(model).replace(/\//g, "--")}`, "snapshots");
  return fs.existsSync(dir) && fs.readdirSync(dir).some((snap) => fs.existsSync(path.join(dir, snap, "model.bin")));
}

export function assertBackendSetting(value: string): SttBackendSetting {
  if (!(STT_BACKENDS as readonly string[]).includes(value)) {
    throw new UserError(`backend「${value}」は使えません（${STT_BACKENDS.join(" | ")}）。`);
  }
  return value as SttBackendSetting;
}

export function resolveBackend(setting: SttBackendSetting, platform = process.platform): { backend: SttBackend; reason: string } {
  if (setting !== "auto") return { backend: setting, reason: `指定（${setting}）` };
  const backend: SttBackend = platform === "win32" ? "faster-whisper" : "whisper-cpp";
  return { backend, reason: `auto（${platform} → ${backend}）` };
}

export type SttPlan = {
  backend: SttBackend;
  reason: string;
  model: string;
  language: string;
  prompt: string;
  /** Human-readable runner description for --dry-run / doctor. */
  runner: string;
  details: Record<string, string | number | boolean | null>;
  problems: string[];
};

/** Everything a run would use, without running anything (for --dry-run). */
export function planTranscription(settings: Settings["transcribe"], prompt: string, override: { backend?: string; model?: string; language?: string } = {}): SttPlan {
  const { backend, reason } = resolveBackend(assertBackendSetting(override.backend ?? settings.backend));
  const model = override.model ?? settings.model ?? "large-v3-turbo";
  const language = override.language ?? settings.language;
  const problems: string[] = [];
  if (backend === "faster-whisper") {
    const fw = settings.fasterWhisper;
    const py = venvPython();
    if (!fs.existsSync(py)) problems.push(`Python 環境がありません（${VENV_DIR}）。npm run setup-faster-whisper を実行してください。`);
    const present = fasterWhisperModelPresent(model);
    return {
      backend, reason, model, language, prompt, problems,
      runner: `${py} -I python/fw_transcribe.py`,
      details: { device: "cpu", computeType: fw.computeType, threads: fw.threads, beamSize: fw.beamSize, modelsDir: MODELS_DIR, modelDownloaded: present },
    };
  }
  const w = getWhisperStatus();
  if (!w.installed) problems.push("whisper.cpp が未導入です（remotion で npm run video:setup-stt）。");
  else if (!w.models.some((m) => m.name === model)) problems.push(`whisper.cpp のモデル ${model} がありません（remotion で npm run video:setup-stt -- --model=${model}）。`);
  return {
    backend, reason, model, language, prompt, problems,
    runner: w.executable ?? "whisper.cpp（未導入）",
    details: { threads: settings.whisperCpp.threads ?? null, beamSize: settings.whisperCpp.beamSize ?? null },
  };
}

export async function transcribeWav(wav: string, plan: SttPlan, settings: Settings["transcribe"], onProgress?: (ratio: number) => void): Promise<Transcript> {
  if (plan.problems.length) throw new UserError(plan.problems.join("\n"));
  return plan.backend === "faster-whisper"
    ? runFasterWhisper(wav, plan, settings, onProgress)
    : runWhisperCpp(wav, plan, settings, onProgress);
}

async function runWhisperCpp(wav: string, plan: SttPlan, settings: Settings["transcribe"], onProgress?: (r: number) => void): Promise<Transcript> {
  try {
    const t = await transcribeFile(wav, {
      model: plan.model,
      language: plan.language,
      prompt: plan.prompt || undefined,
      threads: settings.whisperCpp.threads,
      beamSize: settings.whisperCpp.beamSize,
      onProgress,
    });
    return { ...t, engine: { ...t.engine, backend: "whisper-cpp", backendReason: plan.reason } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/spawn UNKNOWN|EPERM|Application Control|アプリケーション制御/.test(msg)) {
      throw new UserError(
        "whisper.cpp を起動できません（Windows のアプリ制御＝Smart App Control にブロックされています）。" +
          "Windows では --backend=faster-whisper（または auto）を使ってください。",
      );
    }
    throw err;
  }
}

type FwResult = {
  engine: { name: "faster-whisper"; version: string; ctranslate2: string; model: string; device: string; computeType: string; threads: number; beamSize: number };
  promptReceived: string;
  pyavPlaceholderActive: boolean;
  language: string;
  languageProbability: number;
  durationSeconds: number;
  loadSeconds: number;
  transcribeSeconds: number;
  segments: { start: number; end: number; text: string; words: { text: string; start: number; end: number; probability: number }[] }[];
};

function runPython(args: string[], onLine?: (line: string) => void, timeoutMs = 4 * 60 * 60 * 1000): Promise<{ stdout: string; stderr: string }> {
  const py = venvPython();
  return new Promise((resolve, reject) => {
    const child = spawn(py, ["-I", FW_SCRIPT, ...args], {
      cwd: TOOL_ROOT,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      stderr = (stderr + s).slice(-20000);
      if (onLine) for (const line of s.split(/\r?\n/)) if (line) onLine(line);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`faster-whisper timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new UserError(`Python を起動できません（${py}）: ${e.message}。npm run setup-faster-whisper を確認してください。`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const tail = stderr.trim().split(/\r?\n/).slice(-8).join("\n");
        const blocked = /Application Control|アプリケーション制御/.test(stderr) ? "\n（Windows のアプリ制御にブロックされた DLL があります）" : "";
        reject(new UserError(`faster-whisper が失敗しました（終了コード ${code}）:\n${tail}${blocked}`));
      }
    });
  });
}

async function runFasterWhisper(wav: string, plan: SttPlan, settings: Settings["transcribe"], onProgress?: (r: number) => void): Promise<Transcript> {
  const fw = settings.fasterWhisper;
  const started = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-"));
  const out = path.join(tmpDir, "result.json");
  try {
    await runPython(
      [
        "--wav", wav,
        "--out", out,
        "--model", plan.model,
        "--language", plan.language,
        "--threads", String(fw.threads),
        "--compute-type", fw.computeType,
        "--beam-size", String(fw.beamSize),
        "--models-dir", MODELS_DIR,
        ...(plan.prompt ? [`--prompt=${plan.prompt}`] : []), // "=" form: a prompt may start with "-"
        ...(fasterWhisperModelPresent(plan.model) ? ["--offline"] : []),
      ],
      (line) => {
        const m = line.match(/progress =\s*(\d+)%/);
        if (m) onProgress?.(Number(m[1]) / 100);
      },
    );
    const r = JSON.parse(fs.readFileSync(out, "utf8")) as FwResult;
    if (!r.pyavPlaceholderActive) throw new Error("faster-whisper の実行中に PyAV が読み込まれました（想定外）。python/fw_transcribe.py を確認してください。");
    if (r.promptReceived !== plan.prompt) {
      throw new Error(`glossary prompt が faster-whisper に正しく渡っていません（送信「${plan.prompt}」／受信「${r.promptReceived}」）`);
    }
    const duration = round3(r.durationSeconds);
    const segments: TranscriptSegment[] = [];
    for (const s of r.segments) {
      const text = s.text.trim();
      if (!text) continue;
      segments.push({
        id: segments.length,
        start: round3(s.start),
        end: round3(Math.min(s.end, duration)),
        text,
        words: s.words
          .map((w) => ({ text: w.text.trim(), start: round3(w.start), end: round3(Math.min(w.end, duration)), probability: round3(w.probability) }))
          .filter((w) => w.text),
      });
    }
    const separator = NO_SPACE_LANGUAGES.includes(r.language) ? "" : " ";
    return {
      schemaVersion: 1,
      engine: {
        name: "faster-whisper",
        version: r.engine.version,
        model: r.engine.model,
        wordTimestamps: "word",
        backend: "faster-whisper",
        backendReason: plan.reason,
        device: r.engine.device,
        computeType: r.engine.computeType,
        threads: r.engine.threads,
        beamSize: r.engine.beamSize,
        runtime: { ctranslate2: r.engine.ctranslate2 },
      },
      language: r.language,
      source: { fileName: path.basename(wav), durationSeconds: duration },
      createdAt: new Date().toISOString(),
      processingSeconds: round3((Date.now() - started) / 1000),
      text: segments.map((s) => s.text).join(separator),
      segments,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export type FasterWhisperCheck = { python: string; fasterWhisper: string; ctranslate2: string; cpuComputeTypes: string[]; pyav: string };

/** Imports faster-whisper in the venv (no model load). null when the venv is missing. */
export async function checkFasterWhisper(): Promise<FasterWhisperCheck | null> {
  if (!fs.existsSync(venvPython())) return null;
  const { stdout } = await runPython(["--check"], undefined, 120_000);
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as FasterWhisperCheck;
}

export async function downloadFasterWhisperModel(model: string): Promise<void> {
  await runPython(["--download-only", "--model", model, "--models-dir", MODELS_DIR], (line) => {
    if (!/it\/s|B\/s/.test(line)) process.stderr.write(`${line}\n`);
  });
}
