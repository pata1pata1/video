// Renders a production with the shared remotion's Node API (no node_modules in
// the production, no junction to another project).
//
//   node scripts/render.mjs --production=<id>                      silent JPEG sequence -> productions/<id>/frames/
//   node scripts/render.mjs --production=<id> --force              same, after emptying frames/
//   node scripts/render.mjs --production=<id> --still=<png> --frame=N [--frame=M ...]
//                                                                  representative frames (PNG; N inserted before .png when several)
//
// Then encode as before: bash productions/<id>/scripts/encode.sh
//
// A production that still has its own node_modules (the old junction to
// ../movie-trivia/node_modules) is refused: it stays on the old method
// (robot-ai-20261030 is finished that way).

import fs from "node:fs";
import path from "node:path";
import { SHORT_MOVIE_ROOT, render } from "./lib/engine.mjs";

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const all = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const id = opt("production");
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error("Usage: node scripts/render.mjs --production=<id> [--force] | [--still=<png> --frame=N ...]");
  process.exit(1);
}
const appRoot = path.join(SHORT_MOVIE_ROOT, "productions", id);
if (fs.existsSync(path.join(appRoot, "node_modules"))) {
  throw new Error(`productions/${id} has its own node_modules (old method): render it with its own remotion CLI, or remove the junction link first`);
}
if (!fs.existsSync(path.join(appRoot, "script.json"))) throw new Error(`no production ${id} (${appRoot})`);

console.log(`bundling productions/${id} with ${render.headlessBrowserExecutable() ? "remotion's headless Chrome" : "the default browser"}`);
const serveUrl = await render.bundleApp({
  app: { appRoot, entryPoint: "src/index.ts" },
  publicDir: path.join(appRoot, "public"),
  sharedModulesOnly: true,
});

const still = opt("still");
if (still) {
  const frames = all("frame").map(Number);
  if (frames.length === 0 || frames.some((n) => !Number.isInteger(n) || n < 0)) throw new Error("--still needs --frame=N");
  for (const frame of frames) {
    const output = path.resolve(frames.length > 1 ? still.replace(/\.png$/i, `-${frame}.png`) : still);
    await render.renderStillImage({ serveUrl, compositionId: "Short", output, frame });
    console.log(`wrote ${output}`);
  }
} else {
  const outputDir = path.join(appRoot, "frames");
  if (args.includes("--force")) fs.rmSync(outputDir, { recursive: true, force: true });
  const t0 = Date.now();
  const { frameCount } = await render.renderImageSequence({
    serveUrl,
    compositionId: "Short",
    outputDir,
    imageFormat: "jpeg",
    jpegQuality: 95,
    onProgress: (n) => process.stdout.write(`\r${n} frames`),
  });
  console.log(`\r${frameCount} frames -> productions/${id}/frames (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
