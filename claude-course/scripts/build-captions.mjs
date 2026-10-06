// Rebuilds public/lessons/lesson-XX/audio/captions.vtt from the existing
// narration.json (times) + lessons/lesson-XX/captions.json (display wording),
// with the same row breaks as the video. Does not touch the audio,
// narration.json or narration.srt, and never calls VOICEVOX.
//
// Usage: node scripts/build-captions.mjs --lesson=01   (or --lesson=free-trial / sales-intro)
//
// build-narration.mjs writes the same file the same way; use this one after
// editing only captions.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lessonPaths } from "./voicevox/lesson.mjs";
import { displayCues, loadCaptionOverrides, toVtt } from "./voicevox/subtitles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.find((a) => a.startsWith("--lesson="));
const lessonNo = arg?.slice("--lesson=".length);
let paths;
try {
  paths = lessonPaths(ROOT, lessonNo);
} catch {
  console.error("Usage: node scripts/build-captions.mjs --lesson=NN|free-trial|sales-intro");
  process.exit(1);
}

const audioDir = paths.audioDir;
const narrationFile = path.join(audioDir, "narration.json");
if (!fs.existsSync(narrationFile)) {
  console.error(`Not found: ${narrationFile} (run scripts/voicevox/build-narration.mjs first)`);
  process.exit(1);
}
const narration = JSON.parse(fs.readFileSync(narrationFile, "utf8"));
const overrides = loadCaptionOverrides(paths.captionsFile);

const unknown = Object.keys(overrides).filter((id) => !narration.lines.some((l) => l.id === id));
if (unknown.length > 0) {
  console.error(`captions.json has ids not in narration.json: ${unknown.join(", ")}`);
  process.exit(1);
}

const out = path.join(audioDir, "captions.vtt");
const tmp = `${out}.tmp`;
fs.writeFileSync(tmp, toVtt(displayCues(narration.lines, overrides)));
fs.renameSync(tmp, out);
console.log(`Wrote ${path.relative(ROOT, out)} (${narration.lines.length} cues, ${Object.keys(overrides).length} display overrides)`);
