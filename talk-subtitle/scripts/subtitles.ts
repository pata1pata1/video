// Phase 3: subtitle draft and review (no burn-in here).
//   npm run subtitles -- draft  --project=<id>        → intermediate/subtitles.draft.json + review/subtitles.html
//   npm run subtitles -- show   --project=<id> [--review]
//   npm run subtitles -- edit   --project=<id> --cue=s012 --text="…"   （改行は \n）
//   npm run subtitles -- edit   --project=<id> --cue=s003 --end=7.78   （終わりの時刻。--start と同じくカット後の秒）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --start=0.28   （開始時刻をカット後の秒で。文字起こしに無い声の分）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --before="文" --before-start=0.28 --before-end=1.6   （前に字幕を1つ追加）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --split="今日はね|動物虐待問題で|なんかもっと" [--times=1.24-2.1,2.1-4.8,4.8-5.77]
//                                （何分割でも。--times が無ければ字幕の表示時間を文字数で按分）
//   npm run subtitles -- edit   --project=<id> --cue=s001.2 --start=3.1 [--end=…] [--text=…] [--delete]   （分けた字幕の2つ目。s001 は1つ目）
//   npm run subtitles -- edit   --project=<id> --cue=s012 --delete | --ok | --reset
//   npm run subtitles -- edit-batch --project=<id> --file=<plan.json>   （分割・削除をまとめて。[{ "cue": "s001", "split": [{ "text", "start", "end" }] } | { "cue": "s002", "delete": true }]。全部当ててから重なりを確かめ、だめなら何も書かない）
//   npm run subtitles -- speaker --project=<id> --name=女 --cues=s002,s005-s009   （話者。色は subtitle-style.json の speakers）
//   npm run subtitles -- speaker --project=<id> --name=男 --rest   （まだ話者の無い字幕をすべて）／ --clear --cues=…
//   npm run subtitles -- retime --project=<id> [--dry-run] [--show-all]   （字幕の時刻を cut.mp4 の声に合わせ直す。文字は変えない。声のかたまりごとに文字起こしし直して対応づける）
//   npm run subtitles -- import --project=<id> --file=<subtitles.html から書き出した JSON>
//   npm run subtitles -- approve --project=<id>       （要確認がすべて確認済みのときだけ）

import type { ProbeJson } from "../src/analyze.ts";
import fs from "node:fs";
import { readPcmWav } from "../src/audioLevel.ts";
import type { CutCandidatesJson } from "../src/candidates.ts";
import { loadMergedGlossary } from "../src/glossary.ts";
import { fmtTime, parseArgs, requireOpt, runCli, UserError } from "../src/cli.ts";
import type { By } from "../src/decisions.ts";
import { assertSourceUnchanged, assertWritable, loadProject, readJson, readJsonIfExists, writeJsonAtomic } from "../src/project.ts";
import { writeSubtitleReview } from "../src/subtitleReview.ts";
import {
  buildDraft,
  carryEdits,
  checkCutInputs,
  effectiveCues,
  loadPreset,
  loadSubtitleEdits,
  editFromPageText,
  saveSubtitleEdits,
  splitByWidth,
  type SubtitleDraft,
  type SubtitlesJson,
} from "../src/subtitles.ts";
import type { CorrectedTranscript } from "../src/terms.ts";
import type { Transcript } from "../src/transcript.ts";
import { loadSettings } from "../src/config.ts";
import { normalizeForMatch, retimeSubtitles } from "../src/retime.ts";

