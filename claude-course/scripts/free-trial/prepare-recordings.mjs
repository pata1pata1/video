// Makes the edited copies of the free trial recordings that the video uses.
// The originals in public/free-trial/ (01.mov ... 05.mov) are never touched.
//
//   public/free-trial/edit/ft-0N.mp4   constant 30fps, h264, no audio,
//                                      cropped to the page / terminal body,
//                                      with the user name blurred where shown
//   public/free-trial/edit/stills/*.png  frames from those edited copies
//
// Crops drop everything the explanation does not need: macOS menu bar,
// terminal title bar (user name), browser tabs / URL bar (local path) /
// bookmarks, Dock, and the link-preview bar at the bottom of the browser.
// Masks (blur) cover only the user name inside a terminal path; the
// instructions and the changed parts of the site are never covered.
//
// Usage: node scripts/free-trial/prepare-recordings.mjs [--force]

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(ROOT, "public", "free-trial");
const OUT = path.join(SRC, "edit");
const STILLS = path.join(OUT, "stills");
const force = process.argv.includes("--force");

/** Blur one rectangle (output pixels) between two times (seconds of the trimmed clip). */
const blur = ({ x, y, w, h }, from, to) => ({ x, y, w, h, from, to });

/**
 * Each clip: source file, kept source range, crop (source pixels; x may be an
 * ffmpeg expression of t when the window moves), and blurs in cropped pixels.
 */
const CLIPS = [
  {
    // Claude Code in the terminal: request -> build -> summary. The ChatGPT
    // window at the end (from ~146s) is not used.
    out: "ft-01.mp4",
    src: "01.mov",
    range: [0, 125],
    crop: { w: 2810, h: 1500, x: "40", y: "142" },
    // "$ ls -la /Users/<name>/Projects/..." under the request (shown ~11-74s).
    blurs: [blur({ x: 365, y: 1122, w: 260, h: 50 }, 8, 75)],
  },
  {
    // First version of the site in the browser, scrolled top -> footer -> top.
    out: "ft-02.mp4",
    src: "02.mov",
    range: [0, 34.3],
    crop: { w: 2680, h: 1316, x: "116", y: "320" },
    blurs: [],
  },
  {
    // The change request (logo 1.5x, dark brown button, smartphone) and the result.
    out: "ft-03.mp4",
    src: "03.mp4",
    range: [0, 35.9],
    crop: { w: 1870, h: 974, x: "20", y: "16" },
    // "Reading /private/tmp/claude-501/-Users-<name>-..." (two lines, ~23.5-30s).
    blurs: [blur({ x: 505, y: 780, w: 190, h: 30 }, 23, 30.5), blur({ x: 445, y: 806, w: 190, h: 32 }, 23, 30.5)],
  },
  {
    // Reload (before -> after), then the header's メニュー link -> menu section.
    // The browser window moves 15px right at 7.75s; the crop follows it.
    out: "ft-04.mp4",
    src: "04.mp4",
    range: [0, 23.1],
    crop: { w: 1806, h: 850, x: "if(lt(t,7.75),54,70)", y: "152" },
    blurs: [],
  },
  {
    // Narrowing the browser window, then scrolling the narrow layout.
    out: "ft-05.mp4",
    src: "05.mov",
    range: [0, 21],
    crop: { w: 2858, h: 1330, x: "114", y: "316" },
    blurs: [],
  },
];

/** Frames used as stills (seconds in the edited clip). */
const STILL_FRAMES = [
  { out: "01-request.png", clip: "ft-01.mp4", at: 20 },
  { out: "02-hero.png", clip: "ft-02.mp4", at: 1 },
  { out: "02-about.png", clip: "ft-02.mp4", at: 9 },
  { out: "02-menu.png", clip: "ft-02.mp4", at: 14.5 },
  { out: "02-features.png", clip: "ft-02.mp4", at: 21 },
  { out: "02-access.png", clip: "ft-02.mp4", at: 24.6 },
  { out: "03-request.png", clip: "ft-03.mp4", at: 20 },
  { out: "04-before.png", clip: "ft-04.mp4", at: 0.5 },
  { out: "04-after.png", clip: "ft-04.mp4", at: 5 },
];

function filterFor(clip) {
  const [from, to] = clip.range;
  const c = clip.crop;
  let graph = `[0:v]trim=${from}:${to},setpts=PTS-STARTPTS,fps=30,crop=w=${c.w}:h=${c.h}:x='${c.x}':y='${c.y}'`;
  if (clip.blurs.length === 0) return `${graph},format=yuv420p[v]`;
  graph += `,split=${clip.blurs.length + 1}[base]`;
  clip.blurs.forEach((_, i) => (graph += `[b${i}]`));
  clip.blurs.forEach((b, i) => {
    graph += `;[b${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},gblur=sigma=9:steps=3[m${i}]`;
  });
  let last = "base";
  clip.blurs.forEach((b, i) => {
    const next = i === clip.blurs.length - 1 ? "o" : `o${i}`;
    graph += `;[${last}][m${i}]overlay=${b.x}:${b.y}:enable='between(t,${b.from},${b.to})'[${next}]`;
    last = next;
  });
  return `${graph};[o]format=yuv420p[v]`;
}

async function main() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("ffmpeg-static binary not found.");
  fs.mkdirSync(STILLS, { recursive: true });
  for (const clip of CLIPS) {
    const out = path.join(OUT, clip.out);
    if (fs.existsSync(out) && !force) {
      console.log(`skip ${clip.out} (exists; --force to rebuild)`);
      continue;
    }
    console.log(`make ${clip.out} <- ${clip.src}`);
    await run(ffmpegPath, [
      "-v", "error", "-y", "-i", path.join(SRC, clip.src),
      "-filter_complex", filterFor(clip), "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "30",
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
