// @ts-check
// 通常動画（movie-trivia の pattern）の公開前の品質ゲート（QUALITY_GATE、long-v1。2026-11-20）。
// 縦型ショート（short-movie の quality-v2）とは別の基準：尺は pattern の目安、画を変える間隔は長め、章の構成・サムネイルを見る。
// 「視聴者に文章を読ませない」「実写・この出来事の素材を優先」「冒頭で何の話かを示す」は共通の考え方。基準を下げて通さない。
// 入力：input/script.json・audio/narration.json・assets/asset-sources.json・output/<id>.mp4（音量）・output/thumbnail-*.png・patterns/<p>/config.json
//       input/visual-review.json（任意：Claude が代表コマを見た判断。同じ MP4 のときだけ使う）

export const LONG_QUALITY_RULES = {
  version: "long-v1",
  /** 画を変える間隔（秒）。横長の通常動画はショートより長くてよいが、同じ画を長く見せない。 */
  visual: { avgMax: 10, staticMax: 20 },
  /** 画面の文字（字幕は別）。キーワード・見出しだけ。 */
  onScreenText: { maxCharsPerElement: 14, maxElementsPerLine: 3 },
  /** ナレーションの速さ（字/秒）。pattern の speedScale で変わるので幅を広めに。 */
  narration: { charsPerSec: [5.5, 9.0] },
  audio: { lufs: [-18, -14], truePeakMax: -1 },
  /** 冒頭（pattern の openingSeconds）の長さの上限の倍率。 */
  opening: { maxRatio: 1.5 },
  /** 映像の強さ：実写の割合・この出来事の素材（Pexels 以外）・動く映像の割合。 */
  visualStrength: { realShareFull: 0.6, eventShareFull: 0.25, footageShareFull: 0.3, overallCapBase: 50, overallCapSlope: 0.5 },
  gate: { overall: 70, critical: 50, floor: 40 },
  maxAttempts: 3,
};

export const LONG_QUALITY_WEIGHTS = { visualStrength: 20, hookQuality: 16, visualPacing: 14, onScreenTextLoad: 12, duration: 10, narrationPacing: 10, audioQuality: 8, structure: 10 };
const CRITICAL = ["hookQuality", "visualPacing", "visualStrength", "onScreenTextLoad"];
const META = /整理します|解説します|まとめます|見ていきます|紹介します|お伝えします|概要欄/u;
const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(100, Math.round(n)));
const len = (/** @type {string} */ s) => [...String(s ?? "").replace(/\s/g, "")].length;

/**
 * 1文ごとの見せ方（前の文の画を引き継ぐ。章の最初の文は章の映像）。
 * @param {any} script
 * @returns {{ lineId: string, sceneId: string, key: string | null, kind: "footage" | "photo" | "drawn" | "none", words: string[], texts: string[] }[]}
 */
export function lineVisuals(script) {
  const out = [];
  /** @type {string | null} */
  let current = null;
  /** @type {"footage" | "photo" | "drawn" | "none"} */
  let kind = "none";
  for (const sc of script.scenes ?? []) {
    if (sc.footage) (current = sc.footage), (kind = "footage");
    for (const l of sc.lines ?? []) {
      const v = l.visual ?? {};
      if (v.footage) (current = v.footage), (kind = "footage");
      else if (v.photo) (current = v.photo), (kind = "photo");
      else if (v.diagram || v.stat || v.points || v.data || v.list || v.findings) (current = v.diagram ? `diagram:${v.diagram}` : `card:${l.id}`), (kind = "drawn");
      const texts = [v.headline, ...(v.findings?.items ?? []).map((/** @type {any} */ i) => i?.head ?? i), ...(v.data?.items ?? []).map((/** @type {any} */ i) => `${i.label}${i.value}`), ...(v.list?.items ?? []).map((/** @type {any} */ i) => i.head)].filter((x) => typeof x === "string");
      out.push({ lineId: l.id, sceneId: sc.id, key: current, kind, words: Array.isArray(v.words) ? v.words : [], texts });
    }
  }
  return out;
}

/**
 * @param {{ script: any, narration: any, ledger: Record<string, any>, pattern: any, audio: { integratedLufs: number, truePeakDb: number } | null, mp4Duration: number | null, thumbnails: string[], visualReview: any }} i
 */
