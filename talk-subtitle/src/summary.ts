// Human-readable reports: analysis result and project status.

import fs from "node:fs";
import type { ProbeJson, SilencesJson } from "./analyze.ts";
import type { CutCandidatesJson } from "./candidates.ts";
import { fmtTime } from "./cli.ts";
import { currentCutDecisions, currentTermDecisions, cutSummary, loadDecisions } from "./decisions.ts";
import { loadMergedGlossary } from "./glossary.ts";
import path from "node:path";
import type { CutReport, Timemap } from "./cut.ts";
import { STYLE_OBSERVATIONS_DIR } from "./paths.ts";
import { readJsonIfExists, type Project } from "./project.ts";
import { glossaryFingerprint } from "./steps.ts";
import type { TranscriptFile } from "./transcript.ts";
import type { TermCandidatesJson } from "./terms.ts";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export function printAnalysis(project: Project, r: { probe: ProbeJson; silences: SilencesJson; proxyMade: boolean }) {
  const { probe, silences } = r;
  const v = probe.video;
  console.log(`元動画      : ${project.json.source!.file}（${mb(probe.source.sizeBytes)}、読み取りのみ）`);
  console.log(`長さ        : ${probe.durationSeconds?.toFixed(2)}秒（${fmtTime(probe.durationSeconds ?? 0)}）`);
  if (v) {
    console.log(`映像        : ${v.codec} ${v.width}×${v.height}（${v.aspectLabel}・${v.orientation === "portrait" ? "縦" : v.orientation === "landscape" ? "横" : "正方形"}）${v.rotation ? ` 保存は${v.storedWidth}×${v.storedHeight}＋回転${v.rotation}°` : ""}　${v.fps ?? "?"}fps（${v.fpsFraction}）`);
  } else console.log("映像        : なし");
  console.log(`音声        : ${probe.audio?.codec} ${probe.audio?.sampleRate}Hz ${probe.audio?.channels}ch`);
  const total = silences.silences.reduce((n, s) => n + s.duration, 0);
  console.log(`無音        : ${silences.silences.length}区間・合計 ${total.toFixed(1)}秒（しきい値 ${silences.noiseDb}dB${silences.noiseDbSource === "auto" ? "・自動" : ""}、${silences.minDetectSeconds}秒以上）`);
  console.log(`ブラウザ再生: ${probe.browserPlayable ? "元動画をそのまま再生できます" : r.proxyMade ? "できないため確認用プロキシを作りました（intermediate/review-proxy.mp4）" : "できないため確認用プロキシを使います"}`);
  console.log(`\n次: npm run transcribe -- --project=${project.json.id}`);
}

