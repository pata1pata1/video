// @ts-check
// content-ops の制作依頼（production request、contract content-ops.production-request/1）を読む。
// 依頼は content-ops の campaign の中にあり、video 側は読むだけ（コピー・書き換えをしない）。
// 契約の説明：../content-ops/docs/production-handoff.md
//
// 場所：CONTENT_OPS_ROOT（既定 ../../content-ops＝Projects/content-ops）/campaigns/<campaign>/production/video-<key>.json
//       CONTENT_OPS_CAMPAIGNS_DIR があればそちら（content-ops と同じ規則。テストで使う）

import fs from "node:fs";
import path from "node:path";
import { SHORT_MOVIE_ROOT } from "./paths.mjs";

export const SUPPORTED_CONTRACT = "content-ops.production-request/1";
/** この short-movie が受けられる制作の種類とテンプレート（x-clip は 2026-11-20 から）。 */
export const SUPPORTED = {
  "news-short": { targetProject: "short-movie", targetTemplate: "news-short-top" },
  "x-clip": { targetProject: "short-movie", targetTemplate: "x-clip-narration" },
  // 語りのショート（2026-11-22、セット02 つぐみの開運チャンネル）：news-short-top を落ち着いた声・藤色・BGM で（STYLE.md「語りのショート」）
  "story-short": { targetProject: "short-movie", targetTemplate: "news-short-top" },
};

/** 依頼が題材の事実確認のある種類か（workflow がない古い依頼は news-short＝あり）。 @param {any} r */
export const isFactual = (r) => r?.workflow?.factual !== false;

/** 素材・確認・承認（content-ops の workflow）のうち、制作の前にそろっていないもの。 @param {any} r */
export function pendingInputs(r) {
  const w = r?.workflow;
  if (!w) return [];
  return [...(w.requiredInputs ?? []).filter((/** @type {any} */ i) => i.status !== "provided"), ...(w.approvals ?? []).filter((/** @type {any} */ a) => a.stage === "before-production" && a.status !== "approved")];
}
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class HandoffError extends Error {}

export function contentOpsRoot() {
  return path.resolve(process.env.CONTENT_OPS_ROOT ?? path.join(SHORT_MOVIE_ROOT, "..", "..", "content-ops"));
}

export function campaignsDir() {
  return path.resolve(process.env.CONTENT_OPS_CAMPAIGNS_DIR ?? path.join(contentOpsRoot(), "campaigns"));
}

/** @param {string} campaignId @param {string} key */
export function requestPath(campaignId, key) {
  if (!KEBAB.test(campaignId) || !KEBAB.test(key)) throw new HandoffError(`campaign・key は kebab-case です（${campaignId} / ${key}）`);
  return path.join(campaignsDir(), campaignId, "production", `video-${key}.json`);
}

/**
 * 依頼を読み、この short-movie で扱える内容かを確かめる（status・期限は checkReadiness）。
 * @param {string} campaignId @param {string} key
 */
export function readRequest(campaignId, key) {
  const file = requestPath(campaignId, key);
  if (!fs.existsSync(file)) throw new HandoffError(`制作依頼がありません：${file}（content-ops の production prepare が先）`);
  /** @type {any} */
  let r;
  try {
    r = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new HandoffError(`制作依頼を読めません：${file}（${err instanceof Error ? err.message : err}）`);
  }
  const issues = contractIssues(r, campaignId, key);
  if (issues.length) throw new HandoffError(`制作依頼が契約（${SUPPORTED_CONTRACT}）に合いません：\n  - ${issues.join("\n  - ")}`);
  return { file, request: r };
}

/** 契約として必要なフィールドと、この short-movie で扱える内容か。 @param {any} r @param {string} campaignId @param {string} key */
export function contractIssues(r, campaignId, key) {
  const issues = [];
  if (!r || typeof r !== "object") return ["JSON のオブジェクトではありません"];
  if (r.contractVersion !== SUPPORTED_CONTRACT) issues.push(`contractVersion が ${JSON.stringify(r.contractVersion)}（この consumer は ${SUPPORTED_CONTRACT} だけ）`);
  if (r.campaignId !== campaignId || r.key !== key) issues.push(`campaignId・key が場所と違う（${r.campaignId}/${r.key}）`);
  if (r.channel !== "video") issues.push("channel が video ではない");
  const t = SUPPORTED[r.productionType];
  if (!t) issues.push(`productionType ${JSON.stringify(r.productionType)} はこの short-movie で扱えない（${Object.keys(SUPPORTED).join(" | ")}）`);
  else {
    if (r.targetProject !== t.targetProject) issues.push(`targetProject が ${r.targetProject}（${t.targetProject} のはず）`);
    if (r.targetTemplate !== t.targetTemplate) issues.push(`targetTemplate が ${r.targetTemplate}（${t.targetTemplate} のはず）`);
  }
  const v = r.video ?? {};
  if (v.width !== 1080 || v.height !== 1920) issues.push(`video の大きさが ${v.width}×${v.height}（縦型 1080×1920 のはず）`);
  if (v.fps !== 30) issues.push(`fps が ${v.fps}（30 のはず）`);
  if (!v.durationTargetSec || !(v.durationTargetSec.min > 0 && v.durationTargetSec.max >= v.durationTargetSec.min)) issues.push("video.durationTargetSec（min・max・target）がない");
  if (v.voice?.engine !== "voicevox" || typeof v.voice?.speaker !== "number") issues.push("video.voice（voicevox・speaker）がない");
  const s = r.scriptRules ?? {};
  for (const k of ["allowedFacts", "prohibitedClaims", "attributionRequired", "unknownFacts", "safetyRules", "allowedNumbers"]) if (!Array.isArray(s[k])) issues.push(`scriptRules.${k} がない`);
  if (isFactual(r) && Array.isArray(s.allowedFacts) && !s.allowedFacts.length) issues.push("scriptRules.allowedFacts が空");
  for (const f of s.allowedFacts ?? []) if (!f.id || !f.statement || !Array.isArray(f.sources)) issues.push(`allowedFacts の形が違う（${JSON.stringify(f).slice(0, 80)}）`);
  const c = r.creative ?? {};
  if (typeof c.hook !== "string" || !Array.isArray(c.structure) || (isFactual(r) && !c.structure.length)) issues.push("creative（hook・structure）がない");
  if (r.handoff?.readOnlySource !== true) issues.push("handoff.readOnlySource が true ではない");
  if (!r.factCheck || typeof r.factCheck.requiresRefreshBeforeProduction !== "boolean") issues.push("factCheck がない");
  return issues;
}

