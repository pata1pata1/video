// Console summary of one observation (what Claude reads back to the user).

import { CUT_KIND_LABELS, type CutKind } from "../candidates.ts";
import { fmtTime } from "../cli.ts";
import type { Transcript } from "../transcript.ts";
import type { Observation, ObservationEvent } from "./observation.ts";
import type { Reconstruction } from "./reconstruct.ts";

/** Words of the source transcript whose middle lies in [from, to). */
function wordsIn(t: Transcript | null, from: number, to: number): string {
  if (!t) return "";
  return t.segments
    .flatMap((s) => s.words)
    .filter((w) => (w.start + w.end) / 2 >= from && (w.start + w.end) / 2 < to)
    .map((w) => w.text)
    .join("");
}

export function printReconstruction(r: Reconstruction, source: Transcript | null, options: { list?: boolean } = {}) {
  const q = r.quality;
  console.log(`復元: 元動画 ${r.source.durationSeconds.toFixed(1)}秒 → 完成動画 ${r.final.durationSeconds.toFixed(1)}秒（残した割合 ${Math.round(r.stats.keptRatio * 100)}%）`);
  console.log(`  残した区間 ${r.segments.length}・カット ${r.stats.cuts}回（${r.stats.cutsPerMinute}回／分）・削除 ${r.removed.length}区間 ${r.stats.removedSeconds.toFixed(1)}秒`);
  console.log(`  対応の精度: 話し声の ${(q.matchedSpeechRatio * 100).toFixed(1)}% を元動画の位置で再現（話し声 ${q.speechSeconds.toFixed(1)}秒）、相関の平均 ${q.meanNcc}`);
  console.log(`  音声の窓: ${q.windows.total}（話し声 ${q.windows.voiced}・対応 ${q.windows.matched}：前の窓と同じ位置 ${q.windows.byPrevious}・文字起こしから ${q.windows.byText}・全体検索 ${q.windows.byGlobal}）／文字の対応 ${q.textAnchors}`);
  const sp = r.speed;
  console.log(`  再生速度: ${{ unchanged: "変更なし", changed: "変更あり（要確認）", unknown: "判定できず" }[sp.verdict]}${sp.ratio !== null ? `（${sp.ratio}倍、長い区間 ${sp.checks.length}か所で測定、ずれ最大 ${Math.max(0, ...sp.checks.map((c) => Math.abs(c.driftMs))).toFixed(2)}ms）` : ""}`);
  const gains = r.segments.map((s) => s.gain).filter((g) => g > 0);
  if (gains.length) console.log(`  音量: 完成動画は元動画の約 ${(20 * Math.log10(gains.sort((a, b) => a - b)[gains.length >> 1])).toFixed(1)}dB`);
  if (q.reordered || q.overlaps) console.log(`  ※ 元動画の順番と違う所／同じ部分を2回使った所があります（並べ替え ${q.reordered ? "あり" : "なし"}・重なり ${q.overlaps}）`);
  const unc = r.segments.flatMap((s) => [s.boundaryUncertainty.start]).filter((u) => u > 0);
  if (unc.length) console.log(`  カット位置の幅（間の中で、どちら側でも同じに聞こえる範囲）: 中央値 ${(unc.sort((a, b) => a - b)[unc.length >> 1] * 1000).toFixed(0)}ms・最大 ${(Math.max(...unc) * 1000).toFixed(0)}ms`);
  if (r.unmatched.length) console.log(`  元動画に見つからない話し声: ${r.unmatched.length}か所・${r.unmatched.reduce((n, u) => n + u.outEnd - u.outStart, 0).toFixed(2)}秒（${r.unmatched.slice(0, 6).map((u) => fmtTime(u.outStart)).join("、")}${r.unmatched.length > 6 ? "…" : ""}）`);
  if (!options.list) return;
  console.log("\n削除した区間（元動画の時刻）:");
  for (const x of r.removed) {
    const text = wordsIn(source, x.srcStart, x.srcEnd);
    const kind = x.speechSeconds >= 0.15 ? `声 ${x.speechSeconds.toFixed(2)}秒` : "間のみ";
    console.log(`  ${fmtTime(x.srcStart)}–${fmtTime(x.srcEnd)} ${x.seconds.toFixed(2).padStart(6)}秒 [${kind}]  ${text ? `「${text.length > 60 ? text.slice(0, 60) + "…" : text}」` : ""}`);
  }
}

