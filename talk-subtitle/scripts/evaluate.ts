// How well the current cut-candidate defaults reproduce the user's own edit (docs/design.md §15「検証」).
//   npm run evaluate -- --project=<id> [--list] [--limit=N] [--dry-run]
//     reference / evaluation 案件の元動画から、今の既定値で候補を作り（メモリ上だけ）、
//     ユーザーの完成動画から復元したカット（reconstruction.json）と比べる。
//     案件のファイルは何も変えない。結果は style-data/trials/<id>.json（学習には使わない）
//   npm run evaluate -- summary
//     記録済みの検証結果を一覧（新しい動画と、学習に使った動画を分けて平均）

import path from "node:path";
import { parseArgs, runCli, UserError } from "../src/cli.ts";
import { TOOL_ROOT } from "../src/paths.ts";
import { loadProject, writeJsonAtomic } from "../src/project.ts";
import { evaluateProject, listTrials, printTrial, printTrialSummary, trialFile } from "../src/style/evaluate.ts";

await runCli(async () => {
  const args = parseArgs();
  const [command] = args.positional;
  if (command === "summary") {
    printTrialSummary(listTrials());
    return;
  }
  if (command !== undefined) throw new UserError("使い方: npm run evaluate -- --project=<id> [--list] [--dry-run]／npm run evaluate -- summary");
  const project = loadProject(args.get("project"));
  const t = evaluateProject(project);
  const limit = args.get("limit");
  printTrial(t, { list: args.has("list"), limit: limit ? Number(limit) : undefined });
  const rel = path.relative(TOOL_ROOT, trialFile(t.id));
  if (args.has("dry-run")) {
    console.log(`\n[dry-run] ${rel} には書き込んでいません。`);
    return;
  }
  writeJsonAtomic(trialFile(t.id), t);
  console.log(`\n→ ${rel}（案件のファイルは変更していません）`);
});
