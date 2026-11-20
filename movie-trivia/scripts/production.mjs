// @ts-check
// content-ops の制作依頼（production request、news-long）を読んで、movie-trivia の既存の制作コマンド（scripts/mt.mjs）で通常動画を作るための consumer（2026-11-20）。
// 依頼は content-ops の campaign にあり、ここでは読むだけ（コピー・書き換えをしない）。共通部分（依頼の読み取り・本制作に進めるか・content-ops の台本の検証・
// 品質の記録の形）は共通remotionの src/core/production-request（scripts/lib/engine.mjs 経由）。movie-trivia 固有は台本の形と品質ゲート（long-v1）。
// 説明：PRODUCTION-HANDOFF.md（契約は ../../content-ops/docs/production-handoff.md）
//
//   node scripts/production.mjs show --campaign=<id> [--key=main] [--json]          依頼の中身と、本制作に進めるか
//   node scripts/production.mjs import --campaign=<id> [--key=main] --project=<id>    ready なら動画フォルダに紐付け（<id>/input/production.json。依頼のコピーは作らない）
//   node scripts/production.mjs validate --project=<id>                             台本の事前確認（文ごとの kind・factIds・pattern）→ content-ops の production validate-script
//   node scripts/production.mjs gate --project=<id>                                 ナレーション・書き出しの前の関所（mt.mjs が自動で呼ぶ）
//   node scripts/production.mjs quality-check --project=<id> [--out=<file>]         公開前の品質ゲート（long-v1）。input/quality-check.json に試行を足す
//   node scripts/production.mjs result --project=<id> --render-status=started|rendered|failed|published [--started-at=] [--completed-at=]
//                                                                                    content-ops へ返す結果（output/production-result.json）

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { media, productionRequest as pr } from "./lib/engine.mjs";
import { LONG_QUALITY_RULES, scoreLongQuality } from "./lib/production/quality.mjs";

const MOVIE_TRIVIA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** 動画フォルダの置き場所（テストでは MOVIE_TRIVIA_PROJECTS_ROOT で一時ディレクトリ）。pattern は常に MOVIE_TRIVIA_ROOT/patterns。 */
const projectsRoot = () => path.resolve(process.env.MOVIE_TRIVIA_PROJECTS_ROOT ?? MOVIE_TRIVIA_ROOT);
const PATTERN = /^pattern-\d+$/;
/** この consumer が受けられる依頼：news-long → movie-trivia、patterns/ にある pattern（新しい pattern も入る）。 */
export const SUPPORTED = { "news-long": { targetProject: "movie-trivia", orientation: /** @type {const} */ ("landscape"), templates: (/** @type {string} */ t) => PATTERN.test(t) && fs.existsSync(path.join(MOVIE_TRIVIA_ROOT, "patterns", t, "config.json")) } };
const KINDS = ["hook", "fact", "unknown", "transition", "closing"];

/** @param {string} id */
export function files(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new pr.HandoffError(`--project は kebab-case です（${id}）`);
  const dir = path.join(projectsRoot(), id);
  return {
    dir,
    projectJson: path.join(dir, "project.json"),
    link: path.join(dir, "input", "production.json"),
    script: path.join(dir, "input", "script.json"),
    validation: path.join(dir, "input", "production-validation.json"),
    quality: path.join(dir, "input", "quality-check.json"),
    visualReview: path.join(dir, "input", "visual-review.json"),
    narration: path.join(dir, "audio", "narration.json"),
    ledger: path.join(dir, "assets", "asset-sources.json"),
    output: path.join(dir, "output"),
    mp4: path.join(dir, "output", `${id}.mp4`),
    result: path.join(dir, "output", "production-result.json"),
  };
}

