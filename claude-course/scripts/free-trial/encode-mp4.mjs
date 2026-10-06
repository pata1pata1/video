// Kept for the commands recorded for the free trial video:
//   node scripts/free-trial/encode-mp4.mjs <frames-dir> [out.mp4]
// is the same as
//   node scripts/video/encode-mp4.mjs --lesson=free-trial <frames-dir> <out.mp4>
// (the encoder itself lives in scripts/video/encode-mp4.mjs).

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [framesDir, outArg] = process.argv.slice(2);
if (!framesDir) {
  console.error("Usage: node scripts/free-trial/encode-mp4.mjs <frames-dir> [out.mp4]");
  process.exit(1);
}
process.argv = [
  process.argv[0],
  path.join(ROOT, "scripts", "video", "encode-mp4.mjs"),
  "--lesson=free-trial",
  framesDir,
  outArg ?? path.join(ROOT, "out", "free-trial", "free-trial-preview.mp4"),
];
await import("../video/encode-mp4.mjs");