await runCli(async () => {
  const args = parseArgs();
  const cmd = args.positional[0] ?? "draft";
  const project = loadProject(args.get("project"));
  const { paths, json } = project;
  const preset = loadPreset(paths);

  const loadDraft = (): SubtitleDraft => {
    const d = readJsonIfExists<SubtitleDraft>(paths.subtitlesDraft);
    if (!d) throw new UserError("字幕案がありません。npm run subtitles -- draft を先に実行してください。");
    return d;
  };
  const counts = (draft: SubtitleDraft, s: SubtitlesJson) => {
    const cues = effectiveCues(draft, s);
    return { live: cues.length, deleted: draft.cues.filter((c) => s.edits[c.id]?.deleted).length, review: cues.filter((c) => c.review).length, open: cues.filter((c) => c.review && !c.ok).length, edited: cues.filter((c) => c.edited).length };
  };
  const refresh = (draft: SubtitleDraft, s: SubtitlesJson) => {
    saveSubtitleEdits(paths, s);
    writeSubtitleReview(project, draft, s, preset);
    const n = counts(draft, s);
    console.log(`字幕 ${n.live} 件（削除 ${n.deleted}）／要確認 ${n.review} 件のうち未確認 ${n.open} 件／編集 ${n.edited} 件`);
  };

  if (cmd === "draft") {
    assertWritable(project);
    assertSourceUnchanged(project);
    const sha = json.source!.sha256;
    const { timemap } = checkCutInputs(paths, sha);
    const corrected = readJsonIfExists<CorrectedTranscript>(paths.transcriptCorrected);
    const raw = readJsonIfExists<Transcript>(paths.transcript);
    if (!corrected || !raw) throw new UserError("文字起こし（transcript.json・transcript.corrected.json）がありません。");
    const draft = buildDraft({
      paths,
      sourceSha256: sha,
      corrected,
      raw,
      timemap,
      probe: readJson<ProbeJson>(paths.probe),
      preset,
      pcm: fs.existsSync(paths.audioWav) ? readPcmWav(paths.audioWav) : null,
      speechDb: readJsonIfExists<CutCandidatesJson>(paths.cutCandidates)?.speechDb ?? null,
      glossarySurfaces: loadMergedGlossary(paths.glossary).map((e) => e.surface),
    });
    writeJsonAtomic(paths.subtitlesDraft, draft);
    const s = loadSubtitleEdits(paths, json.id);
    const { carried, lost } = carryEdits(s, draft);
    if (carried) console.log(`前回の修正 ${carried} 件を引き継ぎました。`);
    for (const l of lost) console.log(`！ 引き継げなかった修正: ${l.id}「${l.edit.origText}」→「${l.edit.text ?? (l.edit.deleted ? "（削除）" : "（確認OK）")}」`);
    console.log(`字幕案: intermediate/subtitles.draft.json（${draft.cues.length} 件、カット後 ${fmtTime(timemap.outputDurationSeconds)}）`);
    console.log(`除外した語: カット範囲 ${draft.dropped.filter((d) => d.reason === "cut").length}／フィラー ${draft.dropped.filter((d) => d.reason === "filler").length}`);
    refresh(draft, s);
    console.log("確認画面: review/subtitles.html（まだ焼き込みはしていません）");
    return;
  }

  if (cmd === "show") {
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    for (const c of effectiveCues(draft, s)) {
      if (args.has("review") && !c.review) continue;
      const mark = c.review ? (c.ok ? "[確認済]" : "[要確認]") : "        ";
      console.log(`${c.id} ${mark} ${fmtTime(c.start)}–${fmtTime(c.end)}  ${c.speaker ? `［${c.speaker}］` : preset.speakers ? "［話者なし］" : ""}${c.text.replace(/\n/g, " ／ ")}${c.edited ? "  (編集)" : ""}`);
      if (args.has("review") || args.has("verbose")) for (const f of c.flags) console.log(`      ${f.review ? "・要確認" : "・"} ${f.note}`);
    }
    const n = counts(draft, s);
    console.log(`\n字幕 ${n.live} 件／要確認 ${n.review} 件のうち未確認 ${n.open} 件／編集 ${n.edited} 件`);
    return;
  }

  if (cmd === "edit") {
    assertWritable(project);
    // Times of the neighbouring cues as they are now (edited start/end, split parts, added cue before).
    const effEnd = (c: { id: string; end: number }, s: SubtitlesJson) => {
      const x = s.edits[c.id];
      return x?.split?.length ? x.split[x.split.length - 1].end : (x?.end ?? c.end);
    };
    const effStart = (c: { id: string; start: number }, s: SubtitlesJson) => {
      const x = s.edits[c.id];
      return x?.before?.start ?? (x?.split?.length ? x.split[0].start : (x?.start ?? c.start));
    };
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const asked = requireOpt(args, "cue");
    // A part of a split cue is shown as <id>.2, <id>.3 …: edit that part of <id>.
    const partMatch = /^(.+)\.(\d+)$/.exec(asked);
    const id = !draft.cues.some((c) => c.id === asked) && partMatch && draft.cues.some((c) => c.id === partMatch[1]) ? partMatch[1] : asked;
    const cue = draft.cues.find((c) => c.id === id);
    if (!cue) throw new UserError(`${asked} がありません（npm run subtitles -- show で確認）。`);
    const by: By = "chat";
    const prev = s.edits[id] ?? { origText: cue.text, by, at: "" };
    const e = { ...prev, by, at: new Date().toISOString() };
    const partNo = id === asked ? 1 : Number(partMatch![2]);
    if (id !== asked && !(prev.split?.length && partNo >= 1 && partNo <= prev.split.length)) throw new UserError(`${asked} がありません（${id} は${prev.split?.length ? ` ${prev.split.length} つに分けた字幕です` : "分けられていません"}。npm run subtitles -- show で確認）。`);
    const partEdit = !!prev.split?.length && args.get("split") === undefined && !args.has("reset") && (args.get("start") !== undefined || args.get("end") !== undefined || args.get("text") !== undefined || (id !== asked && args.has("delete")));
    if (id !== asked && !partEdit) throw new UserError(`${asked}（分けた字幕の${partNo}つ目）に使えるのは --start／--end／--text／--delete です。ほかは --cue=${id} で指定してください。`);
    if (partEdit) {
      // Edit one part of a split cue (time / text / delete). Parts never overlap each other or the neighbouring cues.
      const k = partNo - 1;
      const parts = prev.split!.map((p) => ({ ...p }));
      const i = draft.cues.indexOf(cue);
      const pc = draft.cues.slice(0, i).filter((c) => !s.edits[c.id]?.deleted).at(-1);
      const nc = draft.cues.slice(i + 1).find((c) => !s.edits[c.id]?.deleted);
      const lo = k > 0 ? parts[k - 1].end : Math.max(pc ? effEnd(pc, s) : 0, prev.before?.end ?? 0);
      const hi = k < parts.length - 1 ? parts[k + 1].start : nc ? effStart(nc, s) : Infinity;
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      if (args.has("delete")) {
        if (parts.length === 1) throw new UserError(`${asked} は最後の1つです。字幕ごと消すときは --cue=${id} --delete を使ってください。`);
        parts.splice(k, 1);
      } else {
        const p = parts[k];
        if (args.get("text") !== undefined) {
          const t = args.get("text")!.replace(/\\n/g, "\n").trim();
          if (!t) throw new UserError("--text が空です（消すときは --delete）。");
          p.text = t;
        }
        if (args.get("start") !== undefined) {
          const t = Number(args.get("start"));
          if (!Number.isFinite(t) || t < lo - 1e-6 || t >= p.end) throw new UserError(`--start は ${lo.toFixed(2)}〜${p.end.toFixed(2)} 秒の間で指定してください（前の字幕と重ねない）。`);
          p.start = r3(t);
        }
        if (args.get("end") !== undefined) {
          const t = Number(args.get("end"));
          if (!Number.isFinite(t) || t <= p.start || t > hi + 1e-6) throw new UserError(`--end は ${p.start.toFixed(2)}〜${hi === Infinity ? "最後" : hi.toFixed(2)} 秒の間で指定してください（次の字幕と重ねない）。`);
          p.end = r3(t);
        }
      }
      e.split = parts;
      s.edits[id] = e;
      console.log(`${asked}: ${args.has("delete") ? "この部分を削除" : `${parts[k].start.toFixed(2)}–${parts[k].end.toFixed(2)}「${parts[k].text}」`}（${id} は ${parts.map((p) => `${p.start.toFixed(2)}–${p.end.toFixed(2)}「${p.text}」`).join(" ")}）`);
    } else if (args.has("reset")) {
      delete s.edits[id];
      // The speaker is not part of the text edit: keep it.
      if (prev.speaker || prev.before?.speaker) s.edits[id] = { origText: cue.text, ...(prev.speaker ? { speaker: prev.speaker } : {}), by, at: e.at };
      console.log(`${id}: 元の案に戻しました「${cue.text.replace(/\n/g, " ／ ")}」`);
    } else {
      if (args.get("text") !== undefined) e.text = args.get("text")!.replace(/\\n/g, "\n");
      if (args.get("start") !== undefined) {
        // Start time in the cut video (e.g. a voice the transcript has no words for). Never overlaps the previous cue.
        const t = Number(args.get("start"));
        const i = draft.cues.indexOf(cue);
        const pc = draft.cues.slice(0, i).filter((c) => !s.edits[c.id]?.deleted).at(-1);
        const prevEnd = pc ? effEnd(pc, s) : 0;
        const end = args.get("end") !== undefined ? Number(args.get("end")) : (e.end ?? cue.end);
        if (!Number.isFinite(t) || t < prevEnd || t >= end) throw new UserError(`--start は ${prevEnd.toFixed(2)}〜${end.toFixed(2)} 秒の間で指定してください（前の字幕と重ねない）。`);
        e.start = Math.round(t * 1000) / 1000;
      }
      if (args.get("end") !== undefined) {
        // End time in the cut video. Never overlaps the next cue (its edited start, or its added cue before it).
        const t = Number(args.get("end"));
        const i = draft.cues.indexOf(cue);
        const next = draft.cues.slice(i + 1).find((c) => !s.edits[c.id]?.deleted);
        const nextStart = next ? effStart(next, s) : Infinity;
        const start = e.start ?? cue.start;
        if (!Number.isFinite(t) || t <= start || t > nextStart) throw new UserError(`--end は ${start.toFixed(2)}〜${nextStart.toFixed(2)} 秒の間で指定してください（次の字幕と重ねない）。`);
        e.end = Math.round(t * 1000) / 1000;
      }
      if (args.get("before") !== undefined) {
        // --before="文" --before-start=秒 --before-end=秒: add a cue just before this one.
        const a = Number(args.get("before-start"));
        const b = Number(args.get("before-end"));
        const i = draft.cues.indexOf(cue);
        const pc = draft.cues.slice(0, i).filter((c) => !s.edits[c.id]?.deleted).at(-1);
        const prevEnd = pc ? effEnd(pc, s) : 0;
        const start = e.start ?? cue.start;
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < prevEnd || b <= a || b > start) throw new UserError(`--before-start／--before-end は ${prevEnd.toFixed(2)}〜${start.toFixed(2)} 秒の間で指定してください。`);
        e.before = { ...(prev.before?.speaker ? { speaker: prev.before.speaker } : {}), text: args.get("before")!, start: Math.round(a * 1000) / 1000, end: Math.round(b * 1000) / 1000 };
      }
      if (args.get("split") !== undefined) {
        // --split="a|b|c" [--times=s-e,s-e,…]: one cue → several, in order. Without --times the cue's time is shared by text width.
        const texts = args.get("split")!.split("|").map((t) => t.trim());
        if (texts.length < 2 || texts.some((t) => !t)) throw new UserError("--split は「文|文」のように | で2つ以上に分けて、空の部分が無いようにしてください。");
        const i = draft.cues.indexOf(cue);
        const pc = draft.cues.slice(0, i).filter((c) => !s.edits[c.id]?.deleted).at(-1);
        const nc = draft.cues.slice(i + 1).find((c) => !s.edits[c.id]?.deleted);
        const lo = Math.max(pc ? effEnd(pc, s) : 0, e.before?.end ?? 0);
        const hi = nc ? effStart(nc, s) : Infinity;
        const r3 = (x: number) => Math.round(x * 1000) / 1000;
        let parts: { text: string; start: number; end: number }[];
        if (args.get("times") !== undefined) {
          const ts = args.get("times")!.split(",").map((x) => x.split("-").map(Number));
          if (ts.length !== texts.length || ts.some((x) => x.length !== 2 || !x.every(Number.isFinite))) throw new UserError(`--times は分けた数（${texts.length}個）だけ「開始-終わり」をカンマで並べてください（カット後の秒）。`);
          parts = texts.map((t, k) => ({ text: t, start: r3(ts[k][0]), end: r3(ts[k][1]) }));
        } else {
          parts = splitByWidth(texts, e.start ?? cue.start, e.end ?? cue.end);
        }
        for (let k = 0; k < parts.length; k++) {
          const p = parts[k];
          if (p.end <= p.start || (k > 0 && p.start < parts[k - 1].end)) throw new UserError(`--times の ${k + 1}個目（${p.start}-${p.end}）：終わりは開始より後、前の部分と重ねないでください。`);
        }
        if (parts[0].start < lo - 1e-6 || parts[parts.length - 1].end > hi + 1e-6) throw new UserError(`分けた字幕は ${lo.toFixed(2)}〜${hi === Infinity ? "最後" : hi.toFixed(2)} 秒の間に収めてください（前後の字幕と重ねない）。`);
        e.split = parts;
        delete e.text;
        delete e.start;
        delete e.end;
      }
      if (args.has("delete")) e.deleted = true;
      if (args.has("ok")) e.ok = true;
      if (e.text === undefined && e.start === undefined && e.end === undefined && !e.before && !e.split && !e.deleted && !e.ok) throw new UserError("--text=… / --start=秒 / --before=… / --delete / --ok / --reset のどれかを指定してください。");
      s.edits[id] = e;
      const shown = e.split ? `分割 ${e.split.map((p) => `${p.start.toFixed(2)}–${p.end.toFixed(2)}「${p.text}」`).join(" ")}` : e.text !== undefined ? `「${e.text.replace(/\n/g, " ／ ")}」` : e.start === undefined ? "確認OK" : "";
      console.log(`${id}: ${e.deleted ? "削除" : shown}${e.start !== undefined ? `（開始 ${e.start.toFixed(2)}秒）` : ""}${e.end !== undefined ? `（終わり ${e.end.toFixed(2)}秒）` : ""}${e.before ? `（前に追加 ${e.before.start.toFixed(2)}–${e.before.end.toFixed(2)}「${e.before.text}」）` : ""}`);
    }
    if (s.approved) {
      s.approved = null;
      console.log("（承認を取り消しました。もう一度 approve してください）");
    }
    refresh(draft, s);
    return;
  }

  if (cmd === "edit-batch") {
    assertWritable(project);
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const plan = readJson<{ cue: string; split?: { text: string; start: number; end: number }[]; delete?: boolean }[]>(requireOpt(args, "file"));
    if (!Array.isArray(plan)) throw new UserError("--file の JSON は配列にしてください。");
    const at = new Date().toISOString();
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    for (const [k, p] of plan.entries()) {
      const cue = draft.cues.find((c) => c.id === p.cue);
      if (!cue) throw new UserError(`${k + 1}件目: ${p.cue} がありません。`);
      const prev = s.edits[cue.id] ?? { origText: cue.text, by: "chat" as By, at };
      if (p.delete) {
        s.edits[cue.id] = { origText: prev.origText, deleted: true, by: "chat", at };
        continue;
      }
      if (!p.split?.length || p.split.some((x) => !x.text?.trim() || !Number.isFinite(x.start) || !Number.isFinite(x.end) || x.end <= x.start)) throw new UserError(`${k + 1}件目（${p.cue}）: split は { text, start, end }（終わり > 開始）を1つ以上。`);
      s.edits[cue.id] = { origText: prev.origText, ...(prev.speaker ? { speaker: prev.speaker } : {}), split: p.split.map((x) => ({ text: x.text.trim(), start: r3(x.start), end: r3(x.end) })), by: "chat", at };
    }
    const cues = effectiveCues(draft, s);
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].end - 1e-6) throw new UserError(`重なっています: ${cues[i - 1].id}（〜${cues[i - 1].end.toFixed(2)}）と ${cues[i].id}（${cues[i].start.toFixed(2)}〜）。何も書いていません。`);
    }
    if (s.approved) s.approved = null;
    console.log(`まとめて反映しました（${plan.length} 件の字幕 → 表示する字幕 ${cues.length} 件）。`);
    refresh(draft, s);
    return;
  }

  if (cmd === "retime") {
    const dryRun = args.has("dry-run");
    if (!dryRun) assertWritable(project);
    checkCutInputs(paths, json.source!.sha256);
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const live = effectiveCues(draft, s, { textRules: false });
    const result = await retimeSubtitles(paths, live.map((c) => ({ id: c.id, text: c.text, start: c.start, end: c.end })), loadSettings(paths), (l) => console.log(l));
    const dropped = result.chunks.filter((c) => c.dropped && c.text);
    if (dropped.length) console.log(`捨てた文字起こし（無音から作られた文など）: ${dropped.map((c) => `${fmtTime(c.start)}「${c.text}」`).join("、")}`);
    const moved = result.cues.filter((c) => Math.abs(c.newStart - c.start) >= 0.1 || Math.abs(c.newEnd - c.end) >= 0.1);
    console.log(`\n字幕 ${result.cues.length} 件の文字のうち ${(result.matchedRatio * 100).toFixed(0)}% を声と対応づけました。時刻が 0.1秒以上変わる字幕 ${moved.length} 件:`);
    for (const c of args.has("show-all") ? result.cues : moved) {
      const d = c.newStart - c.start;
      console.log(`  ${c.id.padEnd(8)} ${fmtTime(c.start)} → ${fmtTime(c.newStart)}（${d >= 0 ? "+" : ""}${d.toFixed(2)}秒）〜${fmtTime(c.newEnd)}${c.snapped ? " 息つぎ" : ""}${c.matched < 0.6 ? `  ！対応 ${(c.matched * 100).toFixed(0)}%` : ""}  「${c.text}」`);
    }
    const weak = result.cues.filter((c) => c.matched < 0.6);
    if (weak.length) console.log(`\n！声との対応が少ない字幕 ${weak.length} 件（聞き間違い・字幕の文字が声と違う・カットの漏れの可能性。時刻は前後からの見込み）: ${weak.map((c) => c.id).join(", ")}`);
    // Fillers and words the subtitles leave out on purpose (はい・うん・まあ・ね…) are not worth a look.
    const st = loadSettings(paths).candidates;
    const fillers = [...new Set([...(preset.layout?.dropWords ?? []), ...st.strongFillers, ...st.weakFillers, "ね", "はい", "うん", "まあ", "あの", "その"].map(normalizeForMatch).filter(Boolean))].sort((a, b) => b.length - a.length);
    const fillerOnly = new RegExp(`^(?:${fillers.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})+$`);
    const unheard = result.unheard.filter((u) => !fillerOnly.test(normalizeForMatch(u.text)));
    if (unheard.length) {
      console.log(`\n字幕に無い声 ${unheard.length} か所（残った言い直し・言いかけの手がかり。字幕の書き始め・終わりの表記違いのこともある。つなぎの言葉 ${result.unheard.length - unheard.length} か所は省略）:`);
      for (const u of unheard) console.log(`  ${fmtTime(u.start)}–${fmtTime(u.end)}  「${u.text}」`);
    }
    const shortCues = result.cues.filter((c) => c.newEnd - c.newStart < 0.4);
    if (shortCues.length) console.log(`\n！0.4秒未満の字幕: ${shortCues.map((c) => `${c.id}（${(c.newEnd - c.newStart).toFixed(2)}秒）`).join(", ")}`);
    if (dryRun) {
      console.log("\n[dry-run] 何も書いていません。");
      return;
    }
    // Write the times the same way as edit / edit-batch (texts untouched).
    const at = new Date().toISOString();
    const t = new Map(result.cues.map((c) => [c.id, c]));
    for (const c of draft.cues) {
      const e = s.edits[c.id];
      if (e?.deleted) continue;
      const next = { ...(e ?? { origText: c.text }), by: "cli" as By, at };
      if (e?.before) {
        const b = t.get(`${c.id}a`);
        if (b) next.before = { ...e.before, start: b.newStart, end: b.newEnd };
      }
      if (e?.split?.length) {
        next.split = e.split.map((p, k) => {
          const r = t.get(k === 0 ? c.id : `${c.id}.${k + 1}`);
          return r ? { ...p, start: r.newStart, end: r.newEnd } : p;
        });
      } else {
        const r = t.get(c.id);
        if (r) {
          next.start = r.newStart;
          next.end = r.newEnd;
        }
      }
      s.edits[c.id] = next;
    }
    const cues = effectiveCues(draft, s);
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].end - 1e-6) throw new UserError(`重なっています: ${cues[i - 1].id}（〜${cues[i - 1].end.toFixed(2)}）と ${cues[i].id}（${cues[i].start.toFixed(2)}〜）。何も書いていません。`);
    }
    if (s.approved) {
      s.approved = null;
      console.log("時刻が変わったので、字幕の承認を外しました（確認してから approve し直してください）。");
    }
    console.log("\n字幕の時刻を書きました（input/subtitles.json）。");
    refresh(draft, s);
    return;
  }

  if (cmd === "import") {
    assertWritable(project);
    const draft = loadDraft();
    const exp = readJson<{ kind: string; project: string; draftFingerprint: string; edits: Record<string, { text?: string; deleted?: boolean; ok?: boolean }> }>(requireOpt(args, "file"));
    if (exp.kind !== "talk-subtitle-subtitles-export") throw new UserError("review/subtitles.html から書き出したファイルではありません。");
    if (exp.project !== json.id) throw new UserError(`別の案件（${exp.project}）のファイルです。`);
    if (exp.draftFingerprint !== draft.fingerprint) throw new UserError("書き出したときの字幕案が、今の字幕案と違います（作り直された）。review/subtitles.html を開き直して、もう一度書き出してください。");
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const at = new Date().toISOString();
    const next: SubtitlesJson["edits"] = {};
    // Splits, times and added cues are made in chat (the page edits text only): keep them.
    for (const [id, old] of Object.entries(s.edits)) if (old.split || old.before || old.start !== undefined || old.end !== undefined) next[id] = old;
    for (const [id, e] of Object.entries(exp.edits ?? {})) {
      const cue = draft.cues.find((c) => c.id === id);
      if (!cue) continue;
      if (e.text === undefined && !e.deleted && !e.ok) continue;
      const old = s.edits[id];
      const joined = old?.split?.map((p) => p.text).join("|");
      const fromText = e.text !== undefined && e.text !== joined ? editFromPageText(cue, old, e.text) : {};
      next[id] = { ...(next[id] ?? {}), origText: cue.text, ...fromText, ...(e.deleted ? { deleted: true as const } : {}), ...(e.ok ? { ok: true as const } : {}), by: "html", at };
    }
    // Speakers are set from the chat only (not in the HTML export): keep them.
    for (const [id, e] of Object.entries(s.edits)) {
      if (!e.speaker && !e.before?.speaker) continue;
      next[id] = { ...(next[id] ?? { origText: e.origText, by: e.by, at: e.at }), ...(e.speaker ? { speaker: e.speaker } : {}), ...(e.before ? { before: e.before } : {}) };
    }
    s.edits = next;
    s.approved = null;
    console.log(`取り込みました（修正・確認 ${Object.keys(next).length} 件）。`);
    refresh(draft, s);
    return;
  }

  if (cmd === "speaker") {
    assertWritable(project);
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const clear = args.has("clear");
    const name = clear ? undefined : requireOpt(args, "name");
    const names = Object.keys(preset.speakers ?? {});
    if (name && !names.includes(name)) throw new UserError(`話者「${name}」は subtitle-style.json の speakers にありません（${names.length ? names.join("・") : "speakers が未設定"}）。`);
    const order = effectiveCues(draft, s).map((c) => c.id);
    let ids: string[];
    if (args.has("rest")) {
      if (clear) throw new UserError("--clear と --rest は同時に指定できません。");
      ids = effectiveCues(draft, s).filter((c) => !c.speaker).map((c) => c.id);
    } else {
      ids = [];
      for (const tok of args.all("cues", true)) {
        const [a, b] = tok.split("-");
        const i = order.indexOf(a);
        const j = b === undefined ? i : order.indexOf(b);
        if (i < 0 || j < 0 || j < i) throw new UserError(`--cues の「${tok}」が字幕にありません（npm run subtitles -- show で確認。範囲は s003-s010 の形）。`);
        ids.push(...order.slice(i, j + 1));
      }
      if (!ids.length) throw new UserError("--cues=s001,s003-s010 か --rest を指定してください。");
    }
    const by: By = "chat";
    const at = new Date().toISOString();
    for (const id of ids) {
      const added = /a$/.test(id) && !draft.cues.some((c) => c.id === id);
      const baseId = added ? id.slice(0, -1) : id;
      const cue = draft.cues.find((c) => c.id === baseId)!;
      const e = { ...(s.edits[baseId] ?? { origText: cue.text, by, at }), by, at };
      if (added) e.before = { ...e.before!, speaker: name };
      else e.speaker = name;
      if (!name) {
        if (added) delete e.before!.speaker;
        else delete e.speaker;
      }
      s.edits[baseId] = e;
    }
    console.log(`${ids.length} 件を${name ? `「${name}」` : "話者なし"}にしました: ${ids.length > 12 ? `${ids.slice(0, 12).join(", ")}…` : ids.join(", ")}`);
    const left = effectiveCues(draft, s).filter((c) => !c.speaker).length;
    if (names.length) console.log(`話者がまだ無い字幕: ${left} 件`);
    if (s.approved) {
      s.approved = null;
      console.log("（承認を取り消しました。もう一度 approve してください）");
    }
    refresh(draft, s);
    return;
  }

  if (cmd === "approve") {
    assertWritable(project);
    const draft = loadDraft();
    const s = loadSubtitleEdits(paths, json.id);
    carryEdits(s, draft);
    const open = effectiveCues(draft, s).filter((c) => c.review && !c.ok);
    if (open.length) throw new UserError(`未確認の要確認が ${open.length} 件あります（${open.slice(0, 10).map((c) => c.id).join(", ")}…）。確認OK・修正・削除のどれかにしてから承認してください。`);
    if (preset.speakers) {
      const none = effectiveCues(draft, s).filter((c) => !c.speaker || !preset.speakers![c.speaker]);
      if (none.length) throw new UserError(`話者が無い字幕が ${none.length} 件あります（${none.slice(0, 10).map((c) => c.id).join(", ")}…）。npm run subtitles -- speaker で割り当ててから承認してください。`);
    }
    s.approved = { at: new Date().toISOString(), by: "chat", draftFingerprint: draft.fingerprint };
    console.log("字幕を承認しました（input/subtitles.json）。");
    refresh(draft, s);
    return;
  }

  throw new UserError("サブコマンド: draft | show | edit | edit-batch | retime | speaker | import | approve");
});
