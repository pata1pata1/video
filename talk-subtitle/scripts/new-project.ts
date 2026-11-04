// Creates projects/<video-id>/ (never overwrites).
//   npm run new -- --id=sample-video-01 [--dry-run]
//   npm run new -- --id=ref-sample-01 --kind=reference   （別のソフトで編集した動画を学習用に置く案件）
//   npm run new -- --id=eval-landscape-001 --kind=evaluation （同じ形で、学習には使わず再現度を測る案件）

import path from "node:path";
import { parseArgs, requireOpt, runCli, UserError } from "../src/cli.ts";
import { createProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const id = requireOpt(args, "id", "例：--id=sample-video-01");
  const dryRun = args.has("dry-run");
  const kind = args.get("kind") ?? "production";
  if (kind !== "production" && kind !== "reference" && kind !== "evaluation") throw new UserError("--kind は production・reference・evaluation のどれかです。");
  const paths = createProject(id, { dryRun, kind });
  const isRef = kind !== "production";
  const label = kind === "reference" ? "（reference：学習用）" : kind === "evaluation" ? "（evaluation：再現度の検証用。学習には使いません）" : "";
  console.log(`${dryRun ? "[dry-run] 作成予定" : "作成しました"}: ${paths.root}${label}`);
  console.log(`  project.json, input/, audio/, intermediate/, review/, output/${isRef ? ", input/reference/{source,assets,final}/" : ""}`);
  console.log(`\n次の手順:`);
  if (isRef) {
    console.log(`  1. ${paths.referenceDir} の中に置く（コピー。元のファイルは変更・削除しません）`);
    console.log(`       source/  撮影した元動画（横長）を1本`);
    console.log(`       final/   編集した完成動画（横長）を1本。SRT があれば1つ`);
    console.log(`       assets/  編集に使った画像・動画素材など（複数・サブフォルダ可。一覧と sha256 だけ記録）`);
    console.log(`  2. npm run reference -- register --project=${id}（登録だけ）`);
    if (kind === "evaluation") {
      console.log(`  3. npm run reference -- all --project=${id}（解析・文字起こし・復元・検証。学習データには記録しません）`);
      console.log(`  4. npm run evaluate -- summary（これまでの検証の一覧）`);
    } else console.log(`  3. npm run reference -- all --project=${id}（解析・文字起こし・復元・観察）`);
    return;
  }
  console.log(`  1. 元動画を ${path.join(paths.input, "<元動画>.mp4")} に置く（コピー。元動画は変更・削除しません）`);
  console.log(`  2. 固有名詞があれば Claude に自然な文で伝える（例：「人物名は北岡大樹、読みは きたおか だいき」）`);
  console.log(`  3. npm run phase1 -- --project=${id}`);
});
