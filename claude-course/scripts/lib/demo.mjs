// @ts-check
// AIツールの実演動画（横の通常動画 8〜12分、2026-11-22、セット03 なぎちょAI）。claude-course の外部プロジェクトで作る。
//   ・録画（共通remotionの `npm run video:capture -- --type=claude-course`）の操作を、claude-course の画面収録の場面（layout
//     "recording" の beats：録画の再生・ズーム・ハイライト・早送り）に変える（input/demo-beats.json → input/presentation.json の beats）
//   ・公開前の品質ゲート demo-long-v1（採点は共通remotionの core/capture/demoQuality.mjs。縦の Shorts と同じ。目安だけ横の通常動画用）
// 説明：../../DEMO.md

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { REMOTION_ROOT } from "./engine.mjs";

const load = (/** @type {string} */ rel) => import(pathToFileURL(path.join(REMOTION_ROOT, rel)).href);

/** 横の通常動画の目安（8〜12分。参考チャンネルの分析：上位の語り 6.5〜7.5 字/秒、通常動画も画面を変え続ける）。 */
export const DEMO_LONG_RULES = {
  version: "demo-long-v1",
  duration: { ideal: /** @type {[number, number]} */ ([480, 720]), max: 900 },
  narration: { charsPerSec: /** @type {[number, number]} */ ([5.5, 7.5]) },
  caption: { maxChars: 44, minSec: 1.0 },
  visual: { changeAvgMax: 12, staticMax: 25, screenShareMin: 0.6, firstScreenSec: 10 },
  hook: { firstSentenceMaxSec: 8 },
  audio: { lufs: /** @type {[number, number]} */ ([-18, -14]), truePeakMax: -1 },
  gate: { overall: 70, critical: 50, floor: 40 },
  maxAttempts: 3,
};

export const DEMO_LINE_KINDS = ["hook", "demo", "fact", "transition", "closing"];
const ZOOM_DELAY = 0.2;
const ZOOM_SECONDS = 1.5; // claude-course の recording のズーム（45 フレーム）
const MAX_RATE = 8;

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

