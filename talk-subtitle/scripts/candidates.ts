// Step 4: cut candidates → intermediate/cut-candidates.json (nothing is cut).
//   npm run candidates -- --project=<id> [--force]
//   npm run candidates -- --project=<id> --append-retakes [--dry-run]
//     言い直し検出（round 2）の候補だけを追加。既存の候補と承認は変えない。追加分は未決定
//   npm run candidates -- --project=<id> --add-claude=<JSON> [--dry-run]
//     Claude が内容を見て出した提案（言いかけ・撮り直し・重なる話・脱線）を新しい round として追加（proposedBy: claude）。既存の候補と承認は変えない

import { fmtTime, parseArgs, runCli, UserError } from "../src/cli.ts";
import { readJson } from "../src/project.ts";
import type { ClaudeProposal } from "../src/steps.ts";
import { currentCutDecisions, loadDecisions } from "../src/decisions.ts";
import { loadProject } from "../src/project.ts";
import { printCutCandidates } from "../src/report.ts";
import { appendRetakeCandidates, runCandidates } from "../src/steps.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const claudeFile = args.get("add-claude");
  if (args.has("add-claude") && !claudeFile) throw new UserError("--add-claude=<提案の JSON ファイル> を指定してください。");
  if (args.has("append-retakes") || claudeFile) {
    const claude = claudeFile ? readJson<ClaudeProposal[]>(claudeFile) : undefined;
    if (claude && !Array.isArray(claude)) throw new UserError("--add-claude の JSON は提案の配列にしてください。");
    const { added, uncoveredSeconds, written } = appendRetakeCandidates(project, { dryRun: args.has("dry-run"), claude });
    console.log(`${written ? "追加しました" : "[dry-run] 追加予定"}: ${added.length}件（すべて未決定）`);
    added.forEach((a, i) => {
      const d = "detail" in a ? a.detail : undefined;
      console.log(`
${a.id}  ${fmtTime(a.start)}–${fmtTime(a.end)}（${a.duration.toFixed(2)}秒、新たに削れる ${uncoveredSeconds[i]}秒） ${a.kind}${d ? "／" + d.pattern : ""}／${a.suggestion}`);
      if (d) console.log(`  削除候補: 「${d.first}」　残す: 「${d.second}」（${d.keep === "second" ? "2回目を残す" : "1回目を残す"}）　類似度 ${d.similarity}`);
      console.log(`  前: …${a.context.before.slice(-25)}`);
      console.log(`  後: ${a.context.after.slice(0, 30)}…`);
      console.log(`  理由: ${a.reason}`);
    });
    return;
  }
  const cuts = runCandidates(project, { force: args.has("force") });
  printCutCandidates(cuts, currentCutDecisions(loadDecisions(project.paths), cuts).items);
  console.log(`\n次: npm run review -- --project=${project.json.id}`);
});
