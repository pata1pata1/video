// @ts-check
// AIツールの実演ショート（tool-demo-short、2026-11-22）の台本の事前確認と、公開前の品質ゲート（demo-short-v1）。
// 採点そのものは共通remotionの core/capture/demoQuality.mjs（横の通常動画 claude-course と同じ）。ここは縦の Shorts の目安と、
// 台本・timeline・録画の記録から採点の入力を作る部分だけ。画面の区間はテンプレートと同じ templates/tool-demo-short/shots.mjs で出す。

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SHORT_MOVIE_ROOT } from "./paths.mjs";

const REMOTION_ROOT = path.resolve(process.env.REMOTION_ROOT ?? path.join(SHORT_MOVIE_ROOT, "..", "..", "remotion"));
const load = (/** @type {string} */ rel) => import(pathToFileURL(path.join(REMOTION_ROOT, rel)).href);
const loadShots = () => import(pathToFileURL(path.join(SHORT_MOVIE_ROOT, "templates", "tool-demo-short", "shots.mjs")).href);

/** 縦の Shorts の目安（45〜60秒。参考チャンネルの分析：上位の語り 6.5〜7.5 字/秒・Shorts は数秒ごとに画が変わる）。 */
export const DEMO_SHORT_RULES = {
  version: "demo-short-v1",
  duration: { ideal: /** @type {[number, number]} */ ([45, 60]), max: 65 },
  narration: { charsPerSec: /** @type {[number, number]} */ ([6.0, 7.8]) },
  caption: { maxChars: 16, minSec: 0.8 },
  visual: { changeAvgMax: 4, staticMax: 7, screenShareMin: 0.6, firstScreenSec: 3 },
  hook: { firstSentenceMaxSec: 6 },
  audio: { lufs: /** @type {[number, number]} */ ([-16, -12]), truePeakMax: -1 },
  gate: { overall: 70, critical: 50, floor: 40 },
  maxAttempts: 3,
};

export const DEMO_KINDS = ["hook", "demo", "fact", "transition", "closing"];

/** assets/captures/<id>/log.json をすべて読む。 @param {string} dir 動画のフォルダ */
export function loadCaptures(dir) {
  const root = path.join(dir, "assets", "captures");
  /** @type {Record<string, any>} */
  const out = {};
  if (!fs.existsSync(root)) return out;
  for (const id of fs.readdirSync(root).sort()) {
    const f = path.join(root, id, "log.json");
    if (fs.existsSync(f)) out[id] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return out;
}

/** 文の文字（字幕・読み上げ）。 @param {any} s */
const textOf = (s) => (s.cards ?? []).map((/** @type {any} */ c) => c.text).join("");

/**
 * 台本の事前確認（tool-demo-short）。問題の一覧（空なら OK）。
 * @param {any} script @param {any} r 制作依頼 @param {Record<string, any>} captures
 */
export function precheckDemoScript(script, r, captures) {
  /** @type {{ sentence: number, problem: string }[]} */
  const issues = [];
  if (script?.template !== "tool-demo-short") issues.push({ sentence: -1, problem: `template が ${script?.template}（tool-demo-short のはず）` });
  if (!String(script?.title ?? "").trim()) issues.push({ sentence: -1, problem: "title（上に出す題名）がない" });
  const facts = new Set((r?.scriptRules?.allowedFacts ?? []).map((/** @type {any} */ f) => f.id));
  const step = (/** @type {string} */ cap, /** @type {string} */ id) => captures[cap]?.steps?.find((/** @type {any} */ x) => x.id === id);
  for (const [id, log] of Object.entries(captures)) {
    if (log.status !== "complete") issues.push({ sentence: -1, problem: `録画 ${id} は途中で止まった（${log.stop?.message ?? "?"}）。使わない` });
    if (log.tool?.kind === "dummy") issues.push({ sentence: -1, problem: `録画 ${id} はテスト用のダミー画面。本番の動画に使わない` });
  }
  let hasShot = false;
  (script?.sentences ?? []).forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (!DEMO_KINDS.includes(s.kind)) issues.push({ sentence: i, problem: `kind は ${DEMO_KINDS.join("・")}（${s.kind}）` });
    if (s.kind === "fact" && !(s.factIds ?? []).length) issues.push({ sentence: i, problem: "kind=fact なのに factIds が空" });
    for (const id of s.factIds ?? []) if (r && !facts.has(id)) issues.push({ sentence: i, problem: `allowedFacts にない factId「${id}」` });
    if (s.kind === "demo") {
      const refs = s.captureSteps ?? [];
      if (!refs.length) issues.push({ sentence: i, problem: "操作の説明（kind=demo）なのに captureSteps がない" });
      for (const ref of refs) {
        const st = step(ref.capture, ref.step);
        if (!st || !st.ok) issues.push({ sentence: i, problem: `録画 ${ref.capture} に成功した操作「${ref.step}」がない（実行していない操作を説明しない）` });
      }
    }
    for (const c of s.cards ?? []) {
      if ((c.caption ?? c.text).replace(/[\s、。|]/gu, "").length > 16) issues.push({ sentence: i, problem: `字幕が長い（「${c.caption ?? c.text}」。1枚16字まで）` });
      if (c.shot) {
        hasShot = true;
        if (!captures[c.shot.capture]) issues.push({ sentence: i, problem: `録画 ${c.shot.capture} がない（npm run video:capture）` });
        for (const id of c.shot.steps ?? []) {
          const st = step(c.shot.capture, id);
          if (!st || !st.ok) issues.push({ sentence: i, problem: `shot：録画 ${c.shot.capture} に成功した操作「${id}」がない` });
        }
        if (!(c.shot.steps ?? []).length) issues.push({ sentence: i, problem: "shot.steps がない" });
      }
    }
    if (!textOf(s)) issues.push({ sentence: i, problem: "cards がない" });
  });
  if (!hasShot) issues.push({ sentence: -1, problem: "操作画面（shot）が1つもない" });
  if (!(script?.sentences ?? []).length) issues.push({ sentence: -1, problem: "sentences がない" });
  return issues;
}