/**
 * 本制作に進めるか：status が ready で、readyExpiresAt を過ぎていないこと（事件ニュースは制作直前の事実確認が必須）。
 * @param {any} r @param {Date} [now]
 */
export function checkReadiness(r, now = new Date()) {
  /** @type {{ name: string, passed: boolean, reason: string }[]} */
  const checks = [];
  checks.push({ name: "status", passed: r.status === "ready", reason: `status ${r.status}（ready のときだけ制作を始める。prepared は content-ops の production check --refresh が先）` });
  // 題材の事実確認がない種類（x-clip）は期限なし（素材の利用確認は inputs）
  if (r.factCheck?.requiresRefreshBeforeProduction !== false) {
    const exp = r.factCheck?.readyExpiresAt;
    const expOk = typeof exp === "string" && now.getTime() <= Date.parse(exp);
    checks.push({ name: "readyExpiresAt", passed: r.status === "ready" ? expOk : false, reason: exp ? `ready の期限 ${exp}${expOk ? "（有効）" : "（期限切れ。content-ops で production check をやり直す）"}` : "期限がない（制作直前の事実確認がまだ）" });
  }
  if (r.factCheck?.requiresRefreshBeforeProduction) {
    checks.push({ name: "refresh", passed: !!r.factCheck.lastRefresh, reason: r.factCheck.lastRefresh ? `制作直前の事実確認 ${r.factCheck.lastRefresh.checkedAt}` : "制作直前の事実確認がまだ" });
  }
  if (r.workflow) {
    const p = pendingInputs(r);
    checks.push({ name: "inputs", passed: p.length === 0, reason: p.length ? `素材・確認・承認を待っている：${p.map((/** @type {any} */ x) => x.id).join("・")}` : "素材・確認・承認はそろっている" });
  }
  return { ready: checks.every((c) => c.passed), checks };
}

/**
 * 制作を続けてよいか（ナレーション・レンダリング・書き出しの前の関所）。始めるとき（import・prepare-script）は checkReadiness（ready が必要）。
 * 始めた後は content-ops が制作開始を記録して in-production になるので、in-production でも、その制作（handoff.productionId）が
 * この動画のときだけ続けてよい。ready の期限（readyExpiresAt）は、続けるときも守る（ready にしてから制作完了まで）。
 * @param {any} r @param {string} projectId @param {Date} [now]
 */
export function checkContinuation(r, projectId, now = new Date()) {
  /** @type {{ name: string, passed: boolean, reason: string }[]} */
  const checks = [];
  const mine = r.status === "in-production" && r.handoff?.productionId === projectId;
  checks.push({ name: "status", passed: r.status === "ready" || mine, reason: r.status === "in-production" ? `status in-production（制作 ${r.handoff?.productionId ?? "?"}${mine ? "＝この動画" : "。この動画ではない"}）` : `status ${r.status}（ready、またはこの動画の in-production のときだけ続ける）` });
  if (r.factCheck?.requiresRefreshBeforeProduction !== false) {
    const exp = r.factCheck?.readyExpiresAt;
    const expOk = typeof exp === "string" && now.getTime() <= Date.parse(exp);
    checks.push({ name: "readyExpiresAt", passed: expOk, reason: exp ? `ready の期限 ${exp}${expOk ? "（有効）" : "（期限切れ。content-ops で production check をやり直す）"}` : "期限がない（制作直前の事実確認がまだ）" });
  }
  if (r.factCheck?.requiresRefreshBeforeProduction) checks.push({ name: "refresh", passed: !!r.factCheck.lastRefresh, reason: r.factCheck.lastRefresh ? `制作直前の事実確認 ${r.factCheck.lastRefresh.checkedAt}` : "制作直前の事実確認がまだ" });
  if (r.workflow) {
    const p = pendingInputs(r);
    checks.push({ name: "inputs", passed: p.length === 0, reason: p.length ? `素材・確認・承認を待っている：${p.map((/** @type {any} */ x) => x.id).join("・")}` : "素材・確認・承認はそろっている" });
  }
  return { ready: checks.every((c) => c.passed), checks };
}
