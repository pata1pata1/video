// Step 1: register the source in input/ and analyze it (read-only on the source).
//   npm run analyze -- --project=<id> [--source=<input/ 内のファイル名>] [--replace-source] [--force]

import { parseArgs, runCli } from "../src/cli.ts";
import { analyzeProject } from "../src/analyze.ts";
import { loadProject } from "../src/project.ts";
import { printAnalysis } from "../src/summary.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const result = await analyzeProject(project, {
    source: args.get("source"),
    replaceSource: args.has("replace-source"),
    force: args.has("force"),
    log: (s) => console.error(s),
  });
  printAnalysis(project, result);
});
