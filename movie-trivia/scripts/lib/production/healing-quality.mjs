// @ts-check
// 公開前の品質ゲート healing-v1（ヒーリング音楽の長尺 healing-long、2026-11-23、セット02）。
// 語りがないので long-v2（冒頭3秒・注意書き・ナレーションの速さ）は使わない。測るのは：尺・音量・暗転と無音の切れ目・場面の変化（繰り返しの量産に見せない）・
// 素材の出どころ・効果の断定と煽り・サムネイル（mystic 型）・映像の目視（神秘的な世界観、visual-review.json）。

import { claimIssues } from "../../healing.mjs";

export const HEALING_QUALITY_RULES = {
  version: "healing-v1",
  passScore: 80,
  maxAttempts: 3,
  durationTolerance: 0.05,
  lufs: { min: -20, max: -14 },
  truePeakMax: -1,
  maxSceneSec: 300,
  sceneEverySec: 300,
};

/**
 * @param {{ healing: any, script: any, ledger: Record<string, any>, mp4Duration: number, audio: { integratedLufs: number, truePeakDb: number },
 *   gaps: { black: number[][], silence: number[][] }, thumbnails: string[], visualReview: any, durationTarget?: { min: number, max: number, target: number } | null }} i
 */
export function scoreHealingQuality(i) {
  const R = HEALING_QUALITY_RULES;
  const h = i.healing;
  /** @type {Record<string, { score: number, findings: string[], fixes: string[], evidence?: any }>} */
  const metrics = {};
  /** @type {string[]} */
  const blocking = [];
  const put = (/** @type {string} */ k, /** @type {number} */ score, /** @type {string[]} */ findings, /** @type {string[]} */ fixes, block = false, evidence = undefined) => {
    metrics[k] = { score, findings, fixes, ...(evidence ? { evidence } : {}) };
    if (block && score < 60) blocking.push(k);
  };

  const target = i.durationTarget?.target ?? h.durationSec;
  const off = Math.abs(i.mp4Duration - target) / target;
  put("duration", off <= R.durationTolerance ? 100 : 0, off <= R.durationTolerance ? [] : [`尺 ${Math.round(i.mp4Duration)} 秒（目標 ${target} 秒の ±${R.durationTolerance * 100}% の外）`], off <= R.durationTolerance ? [] : ["healing.json の scenes の秒数を直して render し直す"], true);

  const { integratedLufs: lufs, truePeakDb: tp } = i.audio;
  const audioOk = lufs >= R.lufs.min && lufs <= R.lufs.max && tp <= R.truePeakMax;
  put("audio", audioOk ? 100 : lufs < -24 || lufs > -10 ? 0 : 50, audioOk ? [] : [`音量 ${lufs.toFixed(1)} LUFS・True Peak ${tp.toFixed(1)} dB（${R.lufs.min}〜${R.lufs.max} LUFS・${R.truePeakMax} dB 以下）`], audioOk ? [] : ["healing.mjs music の loudnorm を確かめて作り直す"], true);

  // 始まりの 3 秒・終わりの 8 秒（フェード）以外の暗転・無音
  const inner = (/** @type {number[][]} */ xs) => xs.filter(([s, e]) => s > 3 && e < i.mp4Duration - 8);
  const black = inner(i.gaps.black);
  const silence = inner(i.gaps.silence);
  const gapFindings = [...black.map(([s, e]) => `暗転 ${s.toFixed(1)}〜${e.toFixed(1)} 秒`), ...silence.map(([s, e]) => `無音 ${s.toFixed(1)}〜${e.toFixed(1)} 秒`)];
  put("continuity", gapFindings.length ? 0 : 100, gapFindings, gapFindings.length ? ["場面の溶かし・楽章のつなぎを確かめる"] : [], true);

  const scenes = h.scenes ?? [];
  const keys = scenes.map((/** @type {any} */ s) => s.footage);
  const need = Math.ceil(target / R.sceneEverySec);
  const longest = Math.max(...scenes.map((/** @type {any} */ s) => s.seconds));
  const distinct = new Set(keys).size;
  const adjacent = keys.filter((/** @type {string} */ k, /** @type {number} */ n) => n > 0 && keys[n - 1] === k).length;
  const vf = [];
  if (scenes.length < need) vf.push(`場面 ${scenes.length}（${need} 以上）`);
  if (longest > R.maxSceneSec) vf.push(`一番長い場面 ${longest} 秒（${R.maxSceneSec} 秒まで）`);
  if (distinct < scenes.length * 0.8) vf.push(`違う映像 ${distinct}／場面 ${scenes.length}（8割以上）`);
  if (adjacent) vf.push(`同じ映像が続く ${adjacent} か所`);
  put("variety", Math.max(0, 100 - vf.length * 30), vf, vf.length ? ["映像を足して場面を分ける（繰り返しの多い量産に見せない）"] : [], true, { scenes: scenes.length, distinct, longestSec: longest });

  const thumbs = (i.script?.thumbnails ?? []).filter((/** @type {any} */ t) => t.layout === "mystic");
  const used = [...new Set([...keys, ...thumbs.map((/** @type {any} */ t) => t.photo)])];
  const unlicensed = used.filter((k) => !i.ledger[k] || !["pexels", "self"].includes(i.ledger[k].provider));
  put("licensing", unlicensed.length ? 0 : 100, unlicensed.map((k) => `${k} の出どころが台帳にない・使ってよい素材でない`), unlicensed.length ? ["mt.mjs pexels pick で使ってよい映像に替える"] : [], true);

  const thumbText = thumbs.map((/** @type {any} */ t) => [t.ribbon, ...(t.lines ?? []), t.accent, t.question].filter(Boolean).join(" ")).join("\n");
  const claims = claimIssues(`${h.title}\n${h.description ?? ""}\n${thumbText}`);
  put("claims", claims.length ? 0 : 100, claims, claims.length ? ["効果の断定・煽りを外し、「〜のひとときに」のような上品な言い方にする"] : [], true);

  const thumbOk = thumbs.length > 0 && thumbs.some((/** @type {any} */ t) => i.thumbnails.includes(`thumbnail-${t.id}.png`));
  put("thumbnail", thumbOk ? 100 : 0, thumbOk ? [] : ["mystic 型のサムネイル（script.json の thumbnails[] の layout: mystic、output/thumbnail-<id>.png）がない"], thumbOk ? [] : ["mt.mjs thumbnails"], true);

  const vr = i.visualReview;
  const vs = vr && vr.mystic === true && typeof vr.score === "number" ? vr.score : 0;
  put("visualStrength", vs, vr ? (vr.mystic === true ? [] : ["目視で神秘的な世界観になっていない"]) : ["映像の目視（input/visual-review.json：healing.mjs frames のコマを見て mystic・score・notes）がない"], vs >= 70 ? [] : ["色・光・映像の選び直し"], true, { judgmentSource: vr ? "claude-review" : null, realFootageRatio: 1 });

  const scores = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, v.score]));
  const values = Object.values(scores);
  const overallQuality = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const gate = !blocking.length && overallQuality >= R.passScore ? "pass" : "fail";
  return { rulesVersion: R.version, gate, overallQuality, scores, blocking, metrics };
}