const readJson = (/** @type {string} */ f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (/** @type {string} */ f, /** @type {any} */ v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
};
const sha = (/** @type {string} */ f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const printChecks = (/** @type {{ name: string, passed: boolean, reason: string }[]} */ checks) => {
  for (const c of checks) console.log(`  ${c.passed ? "✓" : "✗"} ${c.name.padEnd(15)} ${c.reason}`);
};

/** @param {string} campaignId @param {string} key */
const readRequest = (campaignId, key) => pr.readRequest(campaignId, key, SUPPORTED);

/** 動画フォルダの紐付けから、依頼を読み直す（毎回 content-ops の依頼を読む）。 @param {string} id */
function linked(id) {
  const f = files(id);
  if (!fs.existsSync(f.link)) throw new pr.HandoffError(`${id} は制作依頼に紐付いていません（production.mjs import が先）`);
  const link = readJson(f.link);
  const { request } = readRequest(link.campaignId, link.key);
  if (request.requestId !== link.requestId) throw new pr.HandoffError(`制作依頼が作り直されています（${link.requestId} → ${request.requestId}）。import をやり直す`);
  return { f, link, request };
}

/**
 * movie-trivia の台本の事前確認：pattern が依頼どおり・文ごとに kind と factIds（事実を使わない文は []）・事実の文は factIds あり・知らない factId なし。
 * @param {any} script @param {any} r
 */
export function precheckScript(script, r) {
  /** @type {{ line: string, problem: string }[]} */
  const issues = [];
  if (!script || !Array.isArray(script.scenes)) return [{ line: "-", problem: "台本の形が違います（scenes がない）" }];
  if (script.pattern !== r.targetTemplate) issues.push({ line: "-", problem: `台本の pattern が ${script.pattern}（依頼は ${r.targetTemplate}）` });
  const ids = new Set(r.scriptRules.allowedFacts.map((/** @type {any} */ f) => f.id));
  const factual = pr.isFactual(r);
  for (const sc of script.scenes) {
    for (const l of sc.lines ?? []) {
      if (!KINDS.includes(l.kind)) issues.push({ line: l.id, problem: `kind がない・不正（${l.kind}。${KINDS.join(" | ")}）` });
      if (!Array.isArray(l.factIds)) issues.push({ line: l.id, problem: "factIds がない（事実を使わない文は []）" });
      if (factual && l.kind === "fact" && !(l.factIds ?? []).length) issues.push({ line: l.id, problem: "kind=fact なのに factIds が空" });
      for (const id of l.factIds ?? []) if (!ids.has(id)) issues.push({ line: l.id, problem: `allowedFacts にない factId「${id}」` });
    }
  }
  return issues;
}

/** @type {Record<string, (o: Record<string, string>) => number | Promise<number>>} */
const COMMANDS = {
  show(o) {
    const { file, request: r } = readRequest(req(o, "campaign"), o.key ?? "main");
    if (o.json === "true") {
      console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    const rd = pr.checkReadiness(r);
    console.log(`${path.relative(pr.contentOpsRoot(), file)}（${r.contractVersion}・読み取り専用）`);
    console.log(`制作      : ${r.productionType} → movie-trivia/patterns/${r.targetTemplate}・${r.video.width}×${r.video.height}・${r.video.fps}fps・${Math.round(r.video.durationTargetSec.min / 60)}〜${Math.round(r.video.durationTargetSec.max / 60)}分`);
    console.log(`声        : ${r.video.voice.name}（speaker ${r.video.voice.speaker}・speedScale ${r.video.voice.speedScale}）`);
    console.log(`事実      : allowedFacts ${r.scriptRules.allowedFacts.length}・出典の明示が要る ${r.scriptRules.attributionRequired.length}・禁止表現 ${r.scriptRules.prohibitedClaims.length}・分かっていない ${r.scriptRules.unknownFacts.length}・人名 ${r.scriptRules.noPersonNames ? "出さない" : "承認済み"}`);
    for (const f of r.scriptRules.allowedFacts) console.log(`  [${f.id}] ${f.statement}${f.attribution ? `  ※「${f.attribution.phrases.join("」か「")}」` : ""}`);
    for (const i of r.workflow?.requiredInputs ?? []) console.log(`素材      : ${i.status === "provided" ? "✓" : "…"} ${i.id}（${i.label}）`);
    console.log(`構成      : ${r.creative.structure.map((/** @type {any} */ s) => s.section).join(" / ")}`);
    console.log(`本制作    : ${rd.ready ? "進められる" : "まだ進められない"}`);
    printChecks(rd.checks);
    return 0;
  },
  import(o) {
    const campaignId = req(o, "campaign");
    const key = o.key ?? "main";
    const id = req(o, "project");
    const { file, request: r } = readRequest(campaignId, key);
    const rd = pr.checkReadiness(r);
    printChecks(rd.checks);
    if (!rd.ready) throw new pr.HandoffError("本制作に進めないので紐付けません（content-ops で素材・承認をそろえ、production check で ready にする）");
    const f = files(id);
    if (!fs.existsSync(f.projectJson)) throw new pr.HandoffError(`${id}/project.json がありません。先に node scripts/mt.mjs new --project=${id} --pattern=${r.targetTemplate}`);
    writeJson(f.link, { contractVersion: pr.SUPPORTED_CONTRACT, campaignId, key, requestId: r.requestId, requestPath: path.relative(pr.contentOpsRoot(), file).split(path.sep).join("/"), productionId: id, pattern: r.targetTemplate, importedAt: new Date().toISOString() });
    console.log(`紐付けました：${id}/input/production.json（依頼のコピーではなく、場所と requestId だけ）`);
    console.log(`次：${id}/input/script.json を patterns/${r.targetTemplate}/README.md の型で書く（文ごとに kind・factIds。allowedFacts 以外を足さない）→ node scripts/production.mjs validate --project=${id}`);
    return 0;
  },
  validate(o) {
    const id = req(o, "project");
    const { f, link, request: r } = linked(id);
    if (!fs.existsSync(f.script)) throw new pr.HandoffError(`${id}/input/script.json がありません`);
    const pre = precheckScript(readJson(f.script), r);
    for (const p of pre) console.log(`  ✗ 事前確認（${p.line}）${p.problem}`);
    const co = pre.length ? null : pr.runContentOpsValidation({ campaignId: link.campaignId, key: link.key, scriptPath: f.script });
    if (co) process.stdout.write(co.output.split("\n").filter((/** @type {string} */ l) => /台本の検証|✗|!/u.test(l)).map((/** @type {string} */ l) => `  ${l.trim()}\n`).join(""));
    const status = pre.length ? "fail" : (co?.status ?? "error");
    const proceed = !pre.length && !!co?.proceed;
    writeJson(f.validation, { validatedAt: new Date().toISOString(), requestId: r.requestId, scriptSha256: sha(f.script), status, proceed, precheck: pre, contentOps: co ? { status: co.status, problems: co.problems, safeWarnings: co.safeWarnings, blockingWarnings: co.blockingWarnings } : null });
    console.log(`検証：${status}・${proceed ? "ナレーション・素材・書き出しに進める" : "進めない（VOICEVOX・書き出しをしない）"}`);
    return proceed ? 0 : 1;
  },
  gate(o) {
    const id = req(o, "project");
    const { f, request: r } = linked(id);
    const rd = pr.checkContinuation(r, id);
    const checks = [...rd.checks];
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    checks.push({ name: "validation", passed: !!v?.proceed, reason: v ? `台本の検証 ${v.status}（${v.validatedAt}）${v.proceed ? "" : "・進めない"}` : "台本の検証がまだ（production.mjs validate）" });
    const same = !!v && fs.existsSync(f.script) && v.scriptSha256 === sha(f.script) && v.requestId === r.requestId;
    checks.push({ name: "scriptUnchanged", passed: same, reason: same ? "検証した台本のまま" : "検証の後に台本・依頼が変わった（validate をやり直す）" });
    printChecks(checks);
    const ok = checks.every((c) => c.passed);
    console.log(ok ? "関所：通過" : "関所：止める（VOICEVOX・書き出しをしない）");
    return ok ? 0 : 1;
  },
  async "quality-check"(o) {
    const id = req(o, "project");
    const f = files(id);
    for (const [p, what] of [[f.script, "input/script.json"], [f.narration, "audio/narration.json（narration の後）"], [f.mp4, `output/${id}.mp4（encode の後）`]]) if (!fs.existsSync(p)) throw new pr.HandoffError(`${id}/${what} がありません`);
    const script = readJson(f.script);
    const patternFile = path.join(MOVIE_TRIVIA_ROOT, "patterns", script.pattern ?? "-", "config.json");
    if (!fs.existsSync(patternFile)) throw new pr.HandoffError(`pattern「${script.pattern}」の config.json がありません`);
    const mp4Sha = sha(f.mp4);
    let visualReview = fs.existsSync(f.visualReview) ? readJson(f.visualReview) : null;
    if (visualReview && visualReview.mp4Sha256 !== mp4Sha) {
      console.log("  ※ visual-review.json は別の MP4 を見た判断なので使いません（素材の記録で採点します）");
      visualReview = null;
    }
    const loud = await media.measureLoudness(f.mp4);
    const thumbnails = fs.existsSync(f.output) ? fs.readdirSync(f.output).filter((x) => /^thumbnail-.+\.png$/.test(x)) : [];
    const q = scoreLongQuality({ script, narration: readJson(f.narration), ledger: fs.existsSync(f.ledger) ? readJson(f.ledger) : {}, pattern: readJson(patternFile), audio: { integratedLufs: loud.integratedLufs, truePeakDb: loud.truePeakDb }, mp4Duration: await media.getDuration(f.mp4), thumbnails, visualReview });
    for (const [k, v] of Object.entries(q.metrics)) {
      console.log(`  ${String(v.score).padStart(3)} ${k}`);
      for (const x of v.findings) console.log(`        - ${x}`);
    }
    console.log(`overallQuality ${q.overallQuality}・QUALITY_GATE = ${q.gate}${q.blocking.length ? `（${q.blocking.join("・")}）` : ""}`);
    const entry = { rulesVersion: q.rulesVersion, gate: q.gate, overallQuality: q.overallQuality, scores: q.scores, blocking: q.blocking, metrics: q.metrics, reviewNotes: visualReview?.notes ?? [], visualEvidence: { judgmentSource: q.metrics.visualStrength.evidence.judgmentSource, realFootageRatio: q.metrics.visualStrength.evidence.realFootageRatio, diagramRatio: null, cardRatio: null, motionEvidence: null, strongestFrame: null, weakestFrame: null }, mp4Sha256: mp4Sha };
    const rec = pr.appendQualityAttempt(o.out ? path.resolve(o.out) : f.quality, entry, LONG_QUALITY_RULES.maxAttempts);
    console.log(`試行 ${rec.latest.attempt}/${rec.maxAttempts}${rec.latest.escalation === "human-review" ? "・上限に達したので人の確認へ（公開しない）" : rec.latest.escalation === "auto-fix" ? "・修正して書き出し直す → quality-check をやり直す" : ""}`);
    console.log(`記録：content-ops で npm run co -- production record-quality --campaign=… --key=… --quality=${path.relative(process.cwd(), o.out ? path.resolve(o.out) : f.quality)}`);
    return q.gate === "pass" ? 0 : 1;
  },
  async result(o) {
    const id = req(o, "project");
    const { f } = linked(id);
    const status = req(o, "render-status");
    if (!["started", "rendered", "failed", "published"].includes(status)) throw new pr.HandoffError("--render-status は started | rendered | failed | published です");
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    const rel = (/** @type {string} */ p) => (fs.existsSync(p) ? path.relative(path.dirname(projectsRoot()), p).split(path.sep).join("/") : null);
    const narration = fs.existsSync(f.narration) ? readJson(f.narration) : null;
    const durationSec = fs.existsSync(f.mp4) ? await media.getDuration(f.mp4) : (narration?.durationSeconds ?? null);
    /** @type {Record<string, unknown>} */
    const r = {
      productionId: id,
      startedAt: o["started-at"] ?? new Date().toISOString(),
      completedAt: o["completed-at"] ?? null,
      scriptPath: rel(f.script),
      audioPath: rel(path.join(f.dir, "audio", "narration.wav")),
      subtitlePath: rel(path.join(f.dir, "audio", "narration.srt")),
      videoPath: rel(f.mp4),
      durationSec: typeof durationSec === "number" ? Math.round(durationSec * 100) / 100 : null,
      validationStatus: v?.status ?? null,
      renderStatus: status,
    };
    if (fs.existsSync(f.quality)) {
      const q = readJson(f.quality).latest;
      Object.assign(r, { qualityGate: q.gate, overallQuality: q.overallQuality, qualityAttempt: q.attempt, qualityEscalation: q.escalation });
    }
    writeJson(f.result, r);
    console.log(JSON.stringify(r, null, 2));
    console.log(`書きました：${f.result}（content-ops 側で npm run co -- production record-result --campaign=… --key=… --result=<このファイル>）`);
    return 0;
  },
};

/** @param {Record<string, string>} o @param {string} k */
function req(o, k) {
  const v = o[k];
  if (!v || v === "true") throw new pr.HandoffError(`--${k}=… が必要です`);
  return v;
}

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

export async function main(/** @type {string[]} */ argv) {
  const { cmd, o } = parse(argv);
  const fn = cmd ? COMMANDS[cmd] : undefined;
  if (!fn) {
    console.log("使い方: node scripts/production.mjs show|import|validate|gate|quality-check|result …（ファイル先頭のコメント）");
    return cmd ? 1 : 0;
  }
  try {
    return await fn(o);
  } catch (err) {
    console.error(err instanceof pr.HandoffError ? `止めました：${err.message}` : err instanceof Error ? (err.stack ?? err.message) : String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
