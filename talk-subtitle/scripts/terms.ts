// Step 3: proper-noun correction candidates from the glossary
// → intermediate/term-candidates.json, transcript.corrected.json.
//   npm run terms -- --project=<id> [--force]

import { parseArgs, runCli } from "../src/cli.ts";
import { currentTermDecisions, loadDecisions } from "../src/decisions.ts";
import { loadProject } from "../src/project.ts";
import { printTermCandidates } from "../src/report.ts";
import { runTerms } from "../src/steps.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const { json, entries, corrected, carried } = runTerms(project, { force: args.has("force") });
  if (carried.length) console.log(`承認を引き継ぎ（番号の変更）: ${carried.map((c) => `${c.from}→${c.to}`).join(", ")}`);
  console.log(`辞書: ${entries.length}語（案件 ${entries.filter((e) => e.layer === "project").length}／共通 ${entries.filter((e) => e.layer === "shared").length}）`);
  printTermCandidates(json, currentTermDecisions(loadDecisions(project.paths), json).items);
  console.log(`補正を反映した文字起こし: ${corrected.applied}か所 → intermediate/transcript.corrected.json`);
  if (corrected.stale) console.log("※ 以前の補正の承認は今の候補に対応しないため使っていません。承認し直してください。");
});
