// review/review.html: one self-contained page (data, CSS and JS inlined).
// The video is referenced relatively (../input/… or ../intermediate/
// review-proxy.mp4), so the page only works inside the project folder.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProbeJson } from "./analyze.ts";
import { CUT_KIND_LABELS, type CutCandidatesJson } from "./candidates.ts";
import { currentCutDecisions, currentTermDecisions, loadDecisions } from "./decisions.ts";
import type { Transcript } from "./transcript.ts";
import { readJsonIfExists, writeTextAtomic, type Project } from "./project.ts";
import type { CorrectedTranscript, TermCandidatesJson } from "./terms.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildReviewHtml(project: Project): { html: string; videoSrc: string } {
  const { paths, json } = project;
  const cuts = readJsonIfExists<CutCandidatesJson>(paths.cutCandidates);
  if (!cuts) throw new Error("cut-candidates.json がありません。");
  const terms = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  const transcript = readJsonIfExists<Transcript>(paths.transcript);
  const corrected = readJsonIfExists<CorrectedTranscript>(paths.transcriptCorrected);
  const probe = readJsonIfExists<ProbeJson>(paths.probe);
  const decisions = loadDecisions(paths);

  const useProxy = probe && !probe.browserPlayable && fs.existsSync(paths.proxy);
  const rel = useProxy ? "intermediate/review-proxy.mp4" : json.source!.file;
  const videoSrc = "../" + rel.split("/").map(encodeURIComponent).join("/");

  const correctedById = new Map((corrected?.segments ?? []).map((s) => [s.id, s.text]));
  const data = {
    project: json.id,
    videoSrc,
    decideCommand: `npm run decide -- --project=${json.id}`,
    cuts: { fingerprint: cuts.fingerprint, items: cuts.items, kindLabels: CUT_KIND_LABELS },
    terms: terms ? { fingerprint: terms.fingerprint, items: terms.items, found: terms.found } : null,
    decisions: {
      cuts: currentCutDecisions(decisions, cuts).items,
      terms: currentTermDecisions(decisions, terms).items,
    },
    segments: (transcript?.segments ?? []).map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text, corrected: correctedById.get(s.id) ?? null })),
  };

  const v = probe?.video;
  const meta = [
    json.source?.file,
    v ? `${v.width}×${v.height}（${v.aspectLabel}・${v.orientation === "portrait" ? "縦" : v.orientation === "landscape" ? "横" : "正方形"}${v.rotation ? `・回転${v.rotation}°` : ""}）` : null,
    v?.fps ? `${v.fps}fps` : null,
    probe?.durationSeconds ? `${probe.durationSeconds.toFixed(1)}秒` : null,
    useProxy ? "確認用プロキシで再生中" : null,
  ].filter(Boolean).join("　");

  const css = fs.readFileSync(path.join(HERE, "review", "review.css"), "utf8");
  const js = fs.readFileSync(path.join(HERE, "review", "review-client.js"), "utf8");
  // "</" inside the JSON would close the <script> element.
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>カット確認 ${escapeHtml(json.id)}</title>
<style>${css}</style>
</head>
<body>
<header>
  <h1>カット・固有名詞の確認：${escapeHtml(json.id)}</h1>
  <div class="meta">${escapeHtml(meta)}</div>
  <div class="summary" id="summary"></div>
  <div class="hint" id="restored" hidden>ブラウザに保存されていた編集途中の状態を復元しました。<button class="btn" id="reset-draft">承認ファイルの状態に戻す</button></div>
  <div class="hint" id="notice" hidden></div>
</header>
<div class="layout">
  <section class="player">
    <video id="video" controls preload="metadata" playsinline></video>
    <div id="video-error" class="hint"></div>
    <div class="row">
      <span class="time" id="time"></span>
      <label><input type="checkbox" id="preview-cuts"> カットを適用して再生</label>
      <label>速度 <select id="rate"><option value="0.75">0.75</option><option value="1" selected>1.0</option><option value="1.25">1.25</option><option value="1.5">1.5</option><option value="2">2.0</option></select></label>
    </div>
    <div class="hint">「カットを適用して再生」をオンにすると、カットに決めた区間を飛ばして再生します（つながりの確認用）。</div>
    <div class="export">
      <strong>承認内容を反映する</strong>
      <div class="row" style="margin-top:6px">
        <button class="btn primary" id="export">ファイルに書き出す</button>
        <button class="btn" id="copy">クリップボードにコピー</button>
      </div>
      <p class="hint">書き出したあと、次のコマンドで input/decisions.json に取り込みます（Claude に「書き出した」と伝えても大丈夫です）：</p>
      <code id="import-cmd"></code>
      <p class="hint">この画面の操作はブラウザ内だけに保存されます。取り込むまで承認済みにはなりません。</p>
    </div>
  </section>
  <section>
    <nav class="tabs">
      <button class="on" data-tab="tab-cuts">カット候補</button>
      <button data-tab="tab-terms">固有名詞</button>
      <button data-tab="tab-text">全文</button>
    </nav>
    <div class="tab" id="tab-cuts">
      <div class="toolbar">
        <select id="cut-filter">
          <option value="all">すべて</option>
          <option value="pending">未決定</option>
          <option value="cut">カット</option>
          <option value="keep">残す</option>
          <option value="suggest-cut">カット提案のみ</option>
        </select>
        <select id="cut-kind"><option value="all">すべての種類</option></select>
        <button class="btn" id="bulk-cut-suggested">未決定のカット提案をすべてカット</button>
        <button class="btn" id="bulk-keep-rest">未決定をすべて残す</button>
      </div>
      <div id="cut-list"></div>
    </div>
    <div class="tab" id="tab-terms" hidden><div id="term-list"></div></div>
    <div class="tab" id="tab-text" hidden>
      <p class="hint">クリックでその位置へ移動。波線は固有名詞を補正した文（マウスを乗せると補正前）、取り消し線はカットに決めた範囲に含まれる文。</p>
      <div id="seg-list"></div>
    </div>
  </section>
</div>
<script type="application/json" id="data">${dataJson}</script>
<script>${js}</script>
</body>
</html>
`;
  return { html, videoSrc };
}

export function writeReviewHtml(project: Project): string {
  const { html } = buildReviewHtml(project);
  writeTextAtomic(project.paths.reviewHtml, html);
  return project.paths.reviewHtml;
}
