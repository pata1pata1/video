// Environment check: remotion engine, ffmpeg / ffprobe, whisper.cpp. Read-only.
//   npm run doctor

import fs from "node:fs";
import { runCli } from "../src/cli.ts";
import { getWhisperStatus, REMOTION_ROOT, resolveBinary, toolVersion } from "../src/engine.ts";
import { DEFAULT_SETTINGS } from "../src/config.ts";
import { PROJECTS_DIR, SHARED_GLOSSARY, TOOL_ROOT } from "../src/paths.ts";
import { checkFasterWhisper, fasterWhisperModelPresent, MODELS_DIR, resolveBackend, venvPython } from "../src/stt.ts";

await runCli(async () => {
  const ok = (b: boolean) => (b ? "OK " : "NG ");
  console.log(`talk-subtitle : ${TOOL_ROOT}`);
  console.log(`Node.js       : ${process.version}`);
  console.log(`remotion      : ${REMOTION_ROOT}`);
  for (const tool of ["ffmpeg", "ffprobe"] as const) {
    try {
      const bin = resolveBinary(tool);
      console.log(`${ok(true)}${tool.padEnd(8)}: ${(await toolVersion(tool)).split("\n")[0]}（${bin.source}）`);
    } catch (err) {
      console.log(`${ok(false)}${tool.padEnd(8)}: ${err instanceof Error ? err.message : err}`);
      if (tool === "ffprobe") console.log("   → 起動できる ffprobe を環境変数 FFPROBE_PATH で指定してください（設定後に開いたターミナルで有効）");
    }
  }
  const t = DEFAULT_SETTINGS.transcribe;
  const { backend, reason } = resolveBackend(t.backend);
  console.log(`文字起こし    : 標準 backend = ${backend}（${reason}）、モデル ${t.model}`);
  try {
    const fw = await checkFasterWhisper();
    const model = fasterWhisperModelPresent(t.model);
    console.log(
      fw
        ? `${ok(model)}faster-whisper: ${fw.fasterWhisper}（ctranslate2 ${fw.ctranslate2}、Python ${fw.python}、${t.fasterWhisper.computeType}・${t.fasterWhisper.threads}スレッド、PyAV: ${fw.pyav}）モデル${model ? "あり" : "なし"}（${MODELS_DIR}）`
        : `${ok(false)}faster-whisper: 未導入（${venvPython()} が無い）`,
    );
    if (!fw || !model) console.log("   → npm run setup-faster-whisper");
  } catch (err) {
    console.log(`${ok(false)}faster-whisper: ${err instanceof Error ? err.message : err}`);
  }
  const w = getWhisperStatus();
  console.log(`${process.platform === "win32" ? "-- " : ok(w.installed && w.defaultModelAvailable)}whisper.cpp : ${w.installed ? w.executable : "未導入"}／モデル ${w.models.map((m) => m.name).join(", ") || "なし"}${process.platform === "win32" ? "（この Windows PC では Smart App Control により起動不可。auto では使わない）" : ""}`);
  if (!w.installed || !w.defaultModelAvailable) console.log("   → remotion で npm run video:setup-stt を実行してください");
  const projects = fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).filter((d) => fs.existsSync(`${PROJECTS_DIR}/${d}/project.json`)) : [];
  console.log(`案件          : ${projects.length}件 ${projects.join(", ")}`);
  console.log(`共通辞書      : ${fs.existsSync(SHARED_GLOSSARY) ? SHARED_GLOSSARY : "なし"}`);
});
