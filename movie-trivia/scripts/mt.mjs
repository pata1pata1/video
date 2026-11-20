// movie-trivia production commands on the shared remotion engine (2026-10-30,
// Phase 2). Each video is a project folder movie-trivia/<id>/ (project.json,
// input/ audio/ assets/ intermediate/ output/); the implementation is
// ../../remotion/src/video-types/movie-trivia/cli.mjs, reached only through
// scripts/lib/engine.mjs.
//
//   node scripts/mt.mjs new --project=<id> [--pattern=pattern-03]
//   node scripts/mt.mjs narration --project=<id> [--dry-run]
//   node scripts/mt.mjs pexels candidates|pick --project=<id> ...
//   node scripts/mt.mjs prepare-media --project=<id>
//   node scripts/mt.mjs render --project=<id>            (frames, shared remotion's Node API)
//   node scripts/mt.mjs encode --project=<id>            (MP4 -> <id>/output/<id>.mp4)
//   node scripts/mt.mjs thumbnails | chapters | credits | switch --project=<id>
//
// content-ops の制作依頼（news-long）で作る動画は scripts/production.mjs（PRODUCTION-HANDOFF.md）。紐付いた動画は narration・render・encode の前に関所を通る
//
// Run with no arguments for every option.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { movieTrivia } from "./lib/engine.mjs";

// content-ops の制作依頼に紐付いた動画（<id>/input/production.json がある。scripts/production.mjs import が作る）は、
// ナレーション（VOICEVOX）・書き出し（render・encode）の前に関所を通す：依頼が ready・素材と承認がそろっている・台本の検証を通過・検証の後に台本が変わっていない
const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);
const gated = ["narration", "render", "encode"].includes(args[0]) && !(args[0] === "narration" && args.includes("--dry-run")) && !(args[0] === "render" && args.some((a) => a.startsWith("--still")));
const root = path.resolve(process.env.MOVIE_TRIVIA_PROJECTS_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
if (gated && project && fs.existsSync(path.join(root, project, "input", "production.json"))) {
  const { main: production } = await import("./production.mjs");
  if ((await production(["gate", `--project=${project}`])) !== 0) {
    console.error(`stopped: ${project} は content-ops の制作依頼の関所を通っていません（node scripts/production.mjs gate --project=${project}）`);
    process.exit(1);
  }
}

try {
  process.exitCode = await movieTrivia.runMovieTriviaCli(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
