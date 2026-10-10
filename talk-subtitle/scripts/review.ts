// Step 5: review/review.html (open it in a browser).
//   npm run review -- --project=<id>

import { parseArgs, runCli } from "../src/cli.ts";
import { loadProject } from "../src/project.ts";
import { runReview } from "../src/steps.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const file = runReview(project);
  console.log(`確認用ページ: ${file}`);
  console.log("ブラウザで開いて、カット候補・固有名詞を確認してください。");
});
