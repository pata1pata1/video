// The only way movie-trivia reaches the shared engine (../../../../remotion,
// or REMOTION_ROOT): movie-trivia -> scripts/lib/engine.mjs -> remotion's
// core / render / Node API (src/video-types/movie-trivia/). Remotion, React,
// the fonts and the headless Chrome are the shared remotion's; nothing here
// imports another remotion path directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MOVIE_TRIVIA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REMOTION_ROOT = path.resolve(process.env.REMOTION_ROOT ?? path.join(MOVIE_TRIVIA_ROOT, "..", "..", "remotion"));

if (!fs.existsSync(path.join(REMOTION_ROOT, "src", "video-types", "movie-trivia"))) {
  throw new Error(`shared remotion (with src/video-types/movie-trivia) not found: ${REMOTION_ROOT} (set REMOTION_ROOT)`);
}

// remotion/src is TypeScript/ESM without "type": "module" (remotion's own npm scripts pass
// --disable-warning=MODULE_TYPELESS_PACKAGE_JSON); hide only that warning.
const warningListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") for (const l of warningListeners) l(w);
});

const load = (rel) => import(pathToFileURL(path.join(REMOTION_ROOT, rel)).href);

/** runMovieTriviaCli(argv) and loadVideo(files) of the movie-trivia video type. */
export const movieTrivia = await load("src/video-types/movie-trivia/cli.mjs");
