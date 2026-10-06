// Makes the edited copies of the recordings the sales intro video uses.
// The originals (public/sales-intro/*.mov, Lesson 01's supporter recording)
// are never touched.
//
//   public/sales-intro/edit/si-*.mp4      constant 30fps, h264, no audio, cropped
//   public/sales-intro/edit/stills/*.png  frames from those edited copies
//
// Crops drop what the explanation does not need: browser tabs, URL bar
// (localhost / domain), bookmarks, and the dev-mode "N" badge at the bottom
// left of the X tool. Neither recording shows a user name or local path
// inside the page, so no blur is needed.
//
// Usage: node scripts/sales-intro/prepare-recordings.mjs [--force]

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "public", "sales-intro", "edit");
const STILLS = path.join(OUT, "stills");
const force = process.argv.includes("--force");

const CLIPS = [
  {
    // X記事ツール: inputs (0-41s), generate at 42.5s, result from ~50.5s.
    out: "si-x.mp4",
    src: path.join(ROOT, "public", "sales-intro", "X記事ツール.mov"),
    range: [0, 60.4],
    crop: { w: 2080, h: 1350, x: 560, y: 300 },
  },
  {
    // Sales page, top to footer (site header kept, browser chrome dropped).
    out: "si-page.mp4",
    src: path.join(ROOT, "public", "sales-intro", "画面収録 2026-10-02 12.51.06.mov"),
    range: [0, 48.7],
    crop: { w: 2678, h: 1330, x: 120, y: 320 },
  },
  {
    // Lesson 01's Claude Code supporter demo (already only the ChatGPT window).
    out: "si-supporter.mp4",
    src: path.join(ROOT, "public", "lessons", "lesson-01", "recordings", "claude-supporter-demo.mp4"),
    range: [0, 24],
    crop: { w: 1448, h: 866, x: 0, y: 0 },
  },
];

const STILL_FRAMES = [
  { out: "x-result.png", clip: "si-x.mp4", at: 53.5 },
  // Theme / target / goal filled in and the style selects visible (opening scene).
  { out: "x-inputs.png", clip: "si-x.mp4", at: 19.3 },
  { out: "page-hero.png", clip: "si-page.mp4", at: 1 },
  { out: "page-lessons.png", clip: "si-page.mp4", at: 25.5 },
  { out: "page-environment.png", clip: "si-page.mp4", at: 31.5 },
  { out: "page-zoom.png", clip: "si-page.mp4", at: 38 },
];

async function main() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("ffmpeg-static binary not found.");
  fs.mkdirSync(STILLS, { recursive: true });
  for (const clip of CLIPS) {
    const out = path.join(OUT, clip.out);
    if (fs.existsSync(out) && !force) {
      console.log(`skip ${clip.out} (exists; --force to rebuild)`);
      continue;
    }
    const [from, to] = clip.range;
    const c = clip.crop;
    console.log(`make ${clip.out}`);
    await run(ffmpegPath, [
      "-v", "error", "-y", "-i", clip.src,
      "-vf", `trim=${from}:${to},setpts=PTS-STARTPTS,fps=30,crop=${c.w}:${c.h}:${c.x}:${c.y},format=yuv420p`,
      "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "30",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], { maxBuffer: 16 * 1024 * 1024 });
  }
  for (const still of STILL_FRAMES) {
    const out = path.join(STILLS, still.out);
    if (fs.existsSync(out) && !force) continue;
    await run(ffmpegPath, ["-v", "error", "-y", "-ss", String(still.at), "-i", path.join(OUT, still.clip), "-frames:v", "1", out]);
    console.log(`still ${still.out}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
