// @ts-check
// content-ops の制作依頼（production request）を読む consumer。依頼は content-ops の campaign にあり、ここでは読むだけ。
// 説明：../PRODUCTION-HANDOFF.md（契約は ../../../content-ops/docs/production-handoff.md）
//
//   node scripts/production.mjs show --campaign=<id> [--key=main] [--json]          依頼の中身と、本制作に進めるか
//   node scripts/production.mjs import --campaign=<id> [--key=main] --project=<id>    ready で期限内なら動画フォルダに紐付け（<id>/input/production.json。依頼のコピーは作らない）
//   node scripts/production.mjs prepare-script --project=<id> [--force]             allowedFacts と creative だけから台本の下書き（input/script.json）と画像の登録（input/visuals.json）
//   node scripts/production.mjs validate --project=<id>                             事前確認 → 画像の種類 → content-ops の production validate-script（fail なら先に進めない）
//   node scripts/production.mjs gate --project=<id>                                 ナレーション・レンダリングの前の関所（sm.mjs が呼ぶ）
//   node scripts/production.mjs result --project=<id> --render-status=started|rendered|failed|published [--started-at=] [--completed-at=]
//                                                                                    content-ops へ返す結果（output/production-result.json）

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HandoffError, SUPPORTED_CONTRACT, checkContinuation, checkReadiness, contentOpsRoot, readRequest } from "./lib/production/contract.mjs";
import { projectDir } from "./lib/production/paths.mjs";
import { buildResult, writeResult } from "./lib/production/result.mjs";
import { buildDraftScript, precheckScript } from "./lib/production/script.mjs";
import { runContentOpsValidation } from "./lib/production/validate.mjs";
import { checkVisuals, draftVisuals } from "./lib/production/visuals.mjs";
import { appendAttempt, checkOnScreenTextRules, compareHumanReview, measureAudio, qualityProfileOf, scoreQuality } from "./lib/production/quality.mjs";
import { analyzeVideo } from "./lib/production/frames.mjs";
import { CLIP_QUALITY_RULES, scoreClipQuality } from "./lib/production/clipQuality.mjs";

/** x-clip-narration の台本の事前確認：テンプレート・素材の範囲（clip）・出典・文の開始秒（at）・字幕。 @param {any} script */
export function precheckClipScript(script) {
  /** @type {{ sentence: number, problem: string }[]} */
  const issues = [];
  if (script?.template !== "x-clip-narration") issues.push({ sentence: -1, problem: `template が ${script?.template}（x-clip-narration のはず）` });
  const c = script?.clip ?? {};
  if (!c.file || !(Number(c.end) > Number(c.start ?? 0))) issues.push({ sentence: -1, problem: "clip（file・start・end）がない" });
  if (!/^https?:\/\//.test(String(script?.source?.url ?? ""))) issues.push({ sentence: -1, problem: "source.url（素材の投稿 URL）がない" });
  if (!String(script?.credit ?? "").trim()) issues.push({ sentence: -1, problem: "credit（画面の出典表記）がない" });
  let prev = -1;
  (script?.sentences ?? []).forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (typeof s.at !== "number" || s.at < prev) issues.push({ sentence: i, problem: "at（文を始める秒）がない・順番になっていない" });
    prev = typeof s.at === "number" ? s.at : prev;
    if (!Array.isArray(s.cards) || !s.cards.length) issues.push({ sentence: i, problem: "cards がない" });
  });
  if (!(script?.sentences ?? []).length) issues.push({ sentence: -1, problem: "sentences がない" });
  return issues;
}

/** 依頼の素材の利用確認（content-ops の workflow の source-rights）。 @param {any} r */
const rightsOf = (r) => {
  const i = (r.workflow?.requiredInputs ?? []).find((/** @type {any} */ x) => x.id === "source-rights");
  return { confirmed: i?.status === "provided", note: i ? `${i.status}${i.by ? `・${i.by}` : ""}${i.note ? `・${i.note}` : ""}` : "依頼に利用確認の項目がない" };
};

/** @param {string[]} argv */
function parse(argv) {
  /** @type {Record<string, string>} */
  const o = {};
  const pos = [];
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      o[eq < 0 ? a.slice(2) : a.slice(2, eq)] = eq < 0 ? "true" : a.slice(eq + 1);
    } else pos.push(a);
  }
  return { cmd: pos[0], o };
}
/** @param {Record<string, string>} o @param {string} k */
const req = (o, k) => {
  if (!o[k] || o[k] === "true") throw new HandoffError(`--${k}=<値> が必要です`);
  return o[k];
};