/**
 * 公開前の品質ゲート（demo-short-v1）。
 * @param {{ script: any, timeline: any, captures: Record<string, any>, audio: any }} i
 */
export async function scoreDemoShort(i) {
  const { scoreDemo } = await load("src/core/capture/demoQuality.mjs");
  const { segmentsOf, ZOOM_SECONDS } = await loadShots();
  const segs = segmentsOf(i.timeline, i.captures);
  const shots = segs
    .filter((/** @type {any} */ s) => s.src)
    .map((/** @type {any} */ s) => ({
      start: s.start,
      end: s.end,
      capture: s.capture,
      steps: s.steps,
      rate: s.rate,
      speedLabelled: true, // テンプレートが ×N を必ず表示する（DemoShort.tsx）
      viewChanges: [s.views[1].at + ZOOM_SECONDS / 2, ...(s.highlight ? [s.highlight.at] : [])],
    }));
  const otherChanges = segs.filter((/** @type {any} */ s) => !s.src).map((/** @type {any} */ s) => s.start);
  /** @type {{ text: string, start: number, end: number, kind?: string, captureSteps?: any[] }[]} */
  const sentences = (i.script.sentences ?? []).map((/** @type {any} */ s, /** @type {number} */ k) => {
    const cs = i.timeline.cards.filter((/** @type {any} */ c) => c.sentence === k);
    return { text: textOf(s), start: cs[0]?.start ?? 0, end: cs[cs.length - 1]?.end ?? 0, kind: s.kind, captureSteps: s.captureSteps };
  });
  const captions = i.timeline.cards.map((/** @type {any} */ c) => ({ text: c.text, start: c.start, end: c.end }));
  const used = Object.fromEntries([...new Set(shots.map((/** @type {any} */ s) => s.capture))].map((id) => [id, i.captures[id]]));
  return scoreDemo({ rules: DEMO_SHORT_RULES, durationSec: i.timeline.duration, sentences, captions, shots, otherChanges, captures: used, audio: i.audio });
}

/** content-ops に返す録画の要約（操作した記録）。 @param {Record<string, any>} captures */
export async function captureSummaries(captures) {
  const { captureSummary } = await load("src/core/capture/resolve.mjs");
  return Object.values(captures).map((l) => captureSummary(l));
}
