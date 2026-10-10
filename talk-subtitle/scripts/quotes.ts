// Posts read aloud on camera (ground truth for those subtitles).
//   npm run quotes -- add   --project=<id> --id=sample-person-post --author=sample-person [--source=…] --line="…" [--line="…"]… [--replace]
//   npm run quotes -- list  --project=<id>
//   npm run quotes -- align --project=<id>     → intermediate/quote-alignment.json（読み上げ箇所の照合と違いの一覧）
//   npm run quotes -- decide --project=<id> --line=sample-person-post:5[,…] --use=post [--flag="…"] [--at=<元の秒>] [--clear]
//     ユーザーの判断を記録（投稿の表記を採用。--flag は採用しつつ要確認を残す）
// Rules for subtitles (Phase 3): post text wins over whisper where it was read; words the speaker
// skipped or changed follow the speech; lines never read aloud are never added.

import { fmtTime, parseArgs, requireOpt, runCli, UserError } from "../src/cli.ts";
import type { Timemap } from "../src/cut.ts";
import { assertWritable, loadProject, readJsonIfExists, writeJsonAtomic } from "../src/project.ts";
import { alignQuotes, loadQuotes, saveQuotes } from "../src/quotes.ts";
import type { Transcript } from "../src/transcript.ts";

await runCli(async () => {
  const args = parseArgs();
  const cmd = args.positional[0];
  const project = loadProject(args.get("project"));
  const { paths } = project;
  const quotes = loadQuotes(paths.quotes);

  if (cmd === "add") {
    assertWritable(project);
    const id = requireOpt(args, "id");
    const lines = args.all("line");
    if (!lines.length) throw new UserError("--line=… を1つ以上指定してください。");
    const existing = quotes.quotes.find((q) => q.id === id);
    if (existing && !args.has("replace")) {
      existing.lines.push(...lines.filter((l) => !existing.lines.includes(l)));
    } else {
      if (existing) quotes.quotes.splice(quotes.quotes.indexOf(existing), 1);
      quotes.quotes.push({ id, author: requireOpt(args, "author"), ...(args.get("source") ? { source: args.get("source")! } : {}), lines });
    }
    saveQuotes(paths.quotes, quotes);
    const q = quotes.quotes.find((x) => x.id === id)!;
    console.log(`登録しました: ${q.id}（${q.author}）${q.lines.length}行`);
    q.lines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
    return;
  }
  if (cmd === "list") {
    for (const q of quotes.quotes) {
      console.log(`${q.id}（${q.author}）${q.source ? ` 出典: ${q.source}` : ""}`);
      q.lines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));
    }
    return;
  }
  if (cmd === "decide") {
    assertWritable(project);
    const refs = args.all("line", true);
    if (!refs.length) throw new UserError("--line=<投稿ID>:<行番号> を指定してください。");
    if ((args.get("use") ?? "post") !== "post") throw new UserError("--use は post のみ対応しています（話したとおりにする場合は字幕の確認で直します）。");
    const at = args.get("at") !== undefined ? Number(args.get("at")) : undefined;
    if (at !== undefined && !Number.isFinite(at)) throw new UserError("--at は秒数で指定してください。");
    const flag = args.get("flag");
    let decisions = quotes.decisions ?? [];
    for (const ref of refs) {
      const [qid, n] = ref.split(":");
      const line = quotes.quotes.find((x) => x.id === qid)?.lines[Number(n) - 1];
      if (!line) throw new UserError(`${ref} が見つかりません（npm run quotes -- list で確認）。`);
      decisions = decisions.filter((d) => !(d.quoteId === qid && d.line === line && d.at === at));
      if (args.has("clear")) {
        console.log(`取り消し: ${qid} ${n}行目「${line}」`);
        continue;
      }
      decisions.push({ quoteId: qid, line, use: "post", ...(flag ? { flag } : {}), ...(at !== undefined ? { at } : {}), decidedAt: new Date().toISOString(), by: "chat" });
      console.log(`記録: ${qid} ${n}行目「${line}」→ 投稿の表記を採用${flag ? `（要確認を残す: ${flag}）` : ""}`);
    }
    quotes.decisions = decisions;
    saveQuotes(paths.quotes, quotes);
    return;
  }
  if (cmd === "align") {
    const raw = readJsonIfExists<Transcript>(paths.transcript);
    if (!raw) throw new UserError("文字起こしがありません。");
    const corrected = readJsonIfExists<Transcript>(paths.transcriptCorrected) ?? raw;
    const result = alignQuotes(corrected, raw, quotes, readJsonIfExists<Timemap>(paths.timemap));
    writeJsonAtomic(paths.quoteAlignment, result);
    const label = { same: "一致", "use-quote": "投稿の表記を採用", review: "要確認" } as const;
    for (const m of result.matches) {
      const state = { resolved: "確定", flagged: "投稿を採用・要確認", pending: "未決定" }[m.state];
      console.log(`\n[${label[m.status]} → ${state}]${m.author} ${m.lineIndex + 1}行目  元 ${fmtTime(m.start)}〜${fmtTime(m.end)} → カット後 ${m.outStart === null ? "（カット済み）" : fmtTime(m.outStart)}  一致度 ${m.similarity}${m.keptRatio < 0.99 ? `  残る割合 ${Math.round(m.keptRatio * 100)}%` : ""}`);
      console.log(`  投稿　　: ${m.line}`);
      console.log(`  文字起こし: ${m.heard}`);
      for (const n of m.notes) console.log(`  ・${n}`);
      if (m.coveredBy) console.log(`  ・${m.coveredBy.quoteId} ${m.coveredBy.lineIndex + 1}行目の中に含まれる（その行の判断に従う）`);
      if (m.decision?.flag) console.log(`  ・要確認: ${m.decision.flag}`);
    }
    for (const n of result.notFound) console.log(`\n[見つからない] ${n.quoteId} ${n.lineIndex + 1}行目「${n.line}」（最も近い一致度 ${n.bestSimilarity}）→ 読み上げていない可能性。字幕には追加しない`);
    console.log(`\n→ intermediate/quote-alignment.json（一致 ${result.matches.filter((m) => m.status === "same").length}／投稿の表記を採用 ${result.matches.filter((m) => m.status === "use-quote").length}／要確認 ${result.matches.filter((m) => m.status === "review").length}／見つからない ${result.notFound.length}）`);
    const st = (s: string) => result.matches.filter((m) => m.state === s).length;
    console.log(`   判断: 確定 ${st("resolved")}／投稿を採用・要確認 ${st("flagged")}／未決定 ${st("pending")}`);
    return;
  }
  throw new UserError("サブコマンド: add | list | decide | align");
});
