// Phase 3: subtitle draft and review (no burn-in here).
//   npm run subtitles -- draft  --project=<id>        → intermediate/subtitles.draft.json + review/subtitles.html
//   npm run subtitles -- show   --project=<id> [--review]
//   npm run subtitles -- edit   --project=<id> --cue=s012 --text="…"   （改行は \n）
//   npm run subtitles -- edit   --project=<id> --cue=s012 --delete | --ok | --reset
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
  saveSubtitleEdits,
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
    return { live: cues.length, deleted: draft.cues.length - cues.length, review: cues.filter((c) => c.review).length, open: cues.filter((c) => c.review && !c.ok).length, edited: cues.filter((c) => c.edited).length };
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
      if (args.has("delete")) e.deleted = true;
      if (args.has("ok")) e.ok = true;
      if (e.text === undefined && !e.deleted && !e.ok) throw new UserError("--text=… / --delete / --ok / --reset のどれかを指定してください。");
      s.edits[id] = e;
      console.log(`${id}: ${e.deleted ? "削除" : e.text !== undefined ? `「${e.text.replace(/\n/g, " ／ ")}」` : "確認OK"}`);
    }
    if (s.approved) {
      s.approved = null;
      console.log("（承認を取り消しました。もう一度 approve してください）");
    }
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
    for (const [id, e] of Object.entries(exp.edits ?? {})) {
      const cue = draft.cues.find((c) => c.id === id);
      if (!cue) continue;
      if (e.text === undefined && !e.deleted && !e.ok) continue;
      next[id] = { origText: cue.text, ...(e.text !== undefined ? { text: e.text } : {}), ...(e.deleted ? { deleted: true as const } : {}), ...(e.ok ? { ok: true as const } : {}), by: "html", at };
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

  throw new UserError("サブコマンド: draft | show | edit | import | approve");
});
