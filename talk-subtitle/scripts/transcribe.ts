// Step 2: local speech-to-text with the glossary as prompt → intermediate/transcript.json.
//   npm run transcribe -- --project=<id> [--backend=auto|whisper-cpp|faster-whisper]
//     [--model=large-v3-turbo] [--language=ja] [--force] [--dry-run]
// auto: Windows → faster-whisper, Mac → whisper-cpp (input/settings.json の transcribe.backend でも指定可)

import { parseArgs, runCli } from "../src/cli.ts";
import { loadProject } from "../src/project.ts";
import { runTranscribe } from "../src/steps.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const dryRun = args.has("dry-run");
  const { transcript: t } = await runTranscribe(project, {
    force: args.has("force"),
    backend: args.get("backend"),
    model: args.get("model"),
    language: args.get("language"),
    dryRun,
    log: (s) => console.error(s),
  });
  if (!t) return;
  const e = t.engine;
  const words = t.segments.reduce((n, s) => n + s.words.length, 0);
  console.log(`文字起こし: ${t.segments.length}文・${words}語、${t.processingSeconds.toFixed(0)}秒で完了（${e.name} ${e.version} / ${e.model}${e.computeType ? ` ${e.computeType}` : ""}）→ intermediate/transcript.json`);
  console.log(t.text);
  console.log(`\n次: npm run terms -- --project=${project.json.id}`);
});
