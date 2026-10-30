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
// Run with no arguments for every option.

import { movieTrivia } from "./lib/engine.mjs";

try {
  process.exitCode = await movieTrivia.runMovieTriviaCli(process.argv.slice(2));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
