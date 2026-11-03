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
// Run with no arguments for every option.

import { shortMovie } from "./lib/engine.mjs";

try {
  process.exitCode = await shortMovie.runShortMovieCli(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
