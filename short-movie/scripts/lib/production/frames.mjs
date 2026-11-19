// @ts-check
// 完成MP4のフレームを抜き出して、映像そのものを測る（visualStrength の自動評価の材料）。人の入力なしで動く。
//
//   抜き出す時刻：0・1・2・3・5・8 秒、以降 2.5 秒ごと、最後のフレーム（sampleTimes）
//   1枚ごとに画像パネル（字幕帯を除く x107-973 y330-1875）を縮小して測る：
//     edge（輝度の差が大きい隣り合う画素の割合＝きめ・細部）・colors（量子化した色の数）・flat（上位8色が占める割合＝平らな塗り）
//     → photoLike（実写らしい：細部が多く、色が多く、平らな塗りが少ない）。図・カード・模式図は flat が高く photoLike にならない
//   動き：各時刻と 0.33 秒後の差（ゆっくりズームだけなら小さい。動く映像なら大きい）
//   同じデザインの繰り返し：隣り合う抜き出しの色の分布が似ていて、どちらも平らな画面
// Claude は同じフレーム（contact sheet）を見て visual-review.json（目視の判断）を書く。人の --review は任意（学習用の比較）。

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const FRAME_RULES = {
  /** 画像パネル（news-short-top）。 */
  panel: { x: 107, y: 330, w: 866, h: 1545 },
  /** 測るときの縮小サイズ。 */
  probe: { w: 54, h: 96 },
  fixed: [0, 1, 2, 3, 5, 8],
  every: 2.5,
  motionDelta: 0.33,
  /** photoLike の判定。 */
  photo: { minEdge: 0.12, minColors: 90, maxFlat: 0.55 },
  /** 動いていると見なす差（0〜1）。ゆっくりズーム（1.00〜1.04 倍）は 0.02 前後。 */
  motionDiff: 0.06,
  /** 動きを測るとき、同じ場面と見なす色の分布の近さ（切り替えを動きと数えない）。 */
  sameScene: 0.7,
  /** 同じデザインと見なす色の分布の近さ（0〜1）。 */
  sameDesign: 0.8,
};

/** @param {number} duration */
export function sampleTimes(duration) {
  const R = FRAME_RULES;
  const end = Math.max(0, duration - 0.05);
  const ts = R.fixed.filter((t) => t < end);
  for (let t = R.fixed[R.fixed.length - 1] + R.every; t < end - 1; t += R.every) ts.push(Math.round(t * 10) / 10);
  ts.push(Math.round(end * 100) / 100);
  return [...new Set(ts)];
}

/** 1枚の縮小 RGB（rgb24）を測る。 @param {Buffer|Uint8Array} buf @param {number} w @param {number} h */
export function analyzeFrame(buf, w, h) {
  const R = FRAME_RULES;
  const lum = new Float32Array(w * h);
  /** @type {Map<number, number>} */
  const hist = new Map();
  for (let i = 0; i < w * h; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    hist.set(q, (hist.get(q) ?? 0) + 1);
  }
  let edges = 0, pairs = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x + 1 < w) (pairs++, Math.abs(lum[i] - lum[i + 1]) > 12 && edges++);
    if (y + 1 < h) (pairs++, Math.abs(lum[i] - lum[i + w]) > 12 && edges++);
  }
  const counts = [...hist.values()].sort((a, b) => b - a);
  const flat = counts.slice(0, 8).reduce((a, b) => a + b, 0) / (w * h);
  const edge = edges / Math.max(1, pairs);
  const colors = hist.size;
  let mean = 0;
  for (const l of lum) mean += l;
  mean /= lum.length;
  let v = 0;
  for (const l of lum) v += (l - mean) ** 2;
  const contrast = Math.sqrt(v / lum.length) / 128;
  const photoLike = edge >= R.photo.minEdge && colors >= R.photo.minColors && flat <= R.photo.maxFlat;
  return { edge: round(edge), colors, flat: round(flat), contrast: round(contrast), photoLike, hist };
}

const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;

/** 2枚の差（0〜1）。 @param {Buffer|Uint8Array} a @param {Buffer|Uint8Array} b */
export function frameDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / (a.length * 255);
}

/** 色の分布の近さ（ヒストグラムの共通部分、0〜1）。 @param {Map<number, number>} a @param {Map<number, number>} b @param {number} n */
export function histSimilarity(a, b, n) {
  let s = 0;
  for (const [k, v] of a) s += Math.min(v, b.get(k) ?? 0);
  return s / n;
}

/** MP4 の t 秒の画像パネルを縮小 rgb24 で読む（ffmpeg）。 @param {string} mp4 @param {number} t */
export function probeFrame(mp4, t) {
  const { panel: p, probe } = FRAME_RULES;
  const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", `crop=${p.w}:${p.h}:${p.x}:${p.y},scale=${probe.w}:${probe.h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  return r.stdout;
}