const fmt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? "—" : `${n}${unit}`);
const BOUNDARY_LABELS = { sentence: "文末（。）", comma: "読点（、）", segment: "文の区切り", none: "句の途中" } as const;

export function printObservation(o: Observation) {
  const s = o.summary;
  const count = (t: ObservationEvent["type"]) => o.events.filter((e) => e.type === t).length;
  console.log(`観察: ${o.project}（scope: ${o.scope}・${o.scopeReason}／${o.format.width ?? "?"}×${o.format.height ?? "?"}）`);
  console.log(`  状態: カット承認 ${o.completeness.cutDecisions}／timemap ${o.completeness.timemap}／字幕 ${o.completeness.subtitles}／完成動画 ${o.completeness.final ? "あり" : "なし"}`);
  console.log(`  判断の件数: 合計 ${o.events.length}件（カット候補 ${count("cut-candidate")}・削除区間 ${count("cut-range")}・間 ${count("pause")}・フィラー ${count("filler")}・字幕 ${count("cue")}・字幕の修正 ${count("subtitle-edit")}・固有名詞 ${count("term")}・読み上げ ${count("quote")}）`);

  console.log("\nテンポ:");
  console.log(`  ${fmt(s.sourceSeconds)}秒 → ${fmt(s.outputSeconds)}秒（残した割合 ${s.keptRatio === null ? "—" : `${Math.round(s.keptRatio * 100)}%`}）、カット ${fmt(s.cutsPerMinute)}回／分、話す速さ ${fmt(s.charsPerSecond)}字／秒`);
  const kinds = Object.entries(s.removedSecondsByKind).sort((a, b) => b[1] - a[1]);
  const k = s.cuts;
  if (k.removedRanges) {
    console.log(`  つなぎ目 ${k.joins}・削除 ${k.removedRanges}区間 ${k.removedSeconds.toFixed(1)}秒（間だけ ${k.pauseOnly.count}区間 ${k.pauseOnly.seconds.toFixed(1)}秒・中央値 ${fmt(k.pauseOnly.median, "秒")}／話した部分を含む ${k.speech.count}区間 ${k.speech.seconds.toFixed(1)}秒・中央値 ${fmt(k.speech.median, "秒")}）、残した区間の長さ 中央値 ${fmt(k.keptSegmentMedianSeconds === null ? null : Math.round(k.keptSegmentMedianSeconds * 100) / 100, "秒")}`);
  }
  if (kinds.length) console.log(`  削った時間: ${kinds.map(([k, v]) => `${CUT_KIND_LABELS[k as CutKind] ?? k} ${v.toFixed(1)}秒`).join("、")}`);

  const c = s.candidates;
  if (c.total) {
    console.log("\nカット候補への判断:");
    console.log(`  ${c.total}件：カット ${c.cut}／残す ${c.keep}／未決定 ${c.pending}`);
    console.log(`  カット提案 → そのままカット ${c.agreeWithCut}・残した ${c.disagreeWithCut}　確認のみ → カット ${c.reviewResolvedCut}・残す ${c.reviewResolvedKeep}　範囲の調整 ${c.adjusted}`);
  }
  const byKind = new Map<string, Record<string, number>>();
  for (const e of o.events) {
    if (e.type !== "cut-candidate") continue;
    const key = `${CUT_KIND_LABELS[e.features.kind as CutKind] ?? e.features.kind}（${e.features.suggestion === "cut" ? "カット提案" : "確認のみ"}）`;
    const m = byKind.get(key) ?? {};
    m[e.outcome.decision] = (m[e.outcome.decision] ?? 0) + 1;
    byKind.set(key, m);
  }
  for (const [k, m] of byKind) console.log(`    ${k}: ${Object.entries(m).map(([d, n]) => `${{ cut: "カット", keep: "残す", pending: "未決定" }[d] ?? d} ${n}`).join("・")}`);

  const ap = s.audioPauses;
  if (ap) {
    console.log("\n完成動画の間（音声で測定）:");
    console.log(`  ${ap.count}か所：中央値 ${fmt(ap.median, "秒")}・上位10% ${fmt(ap.p90, "秒")}・最大 ${fmt(ap.max, "秒")}、0.3秒以上 ${ap.atLeast03}か所`);
    console.log(`  つなぎ目の間 ${ap.atCut.count}か所（中央値 ${fmt(ap.atCut.median, "秒")}）／カットしていない間 ${ap.inside.count}か所（中央値 ${fmt(ap.inside.median, "秒")}）`);
  }
  console.log("\n残した間（文字起こしの語と語の間、中央値）:");
  for (const b of ["sentence", "comma", "segment", "none"] as const) {
    const n = o.events.filter((e) => e.type === "pause" && !e.features.edge && e.features.boundary === b).length;
    if (n) console.log(`  ${BOUNDARY_LABELS[b]}: 元 ${fmt(s.pauses.sourceMedianByBoundary[b], "秒")} → ${fmt(s.pauses.keptMedianByBoundary[b], "秒")}（${n}か所）`);
  }
  const prov = new Map<string, number>();
  for (const e of o.events) if (e.type === "pause") prov.set(`${e.outcome.action}/${e.outcome.provenance}`, (prov.get(`${e.outcome.action}/${e.outcome.provenance}`) ?? 0) + 1);
  if (prov.size) console.log(`  内訳: ${[...prov].map(([k, n]) => `${k} ${n}`).join("、")}`);

  console.log("\nフィラー（文字起こしに出たもの）:");
  console.log(`  ${s.fillers.count}件中 カット ${s.fillers.cut}`);
  for (const [w, v] of Object.entries(s.fillers.byWord).sort((a, b) => b[1].seen - a[1].seen)) {
    console.log(`    ${w}: ${v.seen}件・カット ${v.cut}・字幕から省いた ${v.omittedInSubtitle}`);
  }

  const t = s.subtitles;
  if (t.cues || t.edited || t.deleted) {
    console.log("\n字幕:");
    console.log(`  ${t.cues}枚（1行 ${t.oneLine}・2行 ${t.twoLines}）、文字数 中央値 ${fmt(t.medianChars)}・最大 ${fmt(t.maxChars)}、表示 中央値 ${fmt(t.medianSeconds, "秒")}、${fmt(t.medianCharsPerSecond)}字／秒`);
    console.log(`  修正 ${t.edited}・削除 ${t.deleted}・確認OK ${t.confirmed}`);
    const cats = new Map<string, number>();
    for (const e of o.events) if (e.type === "subtitle-edit") for (const k of e.features.categories) cats.set(k, (cats.get(k) ?? 0) + 1);
    if (cats.size) console.log(`  修正の種類: ${[...cats].map(([k, n]) => `${k} ${n}`).join("、")}`);
  }

  if (s.terms.total || s.quotes.lines || o.glossary.entries) {
    console.log("\n固有名詞・読み上げ:");
    console.log(`  補正候補 ${s.terms.total}件：採用 ${s.terms.accepted}・不採用 ${s.terms.rejected}・表記を指定 ${s.terms.customSpelling}　辞書 ${o.glossary.entries}語（誤認識 ${o.glossary.misrecognitions}形）`);
    console.log(`  投稿の行 ${s.quotes.lines}：投稿の表記を採用 ${s.quotes.usedPost}・要確認つき ${s.quotes.flagged}・読み上げていない ${s.quotes.notFound}`);
  }

  console.log(`\n判断の記録: 承認の履歴 ${o.history.decisionEntries.map((d) => `${d.by} ${d.count}`).join("・") || "なし"}（範囲の調整 ${o.history.rangeAdjustments}）`);
  console.log("\n記録できていないこと:");
  for (const g of o.gaps) console.log(`  - ${g}`);
}
