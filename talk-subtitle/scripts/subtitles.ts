// Phase 3: subtitle draft and review (no burn-in here).
//   npm run subtitles -- draft  --project=<id>        → intermediate/subtitles.draft.json + review/subtitles.html
//   npm run subtitles -- show   --project=<id> [--review]
//   npm run subtitles -- edit   --project=<id> --cue=s012 --text="…"   （改行は \n）
//   npm run subtitles -- edit   --project=<id> --cue=s003 --end=7.78   （終わりの時刻。--start と同じくカット後の秒）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --start=0.28   （開始時刻をカット後の秒で。文字起こしに無い声の分）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --before="文" --before-start=0.28 --before-end=1.6   （前に字幕を1つ追加）
//   npm run subtitles -- edit   --project=<id> --cue=s001 --split="今日はね|動物虐待問題で|なんかもっと" [--times=1.24-2.1,2.1-4.8,4.8-5.77]
//                                （何分割でも。--times が無ければ字幕の表示時間を文字数で按分）
//   npm run subtitles -- edit   --project=<id> --cue=s012 --delete | --ok | --reset
//   npm run subtitles -- edit-batch --project=<id> --file=<plan.json>   （分割・削除をまとめて。[{ "cue": "s001", "split": [{ "text", "start", "end" }] } | { "cue": "s002", "delete": true }]。全部当ててから重なりを確かめ、だめなら何も書かない）
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
      console.log(`${c.id} ${mark} ${fmtTime(c.start)}–${fmtTime(c.end)}  ${c.text.replace(/\n/g, " ／ ")}${c.edited ? "  (編集)" : ""}`);
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
    const id = requireOpt(args, "cue");
    const cue = draft.cues.find((c) => c.id === id);
    if (!cue) throw new UserError(`${id} がありません（npm run subtitles -- show で確認）。`);
    const by: By = "chat";
    const prev = s.edits[id] ?? { origText: cue.text, by, at: "" };
    const e = { ...prev, by, at: new Date().toISOString() };
    if (args.has("reset")) {
      delete s.edits[id];
      console.log(`${id}: 元の案に戻しました「${cue.text.replace(/\n/g, " ／ ")}」`);
    } else {
      if (args.get("text") !== undefined) e.text = args.get("text")!.replace(/\\n/g, "\n");
      if (args.get("start") !== undefined) {
        // Start time in the cut video (e.g. a voice the transcript has no words for). Never overlaps the previous cue.
        const t = Number(args.get("start"));
        const i = draft.cues.indexOf(cue);
        const pc = draft.cues.slice(0, i).filter((c) => !s.edits[c.id]?.deleted).at(-1);
        const prevEnd = pc ? effEnd(pc, s) : 0;
        if (!Number.isFinite(t) || t < prevEnd || t >= cue.end) throw new UserError(`--start は ${prevEnd.toFixed(2)}〜${cue.end.toFixed(2)} 秒の間で指定してください（前の字幕と重ねない）。`);
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
        e.before = { text: args.get("before")!, start: Math.round(a * 1000) / 1000, end: Math.round(b * 1000) / 1000 };
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
      s.edits[cue.id] = { origText: prev.origText, split: p.split.map((x) => ({ text: x.text.trim(), start: r3(x.start), end: r3(x.end) })), by: "chat", at };
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
    s.edits = next;
    s.approved = null;
    console.log(`取り込みました（修正・確認 ${Object.keys(next).length} 件）。`);
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
    s.approved = { at: new Date().toISOString(), by: "chat", draftFingerprint: draft.fingerprint };
    console.log("字幕を承認しました（input/subtitles.json）。");
    refresh(draft, s);
    return;
  }

  throw new UserError("サブコマンド: draft | show | edit | edit-batch | import | approve");
});
