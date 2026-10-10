// Runs Phase 1 in order: analyze → transcribe → terms → candidates → review.
// Steps already done are skipped (transcription is slow); nothing is cut.
//   npm run phase1 -- --project=<id> [--source=<input/ 内のファイル名>] [--retranscribe]
//     [--backend=auto|whisper-cpp|faster-whisper]

import fs from "node:fs";
import { analyzeProject } from "../src/analyze.ts";
import { parseArgs, runCli } from "../src/cli.ts";
import { currentCutDecisions, currentTermDecisions, loadDecisions } from "../src/decisions.ts";
import { loadProject } from "../src/project.ts";
import { printCutCandidates, printTermCandidates } from "../src/report.ts";
import { runCandidates, runReview, runTerms, runTranscribe } from "../src/steps.ts";
import { printAnalysis } from "../src/summary.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const log = (s: string) => console.error(s);

  console.log("■ 1/5 解析");
  const analysis = await analyzeProject(project, { source: args.get("source"), log });
  printAnalysis(project, analysis);

  console.log("\n■ 2/5 文字起こし");
  if (fs.existsSync(project.paths.transcript) && !args.has("retranscribe")) {
    console.log("文字起こし済みなので省略（やり直すなら --retranscribe）");
  } else {
    const { transcript: t } = await runTranscribe(project, { force: args.has("retranscribe"), backend: args.get("backend"), log });
    console.log(`${t!.segments.length}文、${t!.processingSeconds.toFixed(0)}秒で完了（${t!.engine.name}）`);
  }

  console.log("\n■ 3/5 固有名詞の補正候補");
  const { json: terms, entries } = runTerms(project);
  console.log(`辞書: ${entries.length}語`);
  printTermCandidates(terms, currentTermDecisions(loadDecisions(project.paths), terms).items);

  console.log("\n■ 4/5 カット候補");
  const cuts = runCandidates(project);
  printCutCandidates(cuts, currentCutDecisions(loadDecisions(project.paths), cuts).items, { limit: 40 });

  console.log("\n■ 5/5 確認用ページ");
  console.log(runReview(project));
  console.log("\n元動画は変更していません。カットはまだ行っていません。");
});
