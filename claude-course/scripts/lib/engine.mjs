// The only way claude-course reaches the shared engine (../../../../remotion,
// or REMOTION_ROOT): claude-course -> scripts/lib/engine.mjs -> remotion's
// core / render / Node API (src/video-types/claude-course/). VOICEVOX, WAV,
// SRT / VTT, ffmpeg / ffprobe, loudness, rendering, project.json and cleanup are
// the shared remotion's; nothing in claude-course imports another remotion path
// or installs Remotion for production.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CLAUDE_COURSE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REMOTION_ROOT = path.resolve(process.env.REMOTION_ROOT ?? path.join(CLAUDE_COURSE_ROOT, "..", "..", "remotion"));

if (!fs.existsSync(path.join(REMOTION_ROOT, "src", "video-types", "claude-course"))) {
  throw new Error(`shared remotion (with src/video-types/claude-course) not found: ${REMOTION_ROOT} (set REMOTION_ROOT)`);
}

// remotion/src is TypeScript/ESM without "type": "module" (remotion's own npm scripts pass
// --disable-warning=MODULE_TYPELESS_PACKAGE_JSON); hide only that warning.
const warningListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") for (const l of warningListeners) l(w);
});

const load = (rel) => import(pathToFileURL(path.join(REMOTION_ROOT, rel)).href);

/** runClaudeCourseCli(argv) of the claude-course video type (scripts/cc.mjs). */
export const claudeCourse = await load("src/video-types/claude-course/cli.mjs");
/** ffmpeg through the shared engine (runTool), for the recording prep scripts. */
export const media = await load("src/core/media/index.ts");
