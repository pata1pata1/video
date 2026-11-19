// @ts-check
// 公開前の品質チェック（Pre-Publish Quality Gate）。完成MP4を作っただけでは公開に進めない。
// 規則ベースの採点（0〜100）。基準は STYLE.md の成功サンプル（A001〜A003・N002）と、2026-11-19 の失敗例 nakano-20261119。
//
// 最重要方針：視聴者に文章を読ませない（動画は映像と音声で理解する媒体）。
//   詳細はナレーションで言い、画面の文字は短いキーワード・数字・見出しだけ。1画面1メッセージ。長文カード・台本の文章をそのまま画面に出すのは禁止
//
// 機械で測れないもの（AI 生成感・素人っぽさ・声の単調さ）は reviewNotes に Claude／人の目視の所見として残す。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** 採点の基準（変えるときは STYLE.md・PRODUCTION-HANDOFF.md と合わせる）。 */
export const QUALITY_RULES = {
  /** 採点の版。quality-v1（〜2026-11-19）は visualStrength がなく、図・カード中心の動画も 99 点になった（tank-20261119。人の評価「前よりかなり良い。映像が弱い」）。 */
  version: "quality-v2",
  /** ニュースショートの尺（秒）。成功サンプルは 23〜44 秒。 */
  duration: { ideal: [30, 55], max: 65 },
  /** 同じ画面を見せる時間（秒）。Shorts は数秒ごとに画が変わる。 */
  visual: { avgMax: 4, staticMax: 6, imagesPerMinuteMin: 12 },
  /** 画面の文字（画像の中の文字。字幕は別）。1画面1メッセージ・短いキーワード／数字／見出し。 */
  onScreenText: { maxCharsPerElement: 12, maxElementsPerScreen: 2, maxCharsPerScreen: 20 },
  /** 字幕（1枚）。最大2行・1行あたり約5〜12字。 */
  subtitle: { maxChars: 16, minSec: 0.8, maxCharsPerSec: 9 },
  /** ナレーションの速さ（字/秒）。 */
  narration: { charsPerSec: [6.5, 8.5] },
  /** 音量。 */
  audio: { lufs: [-16, -12], truePeakMax: -1 },
  /**
   * 映像そのものの強さ（visualStrength）。画面が変わる「回数」ではなく、映像自体を見たいと思えるか。
   * 実写の割合（realShareFull で満点）・この出来事そのものの素材（eventShareFull）・動き（footageShareFull）・冒頭の画・画の種類・目視の判断。
   * 図・カード・抽象画像が画面時間の drawnCapShare 以上なら drawnCap 点まで、実写がなければ noRealCap 点まで。
   * overallQuality は overallCapBase + visualStrength × overallCapSlope を超えない（90点台には visualStrength 80 以上が要る）。
   */
  visualStrength: { realShareFull: 0.6, eventShareFull: 0.25, footageShareFull: 0.3, drawnCapShare: 0.5, drawnCap: 55, noRealCap: 35, sameDesignRunMax: 2, overallCapBase: 50, overallCapSlope: 0.5 },
  /** 合格：overall がこれ以上、重要項目（hook・visualPacing・onScreenTextLoad・retentionRisk）がそれぞれ critical 以上、どの項目も floor 以上。 */
  gate: { overall: 70, critical: 50, floor: 40 },
  /** 自動修正の最大回数（超えたら人の確認）。 */
  maxAttempts: 3,
};

export const QUALITY_WEIGHTS = {
  visualStrength: 20,
  hookQuality: 18,
  visualPacing: 14,
  visualVariety: 10,
  onScreenTextLoad: 16,
  subtitleReadability: 7,
  narrationPacing: 12,
  audioQuality: 5,
  informationDensity: 6,
  retentionRisk: 12,
};
const CRITICAL = ["hookQuality", "visualPacing", "onScreenTextLoad", "retentionRisk", "visualStrength"];

const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(100, Math.round(n)));
const META = /整理します|解説します|まとめます|見ていきます|紹介します|お伝えします|概要欄/u;
const HEDGE = /によると|ということです|とみて|とされ|取材では/gu;
const TEXT_ONLY = new Set(["text-card", "date-card", "timeline-card", "chapter-title"]);
const RICH = new Set(["photo", "footage", "map-overview", "city-street", "night-city", "police-generic", "diagram", "icon"]);

