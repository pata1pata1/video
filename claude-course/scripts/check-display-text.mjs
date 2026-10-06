// Checks every Japanese text a viewer sees in a lesson video. Read-only.
//
//   1. Captions: how each will be displayed (captions.json overrides + the row
//      breaks in src/components/captionLayout.ts) and layout problems.
//   2. Screen text: lesson.json visual.* strings and chapter titles.
//   3. Notation rule hints for both: 「、」 is an error; words the rule prefers
//      in kanji / digits (こと→事, すべて→全て, つかむ→掴む, ください→下さい,
//      三つ→３つ, とき→時, たとえば→例えば) are reported to review, since a
//      few may be correct as they are.
//   4. captions.vtt: must match the displayed captions (wording and rows).
//
// Usage: node scripts/check-display-text.mjs --lesson=01   (or --lesson=free-trial / sales-intro)
// Exit code 1 when there are errors (hints alone do not fail).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_ROW_WIDTH, splitCaption, widthOf } from "../src/components/captionLayout.ts";
import { lessonPaths } from "./voicevox/lesson.mjs";
import { displayCues, loadCaptionOverrides, toVtt } from "./voicevox/subtitles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lessonNo = (process.argv.find((a) => a.startsWith("--lesson=")) ?? "--lesson=01").slice("--lesson=".length);
const paths = lessonPaths(ROOT, lessonNo);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const narration = read(path.join(paths.audioDir, "narration.json"));
const lesson = read(paths.lessonFile);
const overrides = loadCaptionOverrides(paths.captionsFile);

// Rule hints. Lookarounds keep e.g. ことば / ときどき out.
const HINTS = [
  [/(?<![ぁ-ん])こと(?![ばわ])/, "こと→事"],
  [/すべて/, "すべて→全て"],
  [/つか[まみむめもん]/, "つかむ→掴む"],
  [/ください/, "ください→下さい"],
  [/[一二三四五六七八九]つ/, "三つ→３つ"],
  [/(?<![ぁ-ん])とき(?!ど)/, "とき→時"],
  [/たとえば/, "たとえば→例えば"],
];
const hintsFor = (text) => HINTS.filter(([re]) => re.test(text)).map(([, h]) => h);

let errors = 0;
let hints = 0;

console.log("== Captions (as displayed) ==");
for (const line of narration.lines) {
  const rows = splitCaption(overrides[line.id] ?? line.caption, MAX_ROW_WIDTH);
  const widths = rows.map(widthOf);
  const problems = [];
  if (rows.some((r) => r.includes("、"))) problems.push("読点");
  if (widths.some((w) => w > MAX_ROW_WIDTH)) problems.push("1行が長すぎる");
  if (rows.length === 2 && Math.min(...widths) < 5) problems.push("2行目が短すぎる");
  if (rows.length > 2) problems.push("3行以上");
  const h = hintsFor(rows.join(""));
  errors += problems.length ? 1 : 0;
  hints += h.length ? 1 : 0;
  const note = [...problems, ...h.map((x) => `確認:${x}`)];
  const mark = overrides[line.id] ? "*" : " ";
  console.log(`${line.id}${mark} ${rows.map((r, i) => `${r} (${widths[i].toFixed(1)})`).join(" / ")}${note.length ? "  <- " + note.join(", ") : ""}`);
}

console.log("");
console.log("== Screen text (lesson.json visual, chapter titles) ==");
const screenTexts = [];
const walk = (v, where) => {
  if (typeof v === "string") {
    if (!/\.(png|jpe?g|mp4|webm)$/i.test(v)) screenTexts.push([where, v]);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
  else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], `${where}.${k}`);
};
for (const c of lesson.chapters) {
  screenTexts.push([`${c.id}.title`, c.title]);
  for (const s of c.scenes) walk(s.visual, s.id);
}
for (const [where, text] of screenTexts) {
  const problems = text.includes("、") ? ["読点"] : [];
  const h = hintsFor(text);
  errors += problems.length ? 1 : 0;
  hints += h.length ? 1 : 0;
  if (problems.length || h.length) console.log(`${where}: ${text}  <- ${[...problems, ...h.map((x) => `確認:${x}`)].join(", ")}`);
}
console.log(`${screenTexts.length} screen texts checked`);

console.log("");
console.log("== captions.vtt ==");
const vttFile = path.join(paths.audioDir, "captions.vtt");
const expected = toVtt(displayCues(narration.lines, overrides));
const actual = fs.existsSync(vttFile) ? fs.readFileSync(vttFile, "utf8") : null;
if (actual === expected) {
  console.log("captions.vtt matches the displayed captions");
} else {
  errors++;
  console.log("captions.vtt is out of date -> node scripts/build-captions.mjs --lesson=" + lessonNo);
}

console.log("");
console.log(`${narration.lines.length} captions, ${Object.keys(overrides).length} overrides; errors: ${errors}, to review: ${hints}`);
process.exit(errors ? 1 : 0);
