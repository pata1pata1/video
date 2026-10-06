// Loads a video's script and resolves the settings its pattern fixes
// (patterns/<pattern>/voice.json, bgm.json, render.json). A value written in
// the script itself (voice, timing, bgm) overrides the pattern's.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadVideo(scriptId) {
  const script = readJson(path.join(ROOT, "script", `${scriptId}.json`));
  if (!script.pattern) throw new Error(`script/${scriptId}.json has no "pattern" (e.g. "pattern-01")`);
  const dir = path.join(ROOT, "patterns", script.pattern);
  if (!fs.existsSync(dir)) throw new Error(`unknown pattern ${script.pattern} (no ${path.relative(ROOT, dir)})`);
  const voiceDef = readJson(path.join(dir, "voice.json"));
  const bgmDef = readJson(path.join(dir, "bgm.json"));
  const render = readJson(path.join(dir, "render.json"));
  // key order matters: it is part of the narration cache key
  const voice = {
    speaker: script.voice?.speaker ?? voiceDef.speaker,
    speakerName: script.voice?.speakerName ?? voiceDef.speakerName,
    speedScale: script.voice?.speedScale ?? voiceDef.speedScale,
  };
  const timing = { ...voiceDef.timing, ...script.timing };
  const bgm = script.bgm === undefined ? bgmDef.bgm : script.bgm;
  if (bgm && bgm.belowVoiceDb === undefined) bgm.belowVoiceDb = bgmDef.belowVoiceDb;
  return { script, pattern: script.pattern, voice, timing, bgm, render, engineUrl: voiceDef.engineUrl };
}