/**
 * 画像の「実物らしさ」（visuals.json の images[].realness。なければ種類から決める）。
 *   event       ：この出来事そのものの映像・公式素材（会見・現場の公式写真・公表資料の実物など）
 *   real-object ：実在の物・場所・車両・製品の写真や映像（この出来事のものではないが、話の中心の実物）
 *   generic-real：一般的な街並み・警察署などのイメージ写真（話の中心ではない）
 *   drawn       ：図・模式図・地図・アイコン・数字・テキストカード
 *   abstract    ：抽象的な背景・作り物のイメージ（AI 生成を含む）
 */
export const REALNESS = ["event", "real-object", "generic-real", "drawn", "abstract"];
/** @param {any} v */
export function realnessOf(v) {
  if (v && REALNESS.includes(v.realness)) return v.realness;
  const c = v?.category;
  if (c === "photo" || c === "footage") return "real-object";
  if (c === "city-street" || c === "police-generic") return "generic-real";
  if (c === "night-city" || c === "abstract-news-bg") return "abstract";
  return "drawn";
}

/** 台本・timeline・visuals から、画像の区間（同じ画面が続く時間）を出す。 @param {any} timeline */
export function imageSegments(timeline) {
  /** @type {{ image: string, start: number, end: number, cards: number }[]} */
  const seg = [];
  for (const c of timeline.cards) {
    const last = seg[seg.length - 1];
    if (!last || last.image !== c.image) seg.push({ image: c.image, start: c.start, end: c.end, cards: 1 });
    else (last.end = c.end), last.cards++;
  }
  return seg;
}