export function scoreLongQuality(i) {
  const R = LONG_QUALITY_RULES;
  /** @type {Record<string, { score: number, findings: string[], fixes: string[] }>} */
  const m = {};
  const lines = (i.narration?.lines ?? []).map((/** @type {any} */ l) => ({ ...l, dur: Math.max(0, (l.end ?? 0) - (l.start ?? 0)) }));
  const dur = i.mp4Duration ?? i.narration?.durationSeconds ?? 0;
  const vis = lineVisuals(i.script);
  const visOf = new Map(vis.map((v) => [v.lineId, v]));
  const scriptLines = new Map((i.script.scenes ?? []).flatMap((/** @type {any} */ sc) => (sc.lines ?? []).map((/** @type {any} */ l) => [l.id, l])));

  // 尺：pattern の目安
  {
    const tm = i.pattern?.structure?.targetMinutes ?? [5, 10];
    const [lo, hi] = [tm[0] * 60, tm[1] * 60];
    const f = [];
    let s = 100;
    if (dur < lo) (s = 100 - ((lo - dur) / lo) * 150), f.push(`${Math.round(dur)}秒で pattern の目安（${tm[0]}〜${tm[1]}分）より短い`);
    else if (dur > hi) (s = 100 - ((dur - hi) / hi) * 200), f.push(`${Math.round(dur)}秒で pattern の目安（${tm[0]}〜${tm[1]}分）より長い`);
    m.duration = { score: clamp(s), findings: f, fixes: f.length ? [dur < lo ? "確認済みの事実を文として足す（推測で埋めない）" : "重複・前置きを削る"] : [] };
  }
  // 冒頭
  {
    const f = [];
    let s = 100;
    const opening = (i.narration?.scenes ?? []).find((/** @type {any} */ x) => x.id === "opening") ?? i.narration?.scenes?.[0];
    const first = vis[0];
    if (!first || (first.kind !== "footage" && first.kind !== "photo")) (s -= 40), f.push("最初の画が実際の映像・写真ではない（文字・図で始まる）");
    const os = i.pattern?.structure?.openingSeconds;
    if (opening && typeof os === "number" && opening.end - opening.start > os * R.opening.maxRatio) (s -= 25), f.push(`冒頭が ${Math.round(opening.end - opening.start)} 秒（pattern の目安 ${os} 秒の ${R.opening.maxRatio} 倍まで）`);
    const firstText = scriptLines.get(vis[0]?.lineId)?.text ?? "";
    if (META.test(firstText)) (s -= 25), f.push(`1文目が前置き（「${firstText.slice(0, 20)}…」）`);
    m.hookQuality = { score: clamp(s), findings: f, fixes: f.length ? ["冒頭はこの出来事の一番強い映像・写真で、何の話かを言い切る"] : [] };
  }
  // 画を変える間隔（同じ画を続ける文はまとめる）
  {
    /** @type {number[]} */
    const segs = [];
    let prev = /** @type {string | null | undefined} */ (undefined);
    for (const l of lines) {
      const k = visOf.get(l.id)?.key ?? null;
      if (k !== prev || !segs.length) segs.push(l.dur);
      else segs[segs.length - 1] += l.dur;
      prev = k;
    }
    const avg = segs.length ? segs.reduce((a, b) => a + b, 0) / segs.length : 0;
    const max = segs.length ? Math.max(...segs) : 0;
    const f = [];
    let s = 100;
    if (avg > R.visual.avgMax) (s -= (avg - R.visual.avgMax) * 6), f.push(`画を変える間隔の平均 ${avg.toFixed(1)} 秒（${R.visual.avgMax} 秒以内）`);
    if (max > R.visual.staticMax) (s -= (max - R.visual.staticMax) * 3), f.push(`同じ画が最長 ${max.toFixed(1)} 秒（${R.visual.staticMax} 秒まで）`);
    m.visualPacing = { score: clamp(s), findings: f, fixes: f.length ? ["1〜3文ごとに映像・写真・図を切り替える（同じ素材は別の場面から）"] : [] };
  }
  // 映像の強さ
  {
    let total = 0;
    let real = 0;
    let event = 0;
    let moving = 0;
    for (const l of lines) {
      const v = visOf.get(l.id);
      total += l.dur;
      if (!v || (v.kind !== "footage" && v.kind !== "photo")) continue;
      real += l.dur;
      const src = v.key ? i.ledger?.[v.key] : null;
      if (src && src.provider && src.provider !== "pexels") event += l.dur;
      if (v.kind === "footage" && (!src || src.mediaType !== "photo")) moving += l.dur;
    }
    const share = (/** @type {number} */ x) => (total ? x / total : 0);
    const V = R.visualStrength;
    let s = 40 * Math.min(1, share(real) / V.realShareFull) + 35 * Math.min(1, share(event) / V.eventShareFull) + 25 * Math.min(1, share(moving) / V.footageShareFull);
    const f = [];
    if (share(real) < V.realShareFull) f.push(`実際の映像・写真の時間 ${Math.round(share(real) * 100)}%（${Math.round(V.realShareFull * 100)}% で満点）`);
    if (share(event) < V.eventShareFull) f.push(`この出来事そのものの素材（Pexels 以外）${Math.round(share(event) * 100)}%（${Math.round(V.eventShareFull * 100)}% で満点）`);
    if (share(moving) < V.footageShareFull) f.push(`動く映像 ${Math.round(share(moving) * 100)}%`);
    const review = i.visualReview;
    let judgmentSource = "measured";
    if (review && typeof review.visualStrength === "number") {
      s = (s + review.visualStrength) / 2;
      judgmentSource = "measured+claude-review";
      for (const n of review.notes ?? []) f.push(`目視：${n}`);
    }
    m.visualStrength = { score: clamp(s), findings: f, fixes: f.length ? ["この出来事そのものの映像・公式素材・報道写真（権利と出典を確認）を探す。イメージ映像と図だけで構成しない"] : [], evidence: { judgmentSource, realFootageRatio: share(real), eventRatio: share(event), movingRatio: share(moving) } };
  }
  // 画面の文字
  {
    const f = [];
    let s = 100;
    for (const v of vis) {
      if (v.words.length > R.onScreenText.maxElementsPerLine) (s -= 8), f.push(`${v.lineId}：キーワードが ${v.words.length} 個（${R.onScreenText.maxElementsPerLine} 個まで）`);
      for (const t of [...v.words, ...v.texts]) if (len(t) > R.onScreenText.maxCharsPerElement) (s -= 5), f.push(`${v.lineId}：画面の文字「${t.slice(0, 16)}…」が ${len(t)} 字（${R.onScreenText.maxCharsPerElement} 字まで）`);
    }
    m.onScreenTextLoad = { score: clamp(s), findings: f.slice(0, 12), fixes: f.length ? ["画面の文字は見出し・キーワードだけにし、詳しいことはナレーションで言う"] : [] };
  }
  // ナレーションの速さ
  {
    const chars = lines.reduce((a, /** @type {any} */ l) => a + len(scriptLines.get(l.id)?.text ?? l.caption ?? ""), 0);
    const talk = lines.reduce((a, /** @type {any} */ l) => a + l.dur, 0);
    const cps = talk ? chars / talk : 0;
    const [lo, hi] = R.narration.charsPerSec;
    const f = [];
    let s = 100;
    if (cps < lo) (s -= (lo - cps) * 25), f.push(`ナレーションが遅い（${cps.toFixed(1)} 字/秒、${lo}〜${hi}）`);
    if (cps > hi) (s -= (cps - hi) * 25), f.push(`ナレーションが速い（${cps.toFixed(1)} 字/秒、${lo}〜${hi}）`);
    m.narrationPacing = { score: clamp(s), findings: f, fixes: f.length ? ["文を短く区切る・pattern の voice.json の速さに合わせる"] : [] };
  }
  // 音量
  {
    const f = [];
    let s = 100;
    if (!i.audio) (s = 40), f.push("完成MP4の音量を測れない");
    else {
      const [lo, hi] = R.audio.lufs;
      if (i.audio.integratedLufs < lo || i.audio.integratedLufs > hi) (s -= 30), f.push(`音量 ${i.audio.integratedLufs} LUFS（${lo}〜${hi}）`);
      if (i.audio.truePeakDb > R.audio.truePeakMax) (s -= 30), f.push(`True Peak ${i.audio.truePeakDb} dBTP（${R.audio.truePeakMax} 以下）`);
    }
    m.audioQuality = { score: clamp(s), findings: f, fixes: f.length ? ["encode をやり直す（pattern の render.json の音量）"] : [] };
  }
  // 構成（章・締め・サムネイル）
  {
    const f = [];
    let s = 100;
    const chapters = (i.script.scenes ?? []).filter((/** @type {any} */ x) => x.kind === "chapter").length;
    if (chapters < 2) (s -= 30), f.push(`章が ${chapters} つ（通常動画は2つ以上）`);
    if (!(i.script.scenes ?? []).some((/** @type {any} */ x) => x.kind === "ending")) (s -= 20), f.push("締め（ending）がない");
    if (!i.thumbnails.length) (s -= 30), f.push("サムネイルがない（mt.mjs thumbnails）");
    m.structure = { score: clamp(s), findings: f, fixes: f.length ? ["pattern の構成（opening・chapter × N・ending）とサムネイルをそろえる"] : [] };
  }

  const W = LONG_QUALITY_WEIGHTS;
  const scores = Object.fromEntries(Object.keys(W).map((k) => [k, m[k].score]));
  const weighted = Object.entries(W).reduce((a, [k, w]) => a + w * scores[k], 0) / Object.values(W).reduce((a, b) => a + b, 0);
  const cap = R.visualStrength.overallCapBase + scores.visualStrength * R.visualStrength.overallCapSlope;
  const overallQuality = clamp(Math.min(weighted, cap));
  const blocking = [];
  if (overallQuality < R.gate.overall) blocking.push(`overallQuality ${overallQuality} < ${R.gate.overall}`);
  for (const k of CRITICAL) if (scores[k] < R.gate.critical) blocking.push(`${k} ${scores[k]} < ${R.gate.critical}`);
  for (const [k, v] of Object.entries(scores)) if (v < R.gate.floor && !CRITICAL.includes(k)) blocking.push(`${k} ${v} < ${R.gate.floor}`);
  return { rulesVersion: R.version, gate: blocking.length ? "fail" : "pass", overallQuality, weightedQuality: Math.round(weighted), overallCap: Math.round(cap), scores, blocking, metrics: m };
}
