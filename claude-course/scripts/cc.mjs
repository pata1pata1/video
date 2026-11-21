// claude-course production commands, run on the shared remotion
// (scripts/lib/engine.mjs -> remotion src/video-types/claude-course/cli.mjs).
//
//   node scripts/cc.mjs new       --project=<id>
//   node scripts/cc.mjs narration --project=<id> [--dry-run [--kana]] [--force] [--line=<id>]
//   node scripts/cc.mjs captions  --project=<id>
//   node scripts/cc.mjs render    --project=<id> [--force] | [--still=<png> --frame=N ...]
//   node scripts/cc.mjs encode    --project=<id> [--force]
//
// The finished videos free-trial・sales-intro are regression fixtures in
// their old places (L01 was cleaned up 2026-11-05): --lesson=free-trial|sales-intro with
// --out-dir=<dir outside claude-course> (they are never overwritten).
// Settings: course.json. Script rules: scripts/lib/lesson.mjs, captions.mjs.

import fs from "node:fs";
import path from "node:path";
import { CLAUDE_COURSE_ROOT, claudeCourse } from "./lib/engine.mjs";

// A project linked to a content-ops production request (input/production.json, scripts/production.mjs import, 2026-11-22:
// the tool demo videos) must pass `production.mjs gate` before narration / render / encode (the same rule as short-movie).
const args = process.argv.slice(2);
const project = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);
const gated = ["narration", "render", "encode"].includes(args[0]) && !(args[0] === "narration" && args.includes("--dry-run"));
if (gated && project && fs.existsSync(path.join(CLAUDE_COURSE_ROOT, project, "input", "production.json"))) {
  const { main } = await import("./production.mjs");
  if ((await main(["gate", `--project=${project}`])) !== 0) {
    console.error(`stopped: ${project} は content-ops の制作依頼の関所を通っていません（node scripts/production.mjs gate --project=${project}）`);
    process.exit(1);
  }
}

process.exitCode = await claudeCourse.runClaudeCourseCli(args);
