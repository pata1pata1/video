// The only way short-movie reaches the shared engine (../../../../remotion,
// or REMOTION_ROOT). Nothing in short-movie installs Remotion: the Remotion
// packages and the headless Chrome are the ones in the shared remotion
// (docs/video-platform-architecture.md, ch. 13).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SHORT_MOVIE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REMOTION_ROOT = path.resolve(process.env.REMOTION_ROOT ?? path.join(SHORT_MOVIE_ROOT, "..", "..", "remotion"));

if (!fs.existsSync(path.join(REMOTION_ROOT, "src", "core"))) {
  throw new Error(`shared remotion not found: ${REMOTION_ROOT} (set REMOTION_ROOT)`);
}

// remotion/src is TypeScript/ESM without "type": "module" (remotion's own npm scripts pass
// --disable-warning=MODULE_TYPELESS_PACKAGE_JSON); hide only that warning.
const warningListeners = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code !== "MODULE_TYPELESS_PACKAGE_JSON") for (const l of warningListeners) l(w);
});

const load = (rel) => import(pathToFileURL(path.join(REMOTION_ROOT, rel)).href);

export const render = await load("src/core/render/nodeApi.mts");
export const media = await load("src/core/media/index.ts");
