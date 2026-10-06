// Turns each picked stock video into a 30 fps JPEG sequence sized for the card.
//
//   node scripts/prepare-media.mjs --script=<id> [--force]
//   -> public/media/<id>/frames/<sceneId>/0001.jpg ... and public/media/<id>/frames.json ({ sceneId: count })
//
// Why: on this PC the video is rendered with <Html5Video> (the browser seeks
// the clip for every frame), and that seek is not frame-accurate — measured
// on the otter clip it jumped back up to 6 frames, 45 times in 150 frames,
// which shows up as shaking. With one image per output frame, frame N always
// shows exactly source time N/30 (ffmpeg's fps filter does the 25/24/60 fps -> 30
// conversion once, evenly).

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;
/** Footage fills the whole frame (src/scenes.tsx). */
const CARD = { width: 1920, height: 1080 };

const id = process.argv.find((a) => a.startsWith("--script="))?.split("=")[1];
const force = process.argv.includes("--force");
if (!id) {
  console.error("Usage: node scripts/prepare-media.mjs --script=<id> [--force]");
  process.exit(1);
}
const mediaDir = path.join(ROOT, "public", "media", id);
const sources = JSON.parse(fs.readFileSync(path.join(mediaDir, "sources.json"), "utf8"));
const narration = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "audio", id, "narration.json"), "utf8"));
const indexPath = path.join(mediaDir, "frames.json");
const index = fs.existsSync(indexPath) && !force ? JSON.parse(fs.readFileSync(indexPath, "utf8")) : {};

/** How long the scene is on screen (same lead as src/timeline.ts), so we never extract more than is shown. */
function sceneSeconds(sceneId) {
  const i = narration.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) return null;
  const next = narration.scenes[i + 1];
  return (next ? next.start : narration.durationSeconds) - narration.scenes[i].start + 0.4 + 0.5;
}

/** Footage keyed by the script's `media` map (not a scene) is looped, so this much is enough. */
const SHARED_MAX_SECONDS = 20;

for (const [sceneId, rec] of Object.entries(sources)) {
  if (rec.mediaType !== "video") continue;
  const seconds = Math.min(rec.durationSeconds ?? Infinity, sceneSeconds(sceneId) ?? SHARED_MAX_SECONDS);
  const dir = path.join(mediaDir, "frames", sceneId);
  if (index[sceneId] && fs.existsSync(dir)) {
    console.log(`${sceneId}: already prepared (${index[sceneId]} frames)`);
    continue;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await run(ffmpegPath, [
    "-v", "error", "-y",
    "-i", path.join(ROOT, "public", rec.file),
    "-t", seconds.toFixed(3),
    "-vf", `fps=${FPS},scale=${CARD.width}:${CARD.height}:force_original_aspect_ratio=increase,crop=${CARD.width}:${CARD.height}`,
    "-q:v", "4",
    path.join(dir, "%04d.jpg"),
  ]);
  const count = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).length;
  if (count === 0) throw new Error(`${sceneId}: no frames extracted`);
  index[sceneId] = count;
  console.log(`${sceneId}: ${count} frames (${(count / FPS).toFixed(1)} s)`);
}
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