/** MP4 の音量（ebur128）と長い無音。ffmpeg がなければ null。 @param {string} mp4 */
export function measureAudio(mp4) {
  if (!fs.existsSync(mp4)) return null;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-af", "ebur128=peak=true,silencedetect=n=-45dB:d=1.5", "-f", "null", "-"], { encoding: "utf8" });
  const out = `${r.stderr ?? ""}`;
  const lufs = Number(out.match(/Integrated loudness:[\s\S]*?I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(out.match(/True peak:[\s\S]*?Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const silences = (out.match(/silence_start/g) ?? []).length;
  return { lufs: Number.isFinite(lufs) ? lufs : null, truePeak: Number.isFinite(peak) ? peak : null, longSilences: silences };
}

/**
 * 採点。入力：script（kind・factIds つき）・timeline（audio/timeline.json）・visuals（images[].onScreenText 必須）・audio（measureAudio）。
 * review（任意）：目視の判断 { visual: { thumbStopping, visualSurprise, understandableWithoutAudio, diagramsLookCheap } }。
 * @param {{ script: any, timeline: any, visuals: any, audio: { lufs: number|null, truePeak: number|null, longSilences: number } | null, review?: any, visualReview?: any, frames?: any }} i
 */
export function scoreQuality(i) {
  const R = QUALITY_RULES;
  const t = i.timeline;
  const dur = t.duration;
  const seg = imageSegments(t);
  /** @type {Record<string, { score: number, findings: string[], fixes: string[], evidence?: any }>} */
  const m = {};
  const sentenceText = (/** @type {any} */ s) => s.cards.map((/** @type {any} */ c) => c.text).join("");

  // ── hookQuality：最初の3秒・10秒 ──
  {
    const f = [], x = [];
    let s = 100;
    const first10 = t.cards.filter((/** @type {any} */ c) => c.start < 10).map((/** @type {any} */ c) => c.text).join("");
    const firstCard = t.cards[0]?.text ?? "";
    const firstSentenceEnd = Math.max(...t.cards.filter((/** @type {any} */ c) => c.sentence === 0).map((/** @type {any} */ c) => c.end));
    if (META.test(first10)) (s -= 30), f.push(`最初の10秒に前置き（「${first10.match(META)?.[0]}」）がある。本題の前に離脱される`), x.push("前置き（整理します・解説します）を消し、一番の驚き・核心を最初の一言で言い切る");
    if (/^(東京|大阪|[^、]{1,6}[都道府県市区町村]の|\d+月\d+日)/u.test(firstCard)) (s -= 15), f.push(`最初の字幕が場所・日付から始まる（「${firstCard}」）。何が起きたかが最初の1秒で分からない`), x.push("場所・日付は後回しにし、出来事の核心（誰が・何を）から入る");
    if (firstSentenceEnd > 5) (s -= 15), f.push(`最初の1文が ${firstSentenceEnd.toFixed(1)} 秒と長い（3〜4秒で言い切る）`), x.push("最初の1文を3〜4秒（約25字以内）にする");
    if (!seg[1] || seg[1].start > 3) (s -= 20), f.push(`最初の画面が ${(seg[1]?.start ?? dur).toFixed(1)} 秒間変わらない（3秒以内に画を変える）`), x.push("冒頭3秒の中で画面を1回以上変える（数字・キーワードのカット）");
    if (!/[？?]|なぜ|実は|まさか|なんと/u.test(first10)) (s -= 10), f.push("冒頭に続きを見たくなる仕掛け（問い・意外性）がない"), x.push("冒頭に問いか意外な一点を入れる（報道にある事実の範囲で）");
    m.hookQuality = { score: clamp(s), findings: f, fixes: x };
  }

  // ── visualPacing：同じ画面が続く時間 ──
  {
    const f = [], x = [];
    const avg = dur / Math.max(1, seg.length);
    const max = Math.max(...seg.map((g) => g.end - g.start));
    const longest = seg.find((g) => g.end - g.start === max);
    let s = 100 - Math.max(0, avg - R.visual.avgMax) * 8 - Math.max(0, max - R.visual.staticMax) * 3;
    if (avg > R.visual.avgMax) f.push(`画面の切り替えが平均 ${avg.toFixed(1)} 秒に1回（目安 ${R.visual.avgMax} 秒以内）`);
    if (max > R.visual.staticMax) f.push(`同じ画面が最長 ${max.toFixed(1)} 秒続く（${longest?.image}。目安 ${R.visual.staticMax} 秒以内）`);
    if (f.length) x.push("1文ごと（2〜4秒）に画を変える。同じ画像を続けるならズーム先・切り抜きを変えて別カットにする");
    m.visualPacing = { score: clamp(s), findings: f, fixes: x };
  }

  // ── visualVariety：画の種類 ──
  {
    const f = [], x = [];
    const imgs = i.visuals?.images ?? [];
    const perMin = (seg.length / dur) * 60;
    const textOnly = imgs.filter((/** @type {any} */ v) => TEXT_ONLY.has(v.category)).length;
    const rich = imgs.filter((/** @type {any} */ v) => RICH.has(v.category)).length;
    const layouts = new Set(imgs.map((/** @type {any} */ v) => v.layout ?? "panel-text")).size;
    let s = 100 - Math.max(0, R.visual.imagesPerMinuteMin - perMin) * 5;
    if (perMin < R.visual.imagesPerMinuteMin) f.push(`画の数が1分あたり ${perMin.toFixed(1)} 枚（目安 ${R.visual.imagesPerMinuteMin} 枚以上）`);
    if (imgs.length && textOnly / imgs.length > 0.4) (s -= 25), f.push(`文字だけの画面が ${textOnly}/${imgs.length} 枚`);
    if (!imgs.some((/** @type {any} */ v) => ["photo", "footage", "map-overview", "diagram", "icon"].includes(v.category))) (s -= 20), f.push("写真・映像・地図・図・アイコンがない（文字と抽象背景だけ）");
    if (layouts <= 1 && imgs.length > 3) (s -= 10), f.push("全画面が同じレイアウト（同じ枠・同じ配色）");
    // 回数だけでなく質：同じ種類・同じレイアウトの画面が続く（カード・模式図の連続）
    const byFile = new Map(imgs.map((/** @type {any} */ v) => [v.file, v]));
    const design = (/** @type {string} */ file) => { const v = byFile.get(file); return `${v?.category ?? "?"}/${v?.layout ?? "panel-text"}`; };
    let run = 1, maxRun = 1;
    for (let k = 1; k < seg.length; k++) (run = design(seg[k].image) === design(seg[k - 1].image) ? run + 1 : 1), (maxRun = Math.max(maxRun, run));
    if (maxRun > 3) (s -= (maxRun - 3) * 6), f.push(`同じデザインの画面が ${maxRun} 回続く。切り替えの回数は多くても、見た目が変わらない`), x.push("同じデザインの画面を3回以上続けない（実写・地図・数字・図解を交互に）");
    if (rich < imgs.length / 2) x.push("写真・映像・地図・図・アイコン・大きな数字で伝える。テキストカードは見出しだけに使う");
    if (layouts <= 1) x.push("レイアウトを章ごとに変える（全面の画・数字の大写し・地図・比較）");
    m.visualVariety = { score: clamp(s), findings: f, fixes: x };
  }

  // ── onScreenTextLoad：画面に読ませる文字の量（最重要方針） ──
  {
    const f = [], x = [];
    const L = R.onScreenText;
    let s = 100;
    const narration = i.script.sentences.map(sentenceText).join("");
    for (const v of i.visuals?.images ?? []) {
      const els = Array.isArray(v.onScreenText) ? v.onScreenText : null;
      if (!els) {
        (s -= 25), f.push(`${v.file}：画面の文字（onScreenText）が登録されていない（文字量を確かめられない）`);
        continue;
      }
      const total = els.reduce((/** @type {number} */ a, /** @type {string} */ e) => a + e.replace(/\s/g, "").length, 0);
      const long = els.filter((/** @type {string} */ e) => e.replace(/\s/g, "").length > L.maxCharsPerElement);
      const shown = seg.filter((g) => g.image === v.file).reduce((a, g) => a + g.end - g.start, 0);
      if (total > L.maxCharsPerScreen) (s -= Math.min(30, (total - L.maxCharsPerScreen) * 1.5)), f.push(`${v.file}：画面の文字が ${total} 字（目安 ${L.maxCharsPerScreen} 字以内）`);
      if (els.length > L.maxElementsPerScreen) (s -= 8), f.push(`${v.file}：文字の要素が ${els.length} 個（1画面1メッセージ。目安 ${L.maxElementsPerScreen} 個まで）`);
      for (const e of long) (s -= 10), f.push(`${v.file}：長文の文字「${e}」（${e.length} 字。目安 ${L.maxCharsPerElement} 字以内）`);
      for (const e of els) if (e.length >= 8 && narration.includes(e.replace(/[\s（）()]/g, ""))) (s -= 5), f.push(`${v.file}：ナレーションの文をそのまま画面に出している（「${e}」）`);
      if (total > 0 && shown > 0 && total / 8 > shown) f.push(`${v.file}：文字を読むのに約 ${(total / 8).toFixed(1)} 秒かかるのに ${shown.toFixed(1)} 秒しか出ていない`);
    }
    if (f.length) x.push("画面は短いキーワード・数字・見出しだけ（例：ナレーション「警視庁は39歳の男を逮捕しました」→ 画面「39歳の男を逮捕」）。説明・出典・注記はナレーションか概要欄へ");
    m.onScreenTextLoad = { score: clamp(s), findings: f, fixes: x };
  }

  // ── subtitleReadability：字幕 ──
  {
    const f = [], x = [];
    let s = 100;
    const S = R.subtitle;
    const long = t.cards.filter((/** @type {any} */ c) => c.text.length > S.maxChars);
    const fast = t.cards.filter((/** @type {any} */ c) => c.end - c.start < S.minSec || c.text.length / Math.max(0.1, c.end - c.start) > S.maxCharsPerSec);
    if (long.length) (s -= long.length * 6), f.push(`${long.length} 枚の字幕が ${S.maxChars} 字を超える（最長 ${Math.max(...long.map((/** @type {any} */ c) => c.text.length))} 字。文字が小さくなる）`);
    if (fast.length) (s -= fast.length * 3), f.push(`${fast.length} 枚の字幕が短時間で切り替わる・速すぎる`);
    if (long.length) x.push(`字幕1枚は ${S.maxChars} 字以内（1行5〜12字×最大2行）。長文を一度に出さない`);
    m.subtitleReadability = { score: clamp(s), findings: f, fixes: x };
  }

  // ── narrationPacing：尺・速さ・言い回し ──
  {
    const f = [], x = [];
    let s = 100;
    const chars = t.cards.reduce((/** @type {number} */ a, /** @type {any} */ c) => a + c.text.length, 0);
    const cps = chars / dur;
    const hedges = (i.script.sentences.map(sentenceText).join("").match(HEDGE) ?? []).length;
    if (dur > R.duration.max) (s -= Math.min(40, (dur - R.duration.max) * 2.5)), f.push(`尺 ${dur.toFixed(1)} 秒（ニュースショートの目安 ${R.duration.ideal[0]}〜${R.duration.ideal[1]} 秒、上限 ${R.duration.max} 秒）`);
    if (cps < R.narration.charsPerSec[0]) (s -= (R.narration.charsPerSec[0] - cps) * 15), f.push(`ナレーションが遅い（${cps.toFixed(1)} 字/秒。目安 ${R.narration.charsPerSec.join("〜")}）`);
    if (hedges / (dur / 60) > 5) (s -= 10), f.push(`伝聞・出典の言い回しが1分に ${(hedges / (dur / 60)).toFixed(1)} 回（「〜によると」「〜ということです」）。テンポが落ちる`);
    if (f.length) x.push("尺を40〜55秒に絞る（事実を厳選）。出典の明示は必要な文だけにまとめ、言い回しを短くする（例：「捜査関係者によると」）。声の速さは 1.2〜1.3 を試す");
    m.narrationPacing = { score: clamp(s), findings: f, fixes: x };
  }

  // ── audioQuality ──
  {
    const f = [], x = [];
    let s = 100;
    const a = i.audio;
    if (!a) (s = 60), f.push("音声を測れない（MP4 がない）");
    else {
      if (a.lufs !== null && (a.lufs < R.audio.lufs[0] || a.lufs > R.audio.lufs[1])) (s -= 15), f.push(`音量 ${a.lufs} LUFS（目安 ${R.audio.lufs.join("〜")}）`);
      if (a.truePeak !== null && a.truePeak > R.audio.truePeakMax) (s -= 15), f.push(`ピーク ${a.truePeak} dBFS`);
      if (a.longSilences) (s -= 10 * a.longSilences), f.push(`1.5秒以上の無音が ${a.longSilences} か所`);
    }
    if (f.length) x.push("音量・無音を直す");
    m.audioQuality = { score: clamp(s), findings: f, fixes: x };
  }

  // ── informationDensity：中身の文の割合 ──
  {
    const f = [], x = [];
    const ss = i.script.sentences;
    const framing = ss.filter((/** @type {any} */ s) => ["transition", "closing"].includes(s.kind) || META.test(sentenceText(s))).length;
    const facts = new Set(ss.flatMap((/** @type {any} */ s) => s.factIds ?? [])).size;
    const perMin = facts / (dur / 60);
    let s = 100 - Math.max(0, framing / ss.length - 0.15) * 200 - Math.max(0, 6 - perMin) * 6;
    if (framing / ss.length > 0.15) f.push(`前置き・つなぎ・締めの文が ${framing}/${ss.length} 文`);
    if (perMin < 6) f.push(`事実が1分あたり ${perMin.toFixed(1)} 個`);
    if (f.length) x.push("つなぎ・前置きの文を減らし、1文1事実で進める");
    m.informationDensity = { score: clamp(s), findings: f, fixes: x };
  }

  // ── visualStrength：映像そのものを見たいと思えるか（回数ではなく質） ──
  {
    const f = [], x = [];
    const V = R.visualStrength;
    const byFile = new Map((i.visuals?.images ?? []).map((/** @type {any} */ v) => [v.file, v]));
    const share = (/** @type {(v: any) => boolean} */ pred) => seg.filter((g) => pred(byFile.get(g.image))).reduce((a, g) => a + g.end - g.start, 0) / Math.max(0.1, dur);
    const real = share((v) => ["event", "real-object"].includes(realnessOf(v))) + share((v) => realnessOf(v) === "generic-real") * 0.5;
    const event = share((v) => realnessOf(v) === "event");
    const footage = share((v) => v?.category === "footage" || v?.motion === true);
    const drawnOrAbstract = share((v) => ["drawn", "abstract"].includes(realnessOf(v)));
    const abstract = share((v) => realnessOf(v) === "abstract");
    // 完成MP4のフレームの測定（i.frames：frames.mjs の analyzeVideo）があれば、宣言（visuals.json）より測定を使う
    const fr = i.frames ?? null;
    const realM = fr ? fr.realFootageRatio : real;
    const footageM = fr ? (fr.motionEvidence.measured ? fr.motionEvidence.movingFrames / fr.motionEvidence.measured : 0) : footage;
    let s = 0;
    s += 35 * Math.min(1, realM / V.realShareFull);
    s += 15 * Math.min(1, event / V.eventShareFull);
    s += 10 * Math.min(1, footageM / V.footageShareFull);
    const opening = realnessOf(byFile.get(seg[0]?.image));
    s += fr ? (fr.openingPhotoLike >= 0.67 ? (opening === "event" ? 10 : 7) : fr.openingPhotoLike > 0 ? 3 : 0) : opening === "event" ? 10 : opening === "real-object" ? 7 : opening === "generic-real" ? 3 : 0;
    const kind = (/** @type {any} */ v) => (["event", "real-object", "generic-real"].includes(realnessOf(v)) ? "real" : v?.category === "map-overview" ? "map" : v?.category === "diagram" ? "diagram" : v?.layout === "big-number" || v?.category === "icon" ? "number" : realnessOf(v) === "abstract" ? "abstract" : "card");
    const kinds = new Set(seg.map((g) => kind(byFile.get(g.image)))).size;
    s += Math.min(10, (kinds - 1) * 2.5);
    // 目視の判断：通常運用は Claude が抜き出したフレームを見て書く visualReview（input/visual-review.json）。
    // なければフレームの測定から目安を出す（人の入力に頼らない）。人の review は採点に使わず、ズレの学習にだけ使う
    const cv = i.visualReview?.judgments;
    let judgmentSource = "frame-metrics";
    if (cv) {
      judgmentSource = "claude-visual-review";
      if (cv.thumbStopping) s += 7; else f.push("Shorts のフィードで止まって見たくなる画がない（Claude の目視）");
      if (cv.visualImpact) s += 6; else f.push("視覚的なインパクトがない（Claude の目視）");
      if (cv.understandableWithoutAudio) s += 7; else f.push("音声なしでは何の話か分からない（Claude の目視）");
      if (cv.looksLikeSlidesOrCheapDiagram) (s -= 10), f.push("安っぽい模式図・スライド資料に見える（Claude の目視）"), x.push("図解は実写の上に重ねる・質感のある図にする・画面全体を単純なカードにしない");
      if (cv.looksAiGeneric) (s -= 5), f.push("AI が作っただけの無機質な画面に見える（Claude の目視）");
    } else if (fr) {
      s += 7 * fr.openingPhotoLike + 6 * Math.min(1, realM / V.realShareFull) + 7 * Math.min(1, realM / 0.5);
      if (fr.flatRatio >= 0.5) (s -= 10), f.push(`平らな図・カードの画面がフレームの ${Math.round(fr.flatRatio * 100)}%（スライド資料に見える）`);
    } else f.push("フレームの測定も Claude の目視もない（目視の点を付けない）");
    // 同じデザインの図・カードの連続
    let run = 1, maxRun = 1;
    const d = (/** @type {string} */ file) => { const v = byFile.get(file); return realnessOf(v) === "drawn" ? `${v?.category}/${v?.layout ?? ""}` : null; };
    for (let k = 1; k < seg.length; k++) (run = d(seg[k].image) && d(seg[k].image) === d(seg[k - 1].image) ? run + 1 : 1), (maxRun = Math.max(maxRun, run));
    if (maxRun > V.sameDesignRunMax) (s -= (maxRun - V.sameDesignRunMax) * 4), f.push(`同じデザインの図・カードが ${maxRun} 画面続く`), x.push("模式図だけで構成しない。図解の間に実物・場所・公式素材を挟む");
    if (abstract > 0.3) (s -= 10), f.push(`抽象画像・イメージ画像が画面時間の ${Math.round(abstract * 100)}%`), x.push("抽象画像に頼らず、実物・場所・公式素材を見せる");
    if (real < 0.4) f.push(`実写の画面が画面時間の ${Math.round(real * 100)}%（目安 ${V.realShareFull * 100}% 以上）`), x.push("可能なら実物・公式素材・場所・物・車両・製品を見せる");
    if (event === 0) f.push("この出来事そのものの映像・公式素材がない（同じ型・一般的な画像だけ）"), x.push("公式の映像・会見・公表資料の実物など、その出来事の素材を探す");
    if (footage === 0) f.push("動く映像がない（静止画とズームだけ）");
    if (opening !== "event" && opening !== "real-object") f.push("冒頭の画が実物ではない"), x.push("冒頭1〜3秒には一番強い画（実物・公式素材）を置く");
    if (fr) for (const r of fr.repeatedVisualPatterns) if (r.frames > 3) (s -= 4), f.push(`似た平らな画面が ${r.from}〜${r.to} 秒に続く（フレームの測定）`);
    if (realM === 0) s = Math.min(s, V.noRealCap), f.push(`実写がない（図・カード・抽象画像だけ。上限 ${V.noRealCap} 点）`);
    else if ((fr ? fr.flatRatio : drawnOrAbstract) >= V.drawnCapShare) s = Math.min(s, V.drawnCap), f.push(`図・カード・抽象画像が画面時間の ${Math.round(drawnOrAbstract * 100)}%（${V.drawnCapShare * 100}% 以上なので上限 ${V.drawnCap} 点）`);
    const cardShare = share((v) => ["text-card", "date-card", "timeline-card", "chapter-title"].includes(v?.category));
    const evidence = { judgmentSource, realFootageRatio: Math.round(realM * 100) / 100, diagramRatio: Math.round(share((v) => v?.category === "diagram") * 100) / 100, cardRatio: Math.round(cardShare * 100) / 100, motionEvidence: fr?.motionEvidence ?? null, repeatedVisualPatterns: fr?.repeatedVisualPatterns ?? [], sampledFrames: fr?.sampledFrames ?? [], strongestFrame: i.visualReview?.strongestFrame ?? fr?.strongestFrame ?? null, weakestFrame: i.visualReview?.weakestFrame ?? fr?.weakestFrame ?? null, strengths: i.visualReview?.strengths ?? [], weaknesses: i.visualReview?.weaknesses ?? [], visualImpactAssessment: i.visualReview?.visualImpactAssessment ?? null };
    m.visualStrength = { score: clamp(s), findings: f, fixes: [...new Set(x)], evidence };
  }

  // ── retentionRisk（高いほど離脱しにくい） ──
  {
    const f = [], x = [];
    let s = 100;
    if (dur > R.duration.max) (s -= 20), f.push("尺が長い");
    if (m.hookQuality.score < 60) (s -= 25), f.push("冒頭で引き込めない");
    if (m.visualPacing.score < 50) (s -= 25), f.push("画面がほとんど変わらない");
    if (m.onScreenTextLoad.score < 50) (s -= 15), f.push("画面の文字を読ませている");
    const last = i.script.sentences[i.script.sentences.length - 1];
    if (last && (last.kind === "closing" || META.test(sentenceText(last)))) (s -= 10), f.push(`最後が事務的な締め（「${sentenceText(last)}」）。最後まで見る理由・コメントする理由がない`);
    if (f.length) x.push("最後は本題の一番強い一言か、視聴者への問いで終える（出典は概要欄にだけ書く）");
    m.retentionRisk = { score: clamp(s), findings: f, fixes: x };
  }

  const w = /** @type {Record<string, number>} */ (QUALITY_WEIGHTS);
  const weighted = clamp(Object.keys(w).reduce((a, k) => a + w[k] * m[k].score, 0) / Object.values(w).reduce((a, b) => a + b, 0));
  // 映像が弱い動画は、文字・尺・字幕・テンポが良くても高得点にしない（90点台には visualStrength 80 以上が要る）
  const VS = R.visualStrength;
  const cap = Math.round(VS.overallCapBase + m.visualStrength.score * VS.overallCapSlope);
  const overall = Math.min(weighted, cap);
  if (overall < weighted) m.visualStrength.findings.push(`映像の強さで overallQuality を ${cap} 点までに抑えた（重み付きの平均 ${weighted}）`);
  const G = R.gate;
  /** @type {string[]} */
  const blocking = [];
  if (overall < G.overall) blocking.push(`overallQuality ${overall} < ${G.overall}`);
  for (const k of CRITICAL) if (m[k].score < G.critical) blocking.push(`${k} ${m[k].score} < ${G.critical}（重要項目）`);
  for (const [k, v] of Object.entries(m)) if (v.score < G.floor && !CRITICAL.includes(k)) blocking.push(`${k} ${v.score} < ${G.floor}`);
  return { rulesVersion: R.version, scores: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.score])), overallQuality: overall, weightedQuality: weighted, overallCap: cap, gate: blocking.length ? "fail" : "pass", blocking, metrics: m, rules: R, weights: QUALITY_WEIGHTS };
}

/** 画面の文字の決まり（画像を作る前・検証で使う）。 @param {any} visuals */
export function checkOnScreenTextRules(visuals) {
  const L = QUALITY_RULES.onScreenText;
  /** @type {string[]} */
  const issues = [];
  for (const v of visuals?.images ?? []) {
    if (!Array.isArray(v.onScreenText)) {
      issues.push(`${v.file}：onScreenText（画面に出す文字の一覧。文字なしは []）がない`);
      continue;
    }
    const total = v.onScreenText.reduce((/** @type {number} */ a, /** @type {string} */ e) => a + e.replace(/\s/g, "").length, 0);
    if (v.onScreenText.length > L.maxElementsPerScreen) issues.push(`${v.file}：文字の要素 ${v.onScreenText.length} 個（1画面1メッセージ、${L.maxElementsPerScreen} 個まで）`);
    if (total > L.maxCharsPerScreen) issues.push(`${v.file}：画面の文字 ${total} 字（${L.maxCharsPerScreen} 字まで）`);
    for (const e of v.onScreenText) if (e.replace(/\s/g, "").length > L.maxCharsPerElement) issues.push(`${v.file}：長文「${e}」（${L.maxCharsPerElement} 字まで。説明はナレーションで）`);
  }
  return issues;
}

/** quality-check の記録（<id>/input/quality-check.json）を読む・足す。最大回数を超えたら人の確認へ。 @param {string} file */
export function appendAttempt(file, result) {
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { attempts: [] };
  const attempts = [...prev.attempts, { attempt: prev.attempts.length + 1, checkedAt: new Date().toISOString(), ...result }];
  const last = attempts[attempts.length - 1];
  const escalation = last.gate === "pass" ? null : attempts.length >= QUALITY_RULES.maxAttempts ? "human-review" : "auto-fix";
  const rec = { maxAttempts: QUALITY_RULES.maxAttempts, attempts, latest: { attempt: last.attempt, gate: last.gate, overallQuality: last.overallQuality, scores: last.scores, escalation } };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

/**
 * 人の評価（--review、任意）と機械の判定（Claude の目視の判断・フレームの測定から出した visualStrength）のズレ。採点には使わない（学習用）。
 * review：{ humanFeedback?, visualVerdict?: "strong"|"weak", visual?: { thumbStopping, visualSurprise, understandableWithoutAudio, diagramsLookCheap } }
 * @param {any} q scoreQuality の結果 @param {any} review @param {any} visualReview
 */
export function compareHumanReview(q, review, visualReview) {
  if (!review) return null;
  const vs = q.scores.visualStrength;
  const machineVerdict = vs >= 60 ? "strong" : "weak";
  const hv = review.visual ?? {};
  const humanVerdict = review.visualVerdict ?? (Object.keys(hv).length ? (hv.thumbStopping && !hv.diagramsLookCheap ? "strong" : "weak") : null);
  const mj = visualReview?.judgments ?? null;
  /** @type {Record<string, { human: boolean, machine: boolean|null }>} */
  const items = {};
  const pairs = [["thumbStopping", "thumbStopping"], ["visualSurprise", "visualImpact"], ["understandableWithoutAudio", "understandableWithoutAudio"], ["diagramsLookCheap", "looksLikeSlidesOrCheapDiagram"]];
  for (const [h, m] of pairs) if (typeof hv[h] === "boolean") items[h] = { human: hv[h], machine: mj && typeof mj[m] === "boolean" ? mj[m] : null };
  const compared = Object.values(items).filter((x) => x.machine !== null);
  return {
    humanFeedback: review.humanFeedback ?? null,
    humanVerdict,
    machineVerdict,
    machineVisualStrength: vs,
    machineJudgmentSource: q.metrics.visualStrength.evidence?.judgmentSource ?? null,
    verdictAgrees: humanVerdict ? humanVerdict === machineVerdict : null,
    judgments: items,
    judgmentAgreement: compared.length ? `${compared.filter((x) => x.human === x.machine).length}/${compared.length}` : null,
  };
}