/**
 * フレームの測定値（時刻ごと）から、映像の根拠をまとめる（純粋関数。テストはこれを使う）。
 * @param {{ t: number, edge: number, colors: number, flat: number, contrast: number, photoLike: boolean, motion: number|null, similarToPrev: number|null }[]} frames
 */
export function summarizeFrames(frames) {
  const R = FRAME_RULES;
  const n = Math.max(1, frames.length);
  const photo = frames.filter((f) => f.photoLike);
  const opening = frames.filter((f) => f.t <= 3);
  // 動く映像：実写らしい画面の中で、同じ場面のまま画素が動いている（似た図どうしの切り替えを動きと数えない）
  const moving = frames.filter((f) => f.photoLike && f.motion !== null && f.motion >= R.motionDiff);
  /** @type {{ from: number, to: number, frames: number }[]} */
  const repeated = [];
  let run = null;
  for (let i = 1; i < frames.length; i++) {
    const same = !frames[i].photoLike && !frames[i - 1].photoLike && (frames[i].similarToPrev ?? 0) >= R.sameDesign;
    if (same) run ? ((run.to = frames[i].t), run.frames++) : (run = { from: frames[i - 1].t, to: frames[i].t, frames: 2 });
    else if (run) repeated.push(run), (run = null);
  }
  if (run) repeated.push(run);
  // 画の強さの目安：実写らしさ（細部・色）と明暗の幅
  const impact = (/** @type {any} */ f) => (f.photoLike ? 0.5 : 0) + Math.min(0.3, f.edge) + Math.min(0.2, f.contrast * 0.4);
  const byImpact = [...frames].sort((a, b) => impact(b) - impact(a));
  return {
    sampledFrames: frames.map(({ t, edge, colors, flat, contrast, photoLike, motion }) => ({ t, edge, colors, flat, contrast, photoLike, motion })),
    realFootageRatio: round(photo.length / n),
    flatRatio: round(1 - photo.length / n),
    openingPhotoLike: opening.length ? round(opening.filter((f) => f.photoLike).length / opening.length) : 0,
    motionEvidence: { movingFrames: moving.length, measured: frames.filter((f) => f.motion !== null).length, maxDiff: round(Math.max(0, ...frames.map((f) => f.motion ?? 0))) },
    repeatedVisualPatterns: repeated,
    strongestFrame: byImpact[0] ? { t: byImpact[0].t, photoLike: byImpact[0].photoLike } : null,
    weakestFrame: byImpact[byImpact.length - 1] ? { t: byImpact[byImpact.length - 1].t, photoLike: byImpact[byImpact.length - 1].photoLike } : null,
  };
}

/**
 * MP4 からフレームを抜き出して測る。outDir があれば 270x480 の PNG と contact sheet も作る（Claude の目視用）。
 * @param {string} mp4 @param {number} duration @param {string|null} outDir
 */
export function analyzeVideo(mp4, duration, outDir = null) {
  const times = sampleTimes(duration);
  const { probe } = FRAME_RULES;
  /** @type {any[]} */
  const frames = [];
  let prevHist = null;
  for (const t of times) {
    const buf = probeFrame(mp4, t);
    if (!buf) continue;
    const a = analyzeFrame(buf, probe.w, probe.h);
    const t2 = Math.min(duration - 0.05, t + FRAME_RULES.motionDelta);
    const buf2 = t2 > t ? probeFrame(mp4, t2) : null;
    // 画面の切り替え（クロスフェード）は色の分布が大きく変わる。同じ場面（分布が近い）のまま画素が動いたときだけ「動き」と数える
    const sameScene = buf2 ? histSimilarity(a.hist, analyzeFrame(buf2, probe.w, probe.h).hist, probe.w * probe.h) >= FRAME_RULES.sameScene : false;
    const motion = buf2 ? (sameScene ? round(frameDiff(buf, buf2)) : 0) : null;
    frames.push({ t, edge: a.edge, colors: a.colors, flat: a.flat, contrast: a.contrast, photoLike: a.photoLike, motion, similarToPrev: prevHist ? round(histSimilarity(a.hist, prevHist, probe.w * probe.h)) : null });
    prevHist = a.hist;
  }
  let sheet = null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    times.forEach((t, i) => spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=270:480", path.join(outDir, `f${String(i).padStart(2, "0")}.png`)]));
    const cols = Math.min(8, times.length);
    const rows = Math.ceil(times.length / cols);
    sheet = path.join(outDir, "contact-sheet.png");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(outDir, "f%02d.png"), "-vf", `tile=${cols}x${rows}`, "-frames:v", "1", sheet]);
  }
  return { times, ...summarizeFrames(frames), contactSheet: sheet };
}