/** "11/22 収録"（日本時間）。 @param {string} iso */
const recorded = (iso) => {
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} 収録`;
};

/** 録画の beat か（capture と steps がある）。 @param {any} b */
const isDemoBeat = (b) => typeof b?.capture === "string" && Array.isArray(b?.steps);

/**
 * input/demo-beats.json（{ "<sceneId>": [beat…] }）を、claude-course の presentation.json の beats に変える。
 * 録画の beat：{ at?: "<lineId>", offset?: 秒, capture, steps: [stepId…], zoom?: "auto"|"wide"|"full", highlight?: false, label?, side? }
 *   → 画面の場面（media・play〈その操作の時間だけ。長ければ早送り、短ければ最後の画面で止める〉・views〈全体 → 操作した場所〉・marks〈黄色の枠〉・label「実際の操作画面・M/D 収録」・badge「早送り ×N」）
 * ほかの beat（kind "text" など）はそのまま。narration.json（各文の時刻）が要る。
 * @param {{ demoBeats: any, narration: any, captures: Record<string, any> }} i
 * @returns {Promise<{ beats: Record<string, any[]>, shots: any[] }>}
 */
export async function buildBeats(i) {
  const r = await load("src/core/capture/resolve.mjs");
  const lineStart = new Map((i.narration.lines ?? []).map((/** @type {any} */ l) => [l.id, l.start]));
  const sceneOf = new Map((i.narration.scenes ?? []).map((/** @type {any} */ s) => [s.id, s]));
  /** @type {Record<string, any[]>} */
  const beats = {};
  /** @type {any[]} */
  const shots = [];
  for (const [sceneId, list] of Object.entries(i.demoBeats ?? {})) {
    const scene = sceneOf.get(sceneId);
    if (!scene) throw new Error(`demo-beats.json の場面 ${sceneId} が narration.json にない`);
    const startOf = (/** @type {any} */ b) => (b.at !== undefined ? (lineStart.get(b.at) ?? NaN) : scene.start) + Number(b.offset ?? 0);
    const starts = list.map(startOf);
    starts.forEach((t, k) => {
      if (!Number.isFinite(t)) throw new Error(`${sceneId} の beat ${k + 1}：at「${list[k].at}」の文がない`);
    });
    let prev = /** @type {{ capture: string, view: any } | null} */ (null);
    beats[sceneId] = list.map((/** @type {any} */ b, /** @type {number} */ k) => {
      if (!isDemoBeat(b)) return b;
      const log = i.captures[b.capture];
      if (!log) throw new Error(`録画 ${b.capture} の記録（assets/captures/${b.capture}/log.json）がない`);
      const start = starts[k];
      const end = k + 1 < list.length ? starts[k + 1] : scene.end;
      const seg = r.segmentOf(log, b.steps);
      const D = Math.max(0.1, end - start);
      let { from, to } = seg;
      let rate = 1;
      if (to - from > D) {
        rate = (to - from) / D;
        if (rate > MAX_RATE) (rate = MAX_RATE), (from = to - D * MAX_RATE);
      }
      rate = Math.round(rate * 100) / 100;
      const full = r.fullView(log);
      const target = [...b.steps].reverse().map((/** @type {string} */ s) => r.stepOf(log, s)).find((/** @type {any} */ s) => s.rect);
      const same = prev && prev.capture === b.capture;
      const zoom = b.zoom ?? "auto";
      const endView = zoom === "full" ? full : target ? r.fitView(target.rect, full, { aspect: full.w / full.h, factor: zoom === "wide" ? 3.2 : 2.2 }) : same ? prev?.view : full;
      const startView = same ? prev?.view : full;
      prev = { capture: b.capture, view: endView };
      const when = (/** @type {number} */ extra) => ({ ...(b.at !== undefined ? { at: b.at } : {}), offset: Math.round((Number(b.offset ?? 0) + extra) * 100) / 100 });
      const mark = b.highlight !== false && target ? r.markOf(log, target.id) : null;
      const dummy = log.tool?.kind === "dummy";
      shots.push({ start, end, capture: b.capture, steps: b.steps, rate, speedLabelled: true, viewChanges: [start + ZOOM_DELAY + ZOOM_SECONDS / 2, ...(mark ? [start + ZOOM_DELAY + ZOOM_SECONDS] : [])] });
      return {
        ...(b.at !== undefined ? { at: b.at } : {}),
        ...(b.offset !== undefined ? { offset: b.offset } : {}),
        kind: "screen",
        media: { src: `captures/${b.capture}/${log.video?.file ?? "video.mp4"}`, width: full.w, height: full.h },
        play: { from, to, rate },
        views: [{ view: startView }, { ...when(ZOOM_DELAY), view: endView }],
        ...(mark ? { marks: [{ ...when(ZOOM_DELAY + ZOOM_SECONDS), rect: mark }] } : {}),
        label: `実際の操作画面・${recorded(log.executedAt)}${dummy ? "・テスト用ダミー画面" : ""}${b.label ? `｜${b.label}` : ""}`,
        ...(Math.abs(rate - 1) > 0.05 ? { badge: `${rate > 1 ? "早送り" : "スロー"} ×${rate.toFixed(1)}` } : {}),
        ...(b.side ? { side: b.side } : {}),
      };
    });
  }
  return { beats, shots };
}

/**
 * 台本（lesson.json）の事前確認（実演動画）。問題の一覧（空なら OK）。
 * @param {any} lesson @param {any} demoBeats @param {any} r 制作依頼（なければ null） @param {Record<string, any>} captures
 */
export function precheckDemoLesson(lesson, demoBeats, r, captures) {
  /** @type {{ line: string, problem: string }[]} */
  const issues = [];
  const facts = new Set((r?.scriptRules?.allowedFacts ?? []).map((/** @type {any} */ f) => f.id));
  const ok = (/** @type {string} */ c, /** @type {string} */ s) => !!captures[c]?.steps?.find((/** @type {any} */ x) => x.id === s && x.ok);
  for (const [id, log] of Object.entries(captures)) {
    if (log.status !== "complete") issues.push({ line: "-", problem: `録画 ${id} は途中で止まった（${log.stop?.message ?? "?"}）。使わない` });
    if (log.tool?.kind === "dummy" && r) issues.push({ line: "-", problem: `録画 ${id} はテスト用のダミー画面。本番の動画に使わない` });
  }
  for (const ch of lesson.chapters ?? [])
    for (const sc of ch.scenes ?? [])
      for (const l of sc.lines ?? []) {
        if (!DEMO_LINE_KINDS.includes(l.kind)) issues.push({ line: l.id, problem: `kind は ${DEMO_LINE_KINDS.join("・")}（${l.kind}）` });
        if (l.kind === "fact" && !(l.factIds ?? []).length) issues.push({ line: l.id, problem: "kind=fact なのに factIds が空" });
        for (const f of l.factIds ?? []) if (r && !facts.has(f)) issues.push({ line: l.id, problem: `allowedFacts にない factId「${f}」` });
        if (l.kind === "demo") {
          if (!(l.captureSteps ?? []).length) issues.push({ line: l.id, problem: "操作の説明（kind=demo）なのに captureSteps がない" });
          for (const x of l.captureSteps ?? []) if (!ok(x.capture, x.step)) issues.push({ line: l.id, problem: `録画 ${x.capture} に成功した操作「${x.step}」がない（実行していない操作を説明しない）` });
        }
      }
  let screens = 0;
  for (const [sc, list] of Object.entries(demoBeats ?? {}))
    for (const b of /** @type {any[]} */ (list))
      if (isDemoBeat(b)) {
        screens++;
        for (const s of b.steps) if (!ok(b.capture, s)) issues.push({ line: sc, problem: `demo-beats：録画 ${b.capture} に成功した操作「${s}」がない` });
      }
  if (!screens) issues.push({ line: "-", problem: "demo-beats.json に録画の画面が1つもない" });
  return issues;
}

/**
 * 公開前の品質ゲート（demo-long-v1）。
 * @param {{ lesson: any, narration: any, demoBeats: any, captures: Record<string, any>, audio: any }} i
 */
export async function scoreDemoLong(i) {
  const { scoreDemo } = await load("src/core/capture/demoQuality.mjs");
  const { shots } = await buildBeats({ demoBeats: i.demoBeats, narration: i.narration, captures: i.captures });
  const meta = new Map();
  for (const ch of i.lesson.chapters ?? []) for (const sc of ch.scenes ?? []) for (const l of sc.lines ?? []) meta.set(l.id, l);
  const sentences = (i.narration.lines ?? []).map((/** @type {any} */ l) => ({ text: l.text, start: l.start, end: l.end, kind: meta.get(l.id)?.kind, captureSteps: meta.get(l.id)?.captureSteps }));
  const captions = (i.narration.lines ?? []).map((/** @type {any} */ l) => ({ text: String(l.caption ?? l.text).replace(/[、|]/g, ""), start: l.start, end: l.end }));
  const otherChanges = (i.narration.scenes ?? []).map((/** @type {any} */ s) => s.start);
  const used = Object.fromEntries([...new Set(shots.map((s) => s.capture))].map((id) => [id, i.captures[id]]));
  return scoreDemo({ rules: DEMO_LONG_RULES, durationSec: i.narration.durationSeconds, sentences, captions, shots, otherChanges, captures: used, audio: i.audio });
}

/** content-ops に返す録画の要約（操作した記録）。 @param {Record<string, any>} captures */
export async function captureSummaries(captures) {
  const { captureSummary } = await load("src/core/capture/resolve.mjs");
  return Object.values(captures).map((l) => captureSummary(l));
}
