// Creates projects/<video-id>/ (never overwrites).
//   npm run new -- --id=sample-video-01 [--dry-run]

import path from "node:path";
import { parseArgs, requireOpt, runCli } from "../src/cli.ts";
import { createProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const id = requireOpt(args, "id", "例：--id=sample-video-01");
  const dryRun = args.has("dry-run");
  const paths = createProject(id, { dryRun });
  console.log(`${dryRun ? "[dry-run] 作成予定" : "作成しました"}: ${paths.root}`);
  console.log(`  project.json, input/, audio/, intermediate/, review/, output/`);
  console.log(`\n次の手順:`);
  console.log(`  1. 元動画を ${path.join(paths.input, "<元動画>.mp4")} に置く（コピー。元動画は変更・削除しません）`);
  console.log(`  2. 固有名詞があれば Claude に自然な文で伝える（例：「人物名は北岡大樹、読みは きたおか だいき」）`);
  console.log(`  3. npm run phase1 -- --project=${id}`);
});
