// reference projects (a video the user edited elsewhere; docs/design.md §15 S2).
//   npm run reference -- register --project=<id> [--replace]
//     input/reference/ の source/・final/（任意の SRT）と assets/ の一覧を sha256 で記録するだけ（解析はしない）
//   npm run reference -- analyze --project=<id> [--replace] [--force]
//     register ＋ 元動画と完成動画を解析（ffprobe・16kHz 音声）
//   npm run reference -- transcribe --project=<id> [--force] [--backend=…]
//     両方を文字起こし（済んでいれば省略）
//   npm run reference -- reconstruct --project=<id> [--dry-run]
//     元動画と完成動画を比べて、残した区間・削った区間を復元 → intermediate/reconstruction.json
//   npm run reference -- all --project=<id>（横長の元動画・完成動画だけ）
//     上の3つ ＋ npm run style -- observe（evaluation 案件は observe の代わりに npm run evaluate の検証）
//   npm run reference -- show --project=<id> [--list]

import fs from "node:fs";
import { parseArgs, runCli, UserError } from "../src/cli.ts";
import { loadProject, readJson, writeJsonAtomic } from "../src/project.ts";
import { analyzeReference, assertReference, registerReference, transcribeReference } from "../src/reference.ts";
import { evaluateProject, printTrial, trialFile } from "../src/style/evaluate.ts";
import { observationFile, observeProject } from "../src/style/observe.ts";
import { reconstructCuts, writeReconstruction, type Reconstruction } from "../src/style/reconstruct.ts";
import { printObservation, printReconstruction } from "../src/style/report.ts";
import type { Transcript } from "../src/transcript.ts";

await runCli(async () => {
  const args = parseArgs();
  const [command] = args.positional;
  const project = loadProject(args.get("project"));
  assertReference(project);
  const log = (s: string) => console.log(s);
  const sourceWords = () => (fs.existsSync(project.paths.transcript) ? readJson<Transcript>(project.paths.transcript) : null);
  const scope = args.get("scope");
  if (scope !== undefined && scope !== "landscape") throw new UserError("--scope は landscape だけです（talk-subtitle の学習は横長の動画だけ）。");

  // evaluation projects are never learned from: measure the defaults instead of observing.
  const isEvaluation = project.json.learning?.purpose === "evaluation";
  const steps = command === "all" ? ["analyze", "transcribe", "reconstruct", isEvaluation ? "evaluate" : "observe"] : [command];
  if (!steps.every((s) => ["register", "analyze", "transcribe", "reconstruct", "observe", "evaluate", "show"].includes(s))) {
    throw new UserError("使い方: npm run reference -- register|analyze|transcribe|reconstruct|all|show --project=<id>");
  }
  for (const step of steps) {
    if (step === "register") {
      const r = await registerReference(project, { replace: args.has("replace"), log });
      const ref = project.json.reference!;
      console.log(`登録しました（${r.layout === "folders" ? "source/・final/・assets/" : "直下の source.*・final.*（前の形）"}。どれも読み取りのみ）`);
      console.log(`  元動画: ${ref.source.file}`);
      console.log(`  完成動画: ${ref.final.file}${ref.srt ? `　SRT: ${ref.srt.file}` : ""}`);
      console.log(`  素材: ${r.assets ? `${r.assets.count}ファイル → intermediate/reference-assets.json` : "assets/ なし"}`);
      console.log(`\n次: npm run reference -- analyze --project=${project.json.id}`);
    } else if (step === "analyze") {
      const { source, final } = await analyzeReference(project, { replace: args.has("replace"), force: args.has("force"), log });
      const desc = (p: typeof source) => `${p.video?.width}×${p.video?.height} ${p.video?.fps}fps ${p.durationSeconds?.toFixed(1)}秒`;
      console.log(`元動画: ${desc(source)}　完成動画: ${desc(final)}${project.json.reference?.srt ? "　SRT: あり（S3 で使用）" : ""}`);
    } else if (step === "transcribe") {
      await transcribeReference(project, { force: args.has("force"), backend: args.get("backend"), log });
    } else if (step === "reconstruct") {
      const r = reconstructCuts(project, log);
      printReconstruction(r, sourceWords(), { list: args.has("list") || command === "reconstruct" });
      if (args.has("dry-run")) console.log("\n[dry-run] reconstruction.json には書き込んでいません。");
      else {
        writeReconstruction(project, r);
        console.log(`\n→ intermediate/reconstruction.json`);
      }
    } else if (step === "observe") {
      const o = observeProject(project);
      console.log("");
      printObservation(o);
      writeJsonAtomic(observationFile(project.json.id), o);
      console.log(`\n→ style-data/observations/${project.json.id}.json`);
    } else if (step === "evaluate") {
      const t = evaluateProject(project);
      console.log("");
      printTrial(t);
      writeJsonAtomic(trialFile(t.id), t);
      console.log(`\n→ style-data/trials/${t.id}.json（学習データには入りません。一覧は npm run evaluate -- --project=${t.id} --list）`);
    } else if (step === "show") {
      if (!fs.existsSync(project.paths.reconstruction)) throw new UserError("reconstruction.json がまだありません。");
      printReconstruction(readJson<Reconstruction>(project.paths.reconstruction), sourceWords(), { list: args.has("list") });
    }
  }
});
