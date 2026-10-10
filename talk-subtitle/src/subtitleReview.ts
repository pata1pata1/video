// review/subtitles.html: the subtitle draft over intermediate/cut.mp4, editable
// per cue. One self-contained page; the video is referenced relatively, so the
// page only works inside the project folder. Edits go back through
// `npm run subtitles -- import` into input/subtitles.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTextAtomic, type Project } from "./project.ts";
import type { SubtitleDraft, SubtitlePreset, SubtitlesJson } from "./subtitles.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function writeSubtitleReview(project: Project, draft: SubtitleDraft, edits: SubtitlesJson, preset: SubtitlePreset): string {
  const { paths, json } = project;
  const data = {
    project: json.id,
    videoSrc: "../intermediate/cut.mp4",
    draftFingerprint: draft.fingerprint,
    importCommand: `npm run subtitles -- import --project=${json.id} --file=<file>`,
    maxChars: draft.inputs.maxCharsPerLine,
    maxLines: draft.inputs.maxLines,
    preset,
    cues: draft.cues.map((c) => {
      const e = edits.edits[c.id];
      return {
        ...c,
        draftText: c.text,
        edit: e ? { ...(e.text !== undefined ? { text: e.text } : {}), ...(e.deleted ? { deleted: true } : {}), ...(e.ok ? { ok: true } : {}) } : null,
      };
    }),
    dropped: draft.dropped,
  };
  const css = fs.readFileSync(path.join(HERE, "review", "review.css"), "utf8") + fs.readFileSync(path.join(HERE, "review", "subtitles.css"), "utf8");
  const js = fs.readFileSync(path.join(HERE, "review", "subtitles-client.js"), "utf8");
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
  const flagged = draft.cues.filter((c) => c.review).length;

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>字幕確認 ${escapeHtml(json.id)}</title>
<style>${css}</style>
</head>
<body>
<header>
  <h1>字幕案の確認：${escapeHtml(json.id)}</h1>
  <div class="meta">intermediate/cut.mp4（カット後 ${draft.inputs.cutOutputSeconds.toFixed(2)}秒）　字幕 ${draft.cues.length} 件・要確認 ${flagged} 件　preset: ${escapeHtml(draft.inputs.preset)}（1行 ${draft.inputs.maxCharsPerLine} 文字・${draft.inputs.maxLines} 行まで）　まだ焼き込みはしていません</div>
  <div class="summary" id="summary"></div>
  <div class="hint" id="restored" hidden>ブラウザに保存されていた編集途中の状態を復元しました。<button class="btn" id="reset-draft">承認ファイルの状態に戻す</button></div>
</header>
<div class="layout">
  <section class="player">
    <div class="stage">
      <video id="video" controls preload="metadata" playsinline></video>
      <div class="overlay" id="overlay"><div class="sub" id="sub"></div></div>
    </div>
    <div id="video-error" class="hint"></div>
    <div class="row">
      <span class="time" id="time"></span>
      <label>速度 <select id="rate"><option value="0.75">0.75</option><option value="1" selected>1.0</option><option value="1.25">1.25</option><option value="1.5">1.5</option></select></label>
      <label><input type="checkbox" id="follow" checked> 再生中の字幕へスクロール</label>
    </div>
    <p class="hint">字幕の見た目はブラウザでの近似です（本番は Remotion で焼き込み）。改行は文字の中で Enter。</p>
    <div class="export">
      <strong>修正を反映する</strong>
      <div class="row" style="margin-top:6px">
        <button class="btn primary" id="export">ファイルに書き出す</button>
        <button class="btn" id="copy">クリップボードにコピー</button>
      </div>
      <p class="hint">書き出したあと、次のコマンドで input/subtitles.json に取り込みます（Claude に「書き出した」と伝えても大丈夫です）：</p>
      <code id="import-cmd"></code>
      <p class="hint">この画面の操作はブラウザ内だけに保存されます。取り込むまで反映されません。</p>
    </div>
  </section>
  <section>
    <div class="toolbar">
      <select id="filter">
        <option value="all">すべて</option>
        <option value="review">要確認（未確認）</option>
        <option value="flagged">要確認（すべて）</option>
        <option value="quote">元投稿の読み上げ</option>
        <option value="edited">編集・削除したもの</option>
      </select>
    </div>
    <div id="cue-list"></div>
    <details class="export">
      <summary>字幕に入れなかった語（${draft.dropped.length}）</summary>
      <ul class="dropped" id="dropped"></ul>
    </details>
  </section>
</div>
<script type="application/json" id="data">${dataJson}</script>
<script>${js}</script>
</body>
</html>
`;
  writeTextAtomic(paths.subtitlesHtml, html);
  return paths.subtitlesHtml;
}
