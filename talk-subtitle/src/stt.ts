// Speech-to-text with a selectable backend, one output format. The backends are run by
// remotion's core (src/core/speech/stt.ts, through src/engine.ts); what is talk-subtitle's
// stays here: the setting (input/settings.json transcribe.backend), the faster-whisper venv,
// script and models folder (passed to core as the runtime), the Windows workaround (the
// script never loads PyAV, checked below) and the messages.
//
//   auto            Windows → faster-whisper, other platforms (Mac) → whisper-cpp
//   whisper-cpp     remotion's whisper.cpp (src/core/speech). Blocked by Smart App Control on the Windows PC.
//   faster-whisper  talk-subtitle/.venv + python/fw_transcribe.py (CPU, int8; PyAV never loaded)
//
// Both read audio/source-16k.wav made by `npm run analyze` (the source video is
// never touched) and return the same Transcript shape (src/transcript.ts).
// Fully local; no paid API.

import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import type { Settings } from "./config.ts";
import { getWhisperStatus, resolveSttBackend, runFasterWhisperScript, SttRunError, transcribeWithBackend, transcribeWithFasterWhisper, type FasterWhisperRuntime } from "./engine.ts";
import { TOOL_ROOT } from "./paths.ts";
import type { SttBackend, SttBackendSetting, Transcript } from "./transcript.ts";
import { STT_BACKENDS } from "./transcript.ts";

export const VENV_DIR = path.join(TOOL_ROOT, ".venv");
export const MODELS_DIR = path.join(TOOL_ROOT, ".local", "models");
export const FW_SCRIPT = path.join(TOOL_ROOT, "python", "fw_transcribe.py");
export const FW_REQUIREMENTS = path.join(TOOL_ROOT, "python", "requirements.txt");

export function venvPython(): string {
  return process.platform === "win32" ? path.join(VENV_DIR, "Scripts", "python.exe") : path.join(VENV_DIR, "bin", "python");
}

/** talk-subtitle's faster-whisper runtime, handed to core: the venv, the script (isolated mode) and UTF-8 I/O. */
export function fasterWhisperRuntime(): FasterWhisperRuntime {
  return {
    python: venvPython(),
    pythonArgs: ["-I"],
    script: FW_SCRIPT,
    modelsDir: MODELS_DIR,
    cwd: TOOL_ROOT,
    env: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
  };
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
  const { backend, auto } = resolveSttBackend(setting, platform);
  return { backend, reason: auto ? `auto（${platform} → ${backend}）` : `指定（${setting}）` };
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
      details: { device: "cpu", computeType: fw.computeType, threads: fw.threads, beamSize: fw.beamSize, conditionOnPreviousText: fw.conditionOnPreviousText, modelsDir: MODELS_DIR, modelDownloaded: present },
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
    return await transcribeWithBackend(wav, {
      backend: "whisper-cpp",
      backendReason: plan.reason,
      whisperCpp: {
        model: plan.model,
        language: plan.language,
        prompt: plan.prompt || undefined,
        threads: settings.whisperCpp.threads,
        beamSize: settings.whisperCpp.beamSize,
        onProgress,
      },
    });
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
/** Core's run error → talk-subtitle's message (the Windows hint included). */
function fasterWhisperError(err: unknown): unknown {
  if (!(err instanceof SttRunError)) return err;
  if (err.kind === "spawn") {
    return new UserError(`Python を起動できません（${venvPython()}）: ${err.detail}。npm run setup-faster-whisper を確認してください。`);
  }
  if (err.kind === "exit") {
    const tail = err.stderr.trim().split(/\r?\n/).slice(-8).join("\n");
    const blocked = /Application Control|アプリケーション制御/.test(err.stderr) ? "\n（Windows のアプリ制御にブロックされた DLL があります）" : "";
    return new UserError(`faster-whisper が失敗しました（終了コード ${err.exitCode}）:\n${tail}${blocked}`);
  }
  return new Error(err.message);
}

async function runFasterWhisper(wav: string, plan: SttPlan, settings: Settings["transcribe"], onProgress?: (r: number) => void): Promise<Transcript> {
  const fw = settings.fasterWhisper;
  let run;
  try {
    run = await transcribeWithFasterWhisper(wav, fasterWhisperRuntime(), {
      model: plan.model,
      language: plan.language,
      prompt: plan.prompt,
      threads: fw.threads,
      computeType: fw.computeType,
      beamSize: fw.beamSize,
      conditionOnPreviousText: fw.conditionOnPreviousText,
      offline: fasterWhisperModelPresent(plan.model),
      backendReason: plan.reason,
      onProgress,
    });
  } catch (err) {
    throw fasterWhisperError(err);
  }
  // The Windows workaround (python/fw_transcribe.py never loads PyAV) and the glossary prompt are checked here.
  if (!run.result.pyavPlaceholderActive) throw new Error("faster-whisper の実行中に PyAV が読み込まれました（想定外）。python/fw_transcribe.py を確認してください。");
  if (run.result.promptReceived !== plan.prompt) {
    throw new Error(`glossary prompt が faster-whisper に正しく渡っていません（送信「${plan.prompt}」／受信「${run.result.promptReceived}」）`);
  }
  return run.transcript;
}

export type FasterWhisperCheck = { python: string; fasterWhisper: string; ctranslate2: string; cpuComputeTypes: string[]; pyav: string };

/** Imports faster-whisper in the venv (no model load). null when the venv is missing. */
export async function checkFasterWhisper(): Promise<FasterWhisperCheck | null> {
  if (!fs.existsSync(venvPython())) return null;
  try {
    const { stdout } = await runFasterWhisperScript(fasterWhisperRuntime(), ["--check"], { timeoutMs: 120_000 });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!) as FasterWhisperCheck;
  } catch (err) {
    throw fasterWhisperError(err);
  }
}

export async function downloadFasterWhisperModel(model: string): Promise<void> {
  try {
    await runFasterWhisperScript(fasterWhisperRuntime(), ["--download-only", "--model", model, "--models-dir", MODELS_DIR], {
      onLine: (line) => {
        if (!/it\/s|B\/s/.test(line)) process.stderr.write(`${line}\n`);
      },
    });
  } catch (err) {
    throw fasterWhisperError(err);
  }
}
