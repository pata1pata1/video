// Where a project is in the flow, and what still needs a human decision. Read-only.
//   npm run status -- --project=<id>

import { parseArgs, runCli } from "../src/cli.ts";
import { loadProject } from "../src/project.ts";
import { printStatus } from "../src/summary.ts";

await runCli(async () => {
  const args = parseArgs();
  printStatus(loadProject(args.get("project")));
});