export function printStatus(project: Project) {
  const { paths, json } = project;
  const exists = (f: string) => fs.existsSync(f);
  console.log(`案件: ${json.id}（${json.status}${json.locked ? "・locked" : ""}）  ${paths.root}`);
  console.log(`元動画: ${json.source ? `${json.source.file}（${mb(json.source.sizeBytes)}、sha256 ${json.source.sha256.slice(0, 12)}…）` : "未登録"}`);
  if (json.kind === "reference") {
    const ref = json.reference;
    const mark = (b: boolean) => (b ? "✔" : "・");
    console.log(`種類: reference（別のソフトで編集した動画。編集スタイルの学習用）`);
    console.log(`完成動画: ${ref ? `${ref.final.file}（${mb(ref.final.sizeBytes)}）` : "未登録"}　SRT: ${ref?.srt ? ref.srt.file : "なし"}`);
    console.log(`素材: ${ref?.assets ? `${ref.assets.count}ファイル（${mb(ref.assets.totalBytes)}、一覧は intermediate/reference-assets.json）` : "未登録"}`);
    console.log("\n工程:");
    console.log(`  ${mark(!!ref)} 0. 登録（sha256 のみ）  npm run reference -- register`);
    console.log(`  ${mark(fs.existsSync(paths.probe) && fs.existsSync(paths.finalWav))} 1. 解析（両方）        npm run reference -- analyze`);
    console.log(`  ${mark(fs.existsSync(paths.transcript) && fs.existsSync(paths.finalTranscript))} 2. 文字起こし（両方）  npm run reference -- transcribe`);
    console.log(`  ${mark(fs.existsSync(paths.reconstruction))} 3. カットの復元        npm run reference -- reconstruct`);
    console.log(`  ${mark(fs.existsSync(path.join(STYLE_OBSERVATIONS_DIR, `${json.id}.json`)))} 4. 観察               npm run style -- observe`);
    return;
  }

  const entries = loadMergedGlossary(paths.glossary);
  console.log(`固有名詞辞書: 案件 ${entries.filter((e) => e.layer === "project").length}語・共通 ${entries.filter((e) => e.layer === "shared").length}語`);

  const probe = readJsonIfExists<ProbeJson>(paths.probe);
  const transcript = readJsonIfExists<TranscriptFile>(paths.transcript);
  const terms = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  const cuts = readJsonIfExists<CutCandidatesJson>(paths.cutCandidates);
  const decisions = loadDecisions(paths);
  const gfp = glossaryFingerprint(project);
  const next: string[] = [];
  const id = json.id;

  const mark = (b: boolean) => (b ? "✔" : "・");
  console.log("\n工程:");
  console.log(`  ${mark(!!probe)} 1. 解析            ${probe ? `${probe.video?.width}×${probe.video?.height} ${probe.video?.aspectLabel} ${probe.video?.fps}fps ${probe.durationSeconds?.toFixed(1)}秒` : ""}`);
  console.log(`  ${mark(!!transcript)} 2. 文字起こし      ${transcript ? `${transcript.segments.length}文（${transcript.engine.backend ?? transcript.engine.name}${transcript.engine.computeType ? ` ${transcript.engine.computeType}` : ""} / ${transcript.engine.model}）` : ""}`);
  console.log(`  ${mark(!!terms)} 3. 固有名詞の補正  ${terms ? `候補 ${terms.items.length}件` : ""}`);
  console.log(`  ${mark(!!cuts)} 4. カット候補      ${cuts ? `${cuts.items.length}件` : ""}`);
  console.log(`  ${mark(exists(paths.reviewHtml))} 5. 確認用ページ    ${exists(paths.reviewHtml) ? "review/review.html" : ""}`);
  const tm = readJsonIfExists<Timemap>(paths.timemap);
  const cutLine = (file: string) => {
    const r = readJsonIfExists<CutReport>(file.replace(/.mp4$/, ".report.json"));
    return exists(file) && r ? `${path.basename(file)}（${r.actual.videoSeconds.toFixed(1)}秒）` : "";
  };
  console.log(`  ${mark(exists(paths.cutPreview))} 6. カット（プレビュー） ${cutLine(paths.cutPreview)}`);
  console.log(`  ${mark(exists(paths.cutFinal))} 7. カット（本番品質）   ${cutLine(paths.cutFinal)}`);
  if (tm && cuts && tm.candidatesFingerprint !== cuts.fingerprint) console.log("※ timemap.json が今のカット候補より古いものです（npm run cut -- --force で作り直し）");

  if (!json.source) next.push(`元動画を input/ に置いて npm run analyze -- --project=${id}`);
  else if (!probe) next.push(`npm run analyze -- --project=${id}`);
  else if (!transcript) next.push(`npm run transcribe -- --project=${id}`);

  if (transcript?.talkSubtitle && transcript.talkSubtitle.glossaryFingerprint !== gfp) {
    console.log("\n※ 文字起こしの後に固有名詞辞書が変わっています（prompt に反映するには npm run transcribe -- --force。補正候補だけなら npm run terms）");
  }
  if (transcript && (!terms || terms.glossaryFingerprint !== gfp)) next.push(`npm run terms -- --project=${id}${terms ? "（辞書が変わったので候補を更新）" : ""}`);
  if (transcript && !cuts) next.push(`npm run candidates -- --project=${id}`);
  if (cuts && !exists(paths.reviewHtml)) next.push(`npm run review -- --project=${id}`);

  console.log("\n承認（input/decisions.json）:");
  if (cuts) {
    const { items, stale } = currentCutDecisions(decisions, cuts);
    const s = cutSummary(cuts, items);
    console.log(`  カット: ${s.total}件中 カット ${s.cut}／残す ${s.keep}／未決定 ${s.pending}（カット合計 ${s.cutSeconds.toFixed(1)}秒）${stale ? "　※候補が作り直されたため以前の承認は無効" : ""}`);
    if (s.pending > 0) next.push(`カット候補の確認（review.html またはチャットで「c3は残す、ほかはカット」など）`);
  } else console.log("  カット: 候補なし");
  if (terms) {
    const { items, stale } = currentTermDecisions(decisions, terms);
    const pending = terms.items.filter((t) => !items[t.id] && t.defaultDecision === "pending").length;
    const accepted = terms.items.filter((t) => (items[t.id] ? items[t.id].decision === "accept" : t.defaultDecision === "accept")).length;
    console.log(`  固有名詞: ${terms.items.length}件中 採用 ${accepted}／未決定 ${pending}${stale ? "　※候補が作り直されたため以前の承認は無効" : ""}`);
    if (pending > 0) next.push("固有名詞の補正候補の確認");
  }
  if (decisions.history.length) console.log(`  最終更新: ${decisions.updatedAt}（${decisions.history.at(-1)!.by}）`);
  const cutsDecided = !!cuts && cutSummary(cuts, currentCutDecisions(decisions, cuts).items).pending === 0;
  if (cutsDecided) {
    if (!exists(paths.cutPreview)) next.push(`npm run cut -- --project=${id}（軽量プレビューを作る）`);
    else if (!exists(paths.cutFinal)) next.push(`intermediate/cut-preview.mp4 を確認 → 問題なければ npm run cut -- --project=${id} --final`);
    else next.push("Phase 3（字幕）は未実装です");
  }

  console.log("\n次にやること:");
  for (const n of next) console.log(`  - ${n}`);
}
