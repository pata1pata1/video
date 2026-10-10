// Proper-noun glossary (project: input/glossary.json, shared: _shared/glossary.json).
//
//   npm run glossary -- list    --project=<id>                    （案件＋共通を合わせて表示）
//   npm run glossary -- add     --project=<id>|--shared --surface=北岡大樹 --kind=person
//                               [--reading="きたおか だいき"]… [--reading-unconfirmed]
//                               [--alias=北岡さん]… [--misrecognition=北丘大気]… [--hint=代表]…
//                               [--note=…] [--policy=suggest-only] [--name-context-only] [--source=user-instruction|manual] [--dry-run]
//   npm run glossary -- update  （add と同じ引数。既存の語に読み・別表記・誤認識を追記。--confirm-reading で読みを確認済みに）
//   npm run glossary -- remove  --project=<id>|--shared --id=<id または正式表記> [--dry-run]
//   npm run glossary -- prompt  --project=<id>                    （Whisper に渡す prompt を表示）
//
// kind: person 人物名 / company 会社名 / store 店名 / product 商品名 / place 地名 /
//       term 専門用語 / english 英語表記 / other その他

import { parseArgs, requireOpt, runCli, UserError } from "../src/cli.ts";
import { loadSettings } from "../src/config.ts";
import {
  describeEntry,
  GLOSSARY_KINDS,
  loadGlossaryFile,
  loadMergedGlossary,
  removeEntry,
  saveGlossaryFile,
  upsertEntry,
  whisperPrompt,
  type GlossaryEntry,
} from "../src/glossary.ts";
import { SHARED_GLOSSARY } from "../src/paths.ts";
import { assertWritable, loadProject } from "../src/project.ts";

await runCli(async () => {
  const args = parseArgs();
  const command = args.positional[0];
  const shared = args.has("shared");
  const dryRun = args.has("dry-run");
  const project = shared && !args.get("project") ? null : loadProject(args.get("project"));

  if (command === "list" || command === "prompt") {
    const entries = loadMergedGlossary(project?.paths.glossary ?? null);
    if (command === "list") {
      if (entries.length === 0) console.log("登録されている語はありません。");
      for (const e of entries) console.log(`- ${describeEntry(e)}`);
      return;
    }
    const max = project ? loadSettings(project.paths).transcribe.promptMaxChars : 200;
    const { prompt, dropped } = whisperPrompt(entries, max);
    console.log(prompt || "（空：glossary に語がありません）");
    if (dropped.length) console.log(`文字数の上限（${max}）で入らなかった語: ${dropped.join("、")}`);
    return;
  }

  if (command !== "add" && command !== "update" && command !== "remove") {
    throw new UserError("サブコマンドを指定してください: list | add | update | remove | prompt");
  }
  if (!shared && !project) throw new UserError("--project=<動画ID> か --shared を指定してください。");
  if (project && !shared) assertWritable(project);
  const file = shared ? SHARED_GLOSSARY : project!.paths.glossary;
  const label = shared ? "共通辞書（_shared/glossary.json）" : `案件辞書（${project!.json.id}/input/glossary.json）`;
  const data = loadGlossaryFile(file);

  if (command === "remove") {
    const removed = removeEntry(data, requireOpt(args, "id"));
    console.log(`${dryRun ? "[dry-run] 削除予定" : "削除しました"}（${label}）: ${describeEntry(removed)}`);
    if (!dryRun) saveGlossaryFile(file, data);
    return;
  }

  const kind = args.get("kind");
  if (kind && !GLOSSARY_KINDS.includes(kind as GlossaryEntry["kind"])) {
    throw new UserError(`--kind は ${GLOSSARY_KINDS.join(" | ")} のどれかです。`);
  }
  if (command === "add" && !kind) throw new UserError(`--kind=… を指定してください（${GLOSSARY_KINDS.join(" | ")}）。`);
  const policy = args.get("policy");
  if (policy && policy !== "auto" && policy !== "suggest-only") throw new UserError("--policy は auto | suggest-only です。");
  const source = args.get("source");
  if (source && !["user-instruction", "manual", "learned-from-review"].includes(source)) {
    throw new UserError("--source は user-instruction | manual | learned-from-review です。");
  }

  const readings = args.all("reading");
  const { entry, before } = upsertEntry(
    data,
    {
      surface: requireOpt(args, "surface"),
      kind,
      readings,
      readingConfirmed: args.has("reading-unconfirmed") ? false : args.has("confirm-reading") || readings.length > 0 ? true : undefined,
      aliases: args.all("alias", true),
      misrecognitions: args.all("misrecognition", true),
      contextHints: args.all("hint", true),
      matchPolicy: policy,
      nameContextOnly: args.has("name-context-only") ? true : undefined,
      note: args.get("note"),
      source: (source as GlossaryEntry["source"]) ?? "user-instruction",
    },
    { update: command === "update" },
  );
  if (before) console.log(`変更前: ${describeEntry(before)}`);
  console.log(`${dryRun ? "[dry-run] " : ""}${before ? "変更後" : "追加"}（${label}）: ${describeEntry(entry)}`);
  if (!entry.readings.length) console.log("  ※ 読みが未登録です。読みが分かれば --reading=… で追加してください（読みでの補正候補が出せます）。");
  else if (!entry.readingConfirmed) console.log("  ※ 読みが未確認なので、読みによる補正候補は出しません（確認したら update --confirm-reading）。");
  if (!dryRun) saveGlossaryFile(file, data);
});
