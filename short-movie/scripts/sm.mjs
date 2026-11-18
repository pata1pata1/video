// short-movie production commands on the shared remotion engine (2026-11, Phase 3).
// Each video is a project folder short-movie/<id>/ (project.json, input/ assets/
// audio/ intermediate/ output/) with data only; the app is the template folder
// templates/<name>/ (one copy for every video). The implementation is
// ../../remotion/src/video-types/short-movie/cli.mjs, reached only through
// scripts/lib/engine.mjs.
//
//   node scripts/sm.mjs new --project=<id> [--template=news-short-top]
//   node scripts/sm.mjs narration --project=<id> [--dry-run]
//   node scripts/sm.mjs render --project=<id> [--force]               (frames, shared remotion's Node API)
//   node scripts/sm.mjs render --project=<id> --still=<png> --frame=N  (representative frames)
//   node scripts/sm.mjs encode --project=<id> [--force]               (MP4 -> <id>/output/<id>.mp4)
//
// A video linked to a content-ops production request (<id>/input/production.json, made by
// scripts/production.mjs import) must pass `production.mjs gate` before narration/render/encode.
//
// Run with no arguments for every option.

import fs from "node:fs";
import path from "node:path";
import { main as production } from "./production.mjs";
import { projectDir } from "./lib/production/paths.mjs";

// content-ops の制作依頼に紐付いた動画（<id>/input/production.json がある）は、ナレーション（VOICEVOX）・レンダリング・書き出しの前に
// 関所を通す：依頼が ready で期限内・台本の検証を通過・検証の後に台本が変わっていない（scripts/production.mjs gate）。
// 読みの確認（narration --dry-run）は止めない。
const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);
const gated = ["narration", "render", "encode"].includes(args[0]) && !(args[0] === "narration" && args.includes("--dry-run"));
if (gated && project && fs.existsSync(path.join(projectDir(project), "input", "production.json"))) {
  if ((await production(["gate", `--project=${project}`])) !== 0) {
    console.error(`stopped: ${project} は content-ops の制作依頼の関所を通っていません（node scripts/production.mjs gate --project=${project}）`);
    process.exit(1);
  }
}

const { shortMovie } = await import("./lib/engine.mjs");

try {
  process.exitCode = await shortMovie.runShortMovieCli(args);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