const files = (/** @type {string} */ id) => {
  const dir = projectDir(id);
  return {
    dir,
    projectJson: path.join(dir, "project.json"),
    link: path.join(dir, "input", "production.json"),
    script: path.join(dir, "input", "script.json"),
    visuals: path.join(dir, "input", "visuals.json"),
    validation: path.join(dir, "input", "production-validation.json"),
    quality: path.join(dir, "input", "quality-check.json"),
    visualReview: path.join(dir, "input", "visual-review.json"),
    reviewFrames: path.join(dir, "intermediate", "review-frames"),
    timeline: path.join(dir, "audio", "timeline.json"),
    mp4: path.join(dir, "output", `${id}.mp4`),
  };
};
const readJson = (/** @type {string} */ f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (/** @type {string} */ f, /** @type {any} */ v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
};
const sha = (/** @type {string} */ f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

/** 動画フォルダの紐付けから、依頼を読み直す（毎回 content-ops の依頼を読む）。 @param {string} id */
function linked(id) {
  const f = files(id);
  if (!fs.existsSync(f.link)) throw new HandoffError(`${id} は制作依頼に紐付いていません（production.mjs import が先）`);
  const link = readJson(f.link);
  const { request } = readRequest(link.campaignId, link.key);
  if (request.requestId !== link.requestId) throw new HandoffError(`制作依頼が作り直されています（${link.requestId} → ${request.requestId}）。import をやり直す`);
  return { f, link, request };
}

/** @param {{ name: string, passed: boolean, reason: string }[]} checks */
const printChecks = (checks) => {
  for (const c of checks) console.log(`  ${c.passed ? "✓" : "✗"} ${c.name.padEnd(15)} ${c.reason}`);
};

/** @type {Record<string, (o: Record<string, string>) => number>} */
const COMMANDS = {
  show(o) {
    const { file, request: r } = readRequest(req(o, "campaign"), o.key ?? "main");
    if (o.json === "true") {
      console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    const rd = checkReadiness(r);
    console.log(`${path.relative(contentOpsRoot(), file)}（${r.contractVersion}・読み取り専用）`);
    console.log(`制作      : ${r.productionType} → ${r.targetProject}/templates/${r.targetTemplate}・${r.video.width}×${r.video.height}・${r.video.fps}fps・${r.video.durationTargetSec.min}〜${r.video.durationTargetSec.max}秒（目標 ${r.video.durationTargetSec.target}）`);
    console.log(`声        : ${r.video.voice.name}（speaker ${r.video.voice.speaker}・speedScale ${r.video.voice.speedScale}）・字幕 ${r.video.subtitleStyle}`);
    console.log(`事実      : allowedFacts ${r.scriptRules.allowedFacts.length}・出典の明示が要る ${r.scriptRules.attributionRequired.length}・禁止表現 ${r.scriptRules.prohibitedClaims.length}・分かっていない ${r.scriptRules.unknownFacts.length}`);
    for (const f of r.scriptRules.allowedFacts) console.log(`  [${f.id}] ${f.statement}${f.attribution ? `  ※「${f.attribution.phrases.join("」か「")}」` : ""}`);
    console.log(`構成      : ${r.creative.structure.map((/** @type {any} */ s) => `${s.startSec}-${s.endSec}秒 ${s.section}`).join(" / ")}`);
    console.log(`本制作    : ${rd.ready ? "進められる" : "まだ進められない"}`);
    printChecks(rd.checks);
    return 0;
  },
  import(o) {
    const campaignId = req(o, "campaign");
    const key = o.key ?? "main";
    const id = req(o, "project");
    const { file, request: r } = readRequest(campaignId, key);
    const rd = checkReadiness(r);
    printChecks(rd.checks);
    if (!rd.ready) throw new HandoffError("本制作に進めないので紐付けません（content-ops で production check --refresh を通して ready にする）");
    const f = files(id);
    if (!fs.existsSync(f.projectJson)) throw new HandoffError(`${id}/project.json がありません。先に node scripts/sm.mjs new --project=${id} --template=${r.targetTemplate}`);
    writeJson(f.link, { contractVersion: SUPPORTED_CONTRACT, campaignId, key, requestId: r.requestId, requestPath: path.relative(contentOpsRoot(), file).split(path.sep).join("/"), productionId: id, importedAt: new Date().toISOString() });
    console.log(`紐付けました：${path.relative(projectDir(""), f.link)}（依頼のコピーではなく、場所と requestId だけ）`);
    return 0;
  },
  "prepare-script"(o) {
    const id = req(o, "project");
    const { f, request: r } = linked(id);
    if (r.productionType !== "news-short" && r.productionType !== "story-short") throw new HandoffError(`prepare-script は news-short・story-short（news-short-top）だけです。${r.productionType} の台本は templates/${r.targetTemplate}/README.md の型で書く`);
    const rd = checkReadiness(r);
    printChecks(rd.checks);
    if (!rd.ready) throw new HandoffError("本制作に進めないので台本を作りません");
    if (fs.existsSync(f.script) && o.force !== "true" && !readJson(f.script).production?.draft) throw new HandoffError(`${id}/input/script.json は手で直した台本です（作り直すなら --force）`);
    const script = buildDraftScript(r, id);
    writeJson(f.script, script);
    writeJson(f.visuals, draftVisuals(script, r));
    console.log(`下書きを作りました：input/script.json（${script.sentences.length} 文）・input/visuals.json（画像 ${draftVisuals(script, r).images.length} 枚の種類）`);
    console.log("次：読みやすく直す（allowedFacts 以外を足さない）→ 画像を安全な種類で作る → node scripts/production.mjs validate --project=" + id);
    return 0;
  },
  validate(o) {
    const id = req(o, "project");
    const { f, link, request: r } = linked(id);
    if (!fs.existsSync(f.script)) throw new HandoffError(`${id}/input/script.json がありません`);
    const script = readJson(f.script);
    const clip = r.productionType === "x-clip";
    // x-clip：素材の X 動画が主役なので、画像の登録（visuals.json）はない。台本の形・出典を確かめ、content-ops で禁止表現・人名を調べる
    const pre = clip ? precheckClipScript(script) : precheckScript(script, r);
    const vis = clip ? [] : fs.existsSync(f.visuals) ? [...checkVisuals(script, readJson(f.visuals), r), ...checkOnScreenTextRules(readJson(f.visuals))] : [`${id}/input/visuals.json がない（画像の種類を登録する）`];
    for (const p of pre) console.log(`  ✗ 事前確認（文 ${p.sentence}）${p.problem}`);
    for (const v of vis) console.log(`  ✗ 画像 ${v}`);
    const co = pre.length || vis.length ? null : runContentOpsValidation({ campaignId: link.campaignId, key: link.key, scriptPath: f.script });
    if (co) process.stdout.write(co.output.split("\n").filter((l) => /台本の検証|✗|!/u.test(l)).map((l) => `  ${l.trim()}\n`).join(""));
    const status = pre.length || vis.length ? "fail" : co?.status ?? "error";
    const proceed = !pre.length && !vis.length && !!co?.proceed;
    writeJson(f.validation, { validatedAt: new Date().toISOString(), requestId: r.requestId, scriptSha256: sha(f.script), status, proceed, precheck: pre, visuals: vis, contentOps: co ? { status: co.status, problems: co.problems, safeWarnings: co.safeWarnings, blockingWarnings: co.blockingWarnings } : null });
    if (co?.safeWarnings.length) console.log(`  warning（安全上の問題なし・進められる）：${co.safeWarnings.join(" / ")}`);
    if (co?.blockingWarnings.length) console.log(`  warning（出典の明示など安全に関わる・進めない）：${co.blockingWarnings.join(" / ")}`);
    console.log(`検証：${status}・${proceed ? "ナレーション・字幕・レンダリングに進める" : "進めない（VOICEVOX・字幕・レンダリングをしない）"}`);
    return proceed ? 0 : 1;
  },
  gate(o) {
    const id = req(o, "project");
    const { f, request: r } = linked(id);
    const rd = checkContinuation(r, id);
    const checks = [...rd.checks];
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    checks.push({ name: "validation", passed: !!v?.proceed, reason: v ? `台本の検証 ${v.status}（${v.validatedAt}）${v.proceed ? "" : "・進めない"}` : "台本の検証がまだ（production.mjs validate）" });
    const same = !!v && fs.existsSync(f.script) && v.scriptSha256 === sha(f.script) && v.requestId === r.requestId;
    checks.push({ name: "scriptUnchanged", passed: same, reason: same ? "検証した台本のまま" : "検証の後に台本・依頼が変わった（validate をやり直す）" });
    printChecks(checks);
    const ok = checks.every((c) => c.passed);
    console.log(ok ? "関所：通過" : "関所：止める（VOICEVOX・字幕・レンダリングをしない）");
    return ok ? 0 : 1;
  },
  /** 公開前の品質チェック（完成MP4の後・公開の前）。fail なら公開に進めない。最大3回まで自動修正、超えたら人の確認。 */
  // 完成MP4のフレームを抜き出す（Claude の目視用の contact sheet と、映像の測定）。人の入力は要らない
  frames(o) {
    const id = req(o, "project");
    const f = files(id);
    if (!fs.existsSync(f.mp4)) throw new HandoffError(`${id}/output/${id}.mp4 がありません（encode の後）`);
    const fr = analyzeVideo(f.mp4, readJson(f.timeline).duration, f.reviewFrames);
    writeJson(path.join(f.reviewFrames, "frames.json"), { mp4Sha256: sha(f.mp4), ...fr });
    console.log(`抜き出し ${fr.times.length} 枚（${fr.times.join("・")} 秒）→ ${path.relative(process.cwd(), fr.contactSheet ?? f.reviewFrames)}`);
    console.log(`実写らしい画面 ${Math.round(fr.realFootageRatio * 100)}%・冒頭3秒の実写 ${Math.round(fr.openingPhotoLike * 100)}%・動く映像 ${fr.motionEvidence.movingFrames}/${fr.motionEvidence.measured}・似た平らな画面の連続 ${fr.repeatedVisualPatterns.length} か所`);
    console.log(`次：Claude が contact sheet を見て ${id}/input/visual-review.json を書く（mp4Sha256: ${sha(f.mp4)}）→ quality-check`);
    return 0;
  },
  "quality-check"(o) {
    const id = req(o, "project");
    const f = files(id);
    // x-clip-narration：clip-v1（素材の利用確認・出典・タイトル・元の音・字幕・尺・音量）
    if (fs.existsSync(f.script) && readJson(f.script).template === "x-clip-narration") {
      if (!fs.existsSync(f.timeline)) throw new HandoffError(`${id}/audio/timeline.json がありません（narration の後）`);
      if (!fs.existsSync(f.mp4)) throw new HandoffError(`${id}/output/${id}.mp4 がありません（encode の後）`);
      const { request: r } = linked(id);
      const rights = rightsOf(r);
      const audio = measureAudio(f.mp4);
      const q = scoreClipQuality({ script: readJson(f.script), timeline: readJson(f.timeline), audio, mp4Duration: null, rightsConfirmed: rights.confirmed, rightsNote: rights.note });
      for (const [k, v] of Object.entries(q.metrics)) {
        console.log(`  ${String(v.score).padStart(3)} ${k}`);
        for (const x of v.findings) console.log(`        - ${x}`);
      }
      console.log(`overallQuality ${q.overallQuality}・QUALITY_GATE = ${q.gate}${q.blocking.length ? `（${q.blocking.join("・")}）` : ""}`);
      const visualReview = fs.existsSync(f.visualReview) ? readJson(f.visualReview) : null;
      const rec = appendAttempt(o.out ?? f.quality, { rulesVersion: q.rulesVersion, gate: q.gate, overallQuality: q.overallQuality, scores: q.scores, blocking: q.blocking, metrics: q.metrics, reviewNotes: visualReview?.notes ?? [], visualEvidence: null, humanComparison: null, rules: CLIP_QUALITY_RULES });
      console.log(`試行 ${rec.latest.attempt}/${rec.maxAttempts}${rec.latest.escalation === "human-review" ? "・上限に達したので人の確認へ（公開しない）" : rec.latest.escalation === "auto-fix" ? "・修正して再レンダリング → quality-check をやり直す" : ""}`);
      return q.gate === "pass" ? 0 : 1;
    }
    for (const [p, what] of [[f.script, "input/script.json"], [f.timeline, "audio/timeline.json（ナレーションの後）"], [f.visuals, "input/visuals.json"]]) if (!fs.existsSync(p)) throw new HandoffError(`${id}/${what} がありません`);
    // 通常運用：フレームの自動抽出・測定 → Claude の目視の判断（input/visual-review.json、同じ MP4 のときだけ）→ 採点。人の --review は任意（ズレの学習用）
    const timeline = readJson(f.timeline);
    const frames = fs.existsSync(f.mp4) ? analyzeVideo(f.mp4, timeline.duration, f.reviewFrames) : null;
    let visualReview = fs.existsSync(f.visualReview) ? readJson(f.visualReview) : null;
    if (visualReview && fs.existsSync(f.mp4) && visualReview.mp4Sha256 !== sha(f.mp4)) {
      console.log("  ※ visual-review.json は別の MP4 を見た判断なので使いません（フレームの測定で採点します）");
      visualReview = null;
    }
    const review = o.review ? readJson(o.review) : null;
    // 評価設定：制作依頼の種類（story-short は語りのショートの基準）。依頼のない動画は script.json の qualityProfile
    const script = readJson(f.script);
    let request = null;
    try {
      request = fs.existsSync(path.join(path.dirname(f.script), "production.json")) ? linked(id).request : null;
    } catch {
      request = null;
    }
    const profile = qualityProfileOf(script, request);
    const q = scoreQuality({ script, timeline, visuals: readJson(f.visuals), audio: measureAudio(f.mp4), visualReview, frames, profile });
    console.log(`評価設定：${profile}（${q.rulesVersion}）`);
    const humanComparison = compareHumanReview(q, review, visualReview);
    // --reference：今のルールでの参考点（記録しない・試行に数えない）。採点のルールを変えた後に、過去の動画を再評価するとき
    if (o.reference === "true") {
      const out = { reference: true, rulesVersion: q.rulesVersion, checkedAt: new Date().toISOString(), gate: q.gate, overallQuality: q.overallQuality, weightedQuality: q.weightedQuality, overallCap: q.overallCap, scores: q.scores, blocking: q.blocking, findings: Object.fromEntries(Object.entries(q.metrics).map(([k, v]) => [k, v.findings])), visualEvidence: q.metrics.visualStrength.evidence, humanComparison };
      if (o.out) writeJson(o.out, out);
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    const rec = appendAttempt(f.quality, { rulesVersion: q.rulesVersion, gate: q.gate, overallQuality: q.overallQuality, scores: q.scores, blocking: q.blocking, metrics: q.metrics, reviewNotes: [...(visualReview?.notes ?? []), ...(review?.notes ?? [])], visualEvidence: q.metrics.visualStrength.evidence, humanComparison, rules: q.rules, weights: q.weights });
    for (const [k, v] of Object.entries(q.metrics)) {
      console.log(`  ${String(v.score).padStart(3)} ${k}`);
      for (const x of v.findings) console.log(`        - ${x}`);
    }
    console.log(`visualStrength の判断：${q.metrics.visualStrength.evidence?.judgmentSource}${humanComparison ? `・人の評価 ${humanComparison.humanVerdict ?? "-"} / 機械 ${humanComparison.machineVerdict}（一致 ${humanComparison.verdictAgrees}）` : ""}`);
    console.log(`overallQuality ${q.overallQuality}・QUALITY_GATE = ${q.gate}${q.blocking.length ? `（${q.blocking.join("・")}）` : ""}`);
    console.log(`試行 ${rec.latest.attempt}/${rec.maxAttempts}${rec.latest.escalation === "human-review" ? "・上限に達したので人の確認へ（公開しない）" : rec.latest.escalation === "auto-fix" ? "・修正して再レンダリング → quality-check をやり直す" : ""}`);
    return q.gate === "pass" ? 0 : 1;
  },
  result(o) {
    const id = req(o, "project");
    const { f } = linked(id);
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    const r = buildResult(id, { renderStatus: req(o, "render-status"), startedAt: o["started-at"] ?? new Date().toISOString(), completedAt: o["completed-at"] ?? null, validationStatus: v?.status ?? null });
    if (fs.existsSync(f.quality)) {
      const q = readJson(f.quality).latest;
      Object.assign(r, { qualityGate: q.gate, overallQuality: q.overallQuality, qualityAttempt: q.attempt, qualityEscalation: q.escalation });
    }
    const out = writeResult(id, r);
    console.log(JSON.stringify(r, null, 2));
    console.log(`書きました：${out}（content-ops 側で npm run co -- production record-result --campaign=… --key=… --result=<このファイル>）`);
    return 0;
  },
};

export async function main(/** @type {string[]} */ argv) {
  const { cmd, o } = parse(argv);
  const fn = cmd ? COMMANDS[cmd] : undefined;
  if (!fn) {
    console.log("使い方: node scripts/production.mjs show|import|prepare-script|validate|gate|result …（ファイル先頭のコメント）");
    return cmd ? 1 : 0;
  }
  try {
    return fn(o);
  } catch (err) {
    console.error(err instanceof HandoffError ? `止めました：${err.message}` : err instanceof Error ? (err.stack ?? err.message) : String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
