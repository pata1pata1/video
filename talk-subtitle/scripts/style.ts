// Editing-style learning (docs/design.md §15). S1: observe only — nothing is applied.
//   npm run style -- observe --project=<id> [--no-examples] [--dry-run]（横長の動画だけ）
//     案件の承認・字幕の修正などを読み、style-data/observations/<id>.json に記録する（案件のファイルは変えない）
//   npm run style -- show --project=<id>
//     記録済みの観察を表示する

import fs from "node:fs";
import path from "node:path";
import { parseArgs, runCli, UserError } from "../src/cli.ts";
import { TOOL_ROOT } from "../src/paths.ts";
import { loadProject, readJson, writeJsonAtomic } from "../src/project.ts";
import type { Observation } from "../src/style/observation.ts";
import { observationFile, observeProject } from "../src/style/observe.ts";
import { printObservation } from "../src/style/report.ts";

await runCli(async () => {
  const args = parseArgs();
  const [command] = args.positional;
  const project = loadProject(args.get("project"));
  const file = observationFile(project.json.id);
  const rel = path.relative(TOOL_ROOT, file);

  if (command === "observe") {
    const scope = args.get("scope");
    if (scope !== undefined && scope !== "landscape") throw new UserError("--scope は landscape だけです（talk-subtitle の学習は横長の動画だけ）。");
    const o = observeProject(project, { examples: !args.has("no-examples") });
    printObservation(o);
    if (args.has("dry-run")) {
      console.log(`\n[dry-run] ${rel} には書き込んでいません。`);
      return;
    }
    const replaced = fs.existsSync(file);
    writeJsonAtomic(file, o);
    console.log(`\n→ ${rel}（${replaced ? "前回の観察を置き換え" : "新規"}）`);
    return;
  }
  if (command === "show") {
    if (!fs.existsSync(file)) throw new UserError(`${rel} がありません。npm run style -- observe --project=${project.json.id} を実行してください。`);
    printObservation(readJson<Observation>(file));
    return;
  }
  throw new UserError("使い方: npm run style -- observe|show --project=<id>");
});
