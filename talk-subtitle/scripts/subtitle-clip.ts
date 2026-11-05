// A short check clip before the full render: cut.mp4 with the approved subtitles burned in,
// in the project's subtitle style (input/subtitle-style.json).
//   npm run subtitle-clip -- --project=<id> [--from=秒 --to=秒]
// Without --from/--to: a 10–15 s stretch that has both one-line and two-line subtitles.
// → review/subtitle-clip-<from>-<to>.mp4. output/final.mp4 is not touched.

import path from "node:path";
import fs from "node:fs";
import { approvedBurnCues, burnRange, loudnormFilter, prepareRenderAudio } from "../src/burn.ts";
import { fmtTime, parseArgs, runCli, UserError } from "../src/cli.ts";
import { assertWritable, loadProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const { paths, json } = project;
  assertWritable(project);
  const plan = await approvedBurnCues(paths, json.id);

  let from: number;
  let to: number;
  if (args.get("from") || args.get("to")) {
    from = Number(args.get("from"));
    to = Number(args.get("to"));
    if (!(from >= 0 && to > from && to <= plan.duration)) throw new UserError("--from / --to は cut.mp4 の範囲の秒で指定してください。");
  } else {
    // Whole cues only: from just before one cue to just after another, never showing part of a
    // neighbour. Prefer both kinds more than once, and ordinary sentences over runs of short replies.
    const { cues } = plan;
    let best: { from: number; to: number; score: number } | null = null;
    for (let i = 0; i < cues.length; i++) {
      for (let j = i; j < cues.length; j++) {
        const f = Math.max(cues[i - 1]?.end ?? 0, cues[i].start - 0.3);
        const t = Math.min(cues[j + 1]?.start ?? plan.duration, cues[j].end + 0.3);
        if (t - f > 15) break;
        if (t - f < 10) continue;
        const span = cues.slice(i, j + 1);
        const one = span.filter((c) => c.lines.length === 1).length;
        const two = span.length - one;
        // Both kinds when the video has both (an all-one-line video: one-line cues only).
        if (!one || (!two && plan.cues.some((c) => c.lines.length === 2))) continue;
        const score = Math.min(one, two, 2) * 2 + span.filter((c) => c.end - c.start >= 1.5).length - span.filter((c) => c.end - c.start < 1.5).length;
        if (!best || score > best.score) best = { from: f, to: t, score };
      }
    }
    if (!best) throw new UserError("1行と2行の字幕が両方入る 10〜15 秒の区間が見つかりません。--from / --to で指定してください。");
    ({ from, to } = best);
  }

  const tag = (s: number) => fmtTime(s).replace(/[:.]/g, "");
  const output = path.join(paths.review, `subtitle-clip-${tag(from)}-${tag(to)}.mp4`);
  console.log(`確認動画を作成中: cut.mp4 ${fmtTime(from)}–${fmtTime(to)}（${(to - from).toFixed(1)}秒）、preset ${plan.preset.name}`);
  // Same picture and sound as the final render: brightness, BGM and loudness (-14 LUFS, measured over the whole video).
  const mix = await prepareRenderAudio(paths, plan.duration);
  if (mix) console.log(`  BGM: ${mix.bgm}（声より ${mix.belowVoiceDb} LU 下）`);
  const { filter: audioFilter } = await loudnormFilter(mix?.file ?? paths.cutFinal, -14, -1.5);
  const used = await burnRange(paths, plan, from, to, output, { audioFilter, audioInput: mix?.file });
  if (mix) fs.rmSync(path.dirname(mix.file), { recursive: true, force: true });
  for (const c of used) console.log(`  ${c.id}  ${fmtTime(c.start)}–${fmtTime(c.end)}  ${c.lines.length}行  「${c.lines.join(" ／ ")}」`);
  console.log(`→ ${path.relative(paths.root, output)}`);
});
