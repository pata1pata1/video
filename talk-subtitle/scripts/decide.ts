// Records human decisions in input/decisions.json (chat and review.html both land here),
// then refreshes transcript.corrected.json and review.html.
//
//   カット:   --keep=c3,c7  --cut=c1,c2  --cut-rest | --keep-rest  --cut-suggested
//             --range=c4:12.30-13.10（範囲を調整。未決定ならカットにする）  --reset=c5
//   固有名詞: --accept-term=t1  --reject-term=t2  --accept-terms-rest | --reject-terms-rest
//             --term-text=t3:Claude Code（置き換えを指定して採用）  --reset-term=t4
//   HTML:     --import=<review.html で書き出した JSON>
//   共通:     --project=<id>  --dry-run  --discard-stale（候補を作り直した後、古い承認を破棄して承認し直す）
//   表示のみ: --show

import { parseArgs, runCli, UserError } from "../src/cli.ts";
import type { CutCandidatesJson } from "../src/candidates.ts";
import {
  applyOps,
  currentCutDecisions,
  currentTermDecisions,
  emptyOps,
  importExport,
  loadDecisions,
  saveDecisions,
  type DecisionsExport,
} from "../src/decisions.ts";
import { assertWritable, loadProject, readJson, readJsonIfExists } from "../src/project.ts";
import { printCutCandidates, printTermCandidates } from "../src/report.ts";
import { writeReviewHtml } from "../src/review.ts";
import { writeCorrected } from "../src/steps.ts";
import type { TermCandidatesJson } from "../src/terms.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const { paths } = project;
  const cuts = readJsonIfExists<CutCandidatesJson>(paths.cutCandidates);
  const terms = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  const decisions = loadDecisions(paths);
  const dryRun = args.has("dry-run");

  const show = () => {
    if (cuts) printCutCandidates(cuts, currentCutDecisions(decisions, cuts).items);
    if (terms) printTermCandidates(terms, currentTermDecisions(decisions, terms).items);
  };
  if (args.has("show")) {
    show();
    return;
  }
  assertWritable(project);

  let changes: string[];
  const importFile = args.get("import");
  if (importFile) {
    changes = importExport(decisions, readJson<DecisionsExport>(importFile), cuts, terms);
  } else {
    const ops = emptyOps();
    ops.keep = args.all("keep", true);
    ops.cut = args.all("cut", true);
    ops.cutRest = args.has("cut-rest");
    ops.keepRest = args.has("keep-rest");
    ops.cutSuggested = args.has("cut-suggested");
    ops.ranges = args.all("range", true);
    ops.resetCuts = args.all("reset", true);
    ops.acceptTerms = args.all("accept-term", true);
    ops.rejectTerms = args.all("reject-term", true);
    ops.acceptTermsRest = args.has("accept-terms-rest");
    ops.rejectTermsRest = args.has("reject-terms-rest");
    ops.termTexts = args.all("term-text"); // not split on commas: the text may contain one
    ops.resetTerms = args.all("reset-term", true);
    ops.discardStale = args.has("discard-stale");
    changes = applyOps(decisions, ops, cuts, terms, "chat");
    if (changes.length === 0 && Object.values(ops).every((v) => (Array.isArray(v) ? v.length === 0 : !v))) {
      throw new UserError("変更内容を指定してください（例：--keep=c3,c7 --cut-rest）。一覧だけなら --show。");
    }
  }

  if (changes.length === 0) {
    console.log("変更はありません。");
  } else {
    console.log(`${dryRun ? "[dry-run] 変更予定" : "変更しました"}（${changes.length}件）:`);
    for (const c of changes) console.log(`  ${c}`);
  }
  if (!dryRun && changes.length) {
    saveDecisions(paths, decisions);
    writeCorrected(project);
    if (cuts) writeReviewHtml(project);
    console.log("→ input/decisions.json を更新し、transcript.corrected.json と review.html を作り直しました。\n");
  }
  show();
});
