// Creates projects/<video-id>/ (never overwrites).
//   npm run new -- --id=sample-video-01 [--dry-run]
//   npm run new -- --id=ref-sample-01 --kind=reference   （別のソフトで編集した動画を学習用に置く案件）

import path from "node:path";
import { parseArgs, requireOpt, runCli, UserError } from "../src/cli.ts";
import { createProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const id = requireOpt(args, "id", "例：--id=sample-video-01");
  const dryRun = args.has("dry-run");
  const kind = args.get("kind") ?? "production";
  if (kind !== "production" && kind !== "reference") throw new UserError("--kind は production か reference です。");
  const paths = createProject(id, { dryRun, kind });
  console.log(`${dryRun ? "[dry-run] 作成予定" : "作成しました"}: ${paths.root}${kind === "reference" ? "（reference：学習用）" : ""}`);
  console.log(`  project.json, input/, audio/, intermediate/, review/, output/${kind === "reference" ? ", input/reference/" : ""}`);
  console.log(`\n次の手順:`);
  if (kind === "reference") {
    console.log(`  1. ${paths.referenceDir} に置く（コピー。元のファイルは変更・削除しません）`);
    console.log(`       source.<拡張子>  撮影した元動画（横長）`);
    console.log(`       final.<拡張子>   編集した完成動画（横長）`);
    console.log(`       subtitles.srt    字幕（任意）`);
    console.log(`  2. npm run reference -- all --project=${id}`);
    return;
  }
  console.log(`  1. 元動画を ${path.join(paths.input, "<元動画>.mp4")} に置く（コピー。元動画は変更・削除しません）`);
  console.log(`  2. 固有名詞があれば Claude に自然な文で伝える（例：「人物名は北岡大樹、読みは きたおか だいき」）`);
  console.log(`  3. npm run phase1 -- --project=${id}`);
});
