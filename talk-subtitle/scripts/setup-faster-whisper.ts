// Sets up the faster-whisper backend (the Windows standard): talk-subtitle/.venv,
// python/requirements.txt, and the model in .local/models. Re-running is safe.
//   npm run setup-faster-whisper -- [--python=<Python 3.9–3.13 の python.exe>] [--model=large-v3-turbo] [--skip-model]
//
// Python は python.org の署名付きインストーラー（winget install Python.Python.3.12 --scope user）。
// Smart App Control の設定は変更しない。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, runCli, UserError } from "../src/cli.ts";
import { checkFasterWhisper, downloadFasterWhisperModel, FW_REQUIREMENTS, MODELS_DIR, VENV_DIR, venvPython } from "../src/stt.ts";

function findPython(explicit: string | undefined): string {
  if (explicit) return explicit;
  const candidates =
    process.platform === "win32"
      ? ["Python313", "Python312", "Python311", "Python310"].map((v) => path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Programs", "Python", v, "python.exe"))
      : ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new UserError("Python 3.10〜3.13 が見つかりません。winget install --id Python.Python.3.12 -e --scope user で入れるか、--python=<path> を指定してください。");
  return hit;
}

function run(cmd: string, args: string[]) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true });
  if (r.status !== 0) throw new UserError(`失敗しました（終了コード ${r.status ?? r.error?.message}）`);
}

await runCli(async () => {
  const args = parseArgs();
  if (!fs.existsSync(venvPython())) {
    run(findPython(args.get("python")), ["-m", "venv", VENV_DIR]);
  } else console.log(`既存の環境を使います: ${VENV_DIR}`);
  run(venvPython(), ["-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", FW_REQUIREMENTS]);
  const check = await checkFasterWhisper();
  console.log(`faster-whisper ${check?.fasterWhisper}（ctranslate2 ${check?.ctranslate2}、Python ${check?.python}、CPU: ${check?.cpuComputeTypes.join(", ")}、PyAV: ${check?.pyav}）`);
  if (!args.has("skip-model")) {
    const model = args.get("model") ?? "large-v3-turbo";
    console.log(`モデル ${model} を ${MODELS_DIR} に用意します（初回のみダウンロード、約1.6GB）…`);
    await downloadFasterWhisperModel(model);
  }
  console.log("準備できました。");
});
