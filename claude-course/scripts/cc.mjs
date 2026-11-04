// claude-course production commands, run on the shared remotion
// (scripts/lib/engine.mjs -> remotion src/video-types/claude-course/cli.mjs).
//
//   node scripts/cc.mjs new       --project=<id>
//   node scripts/cc.mjs narration --project=<id> [--dry-run [--kana]] [--force] [--line=<id>]
//   node scripts/cc.mjs captions  --project=<id>
//   node scripts/cc.mjs render    --project=<id> [--force] | [--still=<png> --frame=N ...]
//   node scripts/cc.mjs encode    --project=<id> [--force]
//
// The finished videos free-trial・sales-intro are migration fixtures in
// their old places (L01 was cleaned up 2026-11-05): --lesson=free-trial|sales-intro with
// --out-dir=<dir outside claude-course> (they are never overwritten).
// Settings: course.json. Script rules: scripts/lib/lesson.mjs, captions.mjs.

import { claudeCourse } from "./lib/engine.mjs";

process.exitCode = await claudeCourse.runClaudeCourseCli(process.argv.slice(2));
