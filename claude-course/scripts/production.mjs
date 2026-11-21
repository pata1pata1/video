// @ts-check
// content-ops の制作依頼（tool-demo-long：AIツールの実演の通常動画、2026-11-22）を読む consumer。依頼は content-ops の campaign にあり、ここでは読むだけ。
// 共通の部分（依頼の場所・契約・ready・content-ops の台本の検証・品質の記録）は共通remotionの core/production-request。説明：../DEMO.md
//
//   node scripts/production.mjs show    --campaign=<id> [--key=main]
//   node scripts/production.mjs import  --campaign=<id> [--key=main] --project=<id>   ready で期限内なら動画フォルダに紐付け（input/production.json）
//   node scripts/production.mjs validate --project=<id>     台本（lesson.json）と demo-beats.json の事前確認 → content-ops の validate-script
//   node scripts/production.mjs gate    --project=<id>      narration・render・encode の前の関所（cc.mjs が呼ぶ）
//   node scripts/production.mjs beats   --project=<id>      demo-beats.json → presentation.json の beats（narration の後・render の前）
//   node scripts/production.mjs quality-check --project=<id>  公開前の品質ゲート demo-long-v1（依頼のないテストの動画でも使える）
//   node scripts/production.mjs result  --project=<id> --render-status=started|rendered|failed|published

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CLAUDE_COURSE_ROOT, REMOTION_ROOT } from "./lib/engine.mjs";
import { DEMO_LONG_RULES, buildBeats, captureSummaries, loadCaptures, precheckDemoLesson, scoreDemoLong } from "./lib/demo.mjs";

const core = await import(pathToFileURL(path.join(REMOTION_ROOT, "src", "core", "production-request", "index.mjs")).href);
const { HandoffError, SUPPORTED_CONTRACT, appendQualityAttempt, checkContinuation, checkReadiness, contentOpsRoot, readRequest, runContentOpsValidation } = core;

/** この claude-course が受けられる制作の種類（横の通常動画だけ）。 */
const SUPPORTED = { "tool-demo-long": { targetProject: "claude-course", templates: (/** @type {string} */ t) => t === "tool-demo", orientation: "landscape" } };

const projectsRoot = () => path.resolve(process.env.CLAUDE_COURSE_PROJECTS_ROOT ?? CLAUDE_COURSE_ROOT);
const files = (/** @type {string} */ id) => {
  const dir = path.join(projectsRoot(), id);
  return {
    dir,
    projectJson: path.join(dir, "project.json"),
    link: path.join(dir, "input", "production.json"),
    lesson: path.join(dir, "input", "lesson.json"),
    demoBeats: path.join(dir, "input", "demo-beats.json"),
    presentation: path.join(dir, "input", "presentation.json"),
    validation: path.join(dir, "input", "production-validation.json"),
    quality: path.join(dir, "input", "quality-check.json"),
    visualReview: path.join(dir, "input", "visual-review.json"),
    narration: path.join(dir, "audio", "narration.json"),
    narrationWav: path.join(dir, "audio", "narration.wav"),
    captions: path.join(dir, "audio", "captions.vtt"),
    mp4: path.join(dir, "output", `${id}.mp4`),
    result: path.join(dir, "output", "production-result.json"),
  };
};
const readJson = (/** @type {string} */ f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (/** @type {string} */ f, /** @type {any} */ v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
};
const sha = (/** @type {string} */ f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
/** 台本と demo-beats の両方の指紋（検証の後に変わっていないか）。 @param {ReturnType<typeof files>} f */
const inputSha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f.lesson)).update(fs.existsSync(f.demoBeats) ? fs.readFileSync(f.demoBeats) : "").digest("hex");

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
/** @param {{ name: string, passed: boolean, reason: string }[]} checks */
const printChecks = (checks) => {
  for (const c of checks) console.log(`  ${c.passed ? "✓" : "✗"} ${c.name.padEnd(15)} ${c.reason}`);
};

/** 紐付けから依頼を読み直す。 @param {string} id */
function linked(id) {
  const f = files(id);
  if (!fs.existsSync(f.link)) throw new HandoffError(`${id} は制作依頼に紐付いていません（production.mjs import が先）`);
  const link = readJson(f.link);
  const { request } = readRequest(link.campaignId, link.key, SUPPORTED);
  if (request.requestId !== link.requestId) throw new HandoffError(`制作依頼が作り直されています（${link.requestId} → ${request.requestId}）。import をやり直す`);
  return { f, link, request };
}
/** 紐付いていれば依頼（テストの動画は null）。 @param {string} id */
const linkedOrNull = (id) => (fs.existsSync(files(id).link) ? linked(id).request : null);

/** @type {Record<string, (o: Record<string, string>) => number | Promise<number>>} */
const COMMANDS = {
  show(o) {
    const { file, request: r } = readRequest(req(o, "campaign"), o.key ?? "main", SUPPORTED);
    const rd = checkReadiness(r);
    console.log(`${path.relative(contentOpsRoot(), file)}（${r.contractVersion}・読み取り専用）`);
    console.log(`制作      : ${r.productionType} → ${r.targetProject}/${r.targetTemplate}・${r.video.width}×${r.video.height}・${r.video.durationTargetSec.min}〜${r.video.durationTargetSec.max}秒`);
    console.log(`声        : ${r.video.voice.name}（speaker ${r.video.voice.speaker}・speedScale ${r.video.voice.speedScale}）`);
    for (const f of r.scriptRules.allowedFacts) console.log(`  [${f.id}] ${f.statement}`);
    console.log(`本制作    : ${rd.ready ? "進められる" : "まだ進められない"}`);
    printChecks(rd.checks);
    return 0;
  },
  import(o) {
    const campaignId = req(o, "campaign");
    const key = o.key ?? "main";
    const id = req(o, "project");
    const { file, request: r } = readRequest(campaignId, key, SUPPORTED);
    const rd = checkReadiness(r);
    printChecks(rd.checks);
    if (!rd.ready) throw new HandoffError("本制作に進めないので紐付けません（content-ops で production check --refresh を通して ready にする）");
    const f = files(id);
    if (!fs.existsSync(f.projectJson)) throw new HandoffError(`${id}/project.json がありません。先に node scripts/cc.mjs new --project=${id}`);
    writeJson(f.link, { contractVersion: SUPPORTED_CONTRACT, campaignId, key, requestId: r.requestId, requestPath: path.relative(contentOpsRoot(), file).split(path.sep).join("/"), productionId: id, importedAt: new Date().toISOString() });
    console.log(`紐付けました：${id}/input/production.json（依頼のコピーではなく、場所と requestId だけ）`);
    return 0;
  },
  validate(o) {
    const id = req(o, "project");
    const { f, link, request: r } = linked(id);
    if (!fs.existsSync(f.lesson)) throw new HandoffError(`${id}/input/lesson.json がありません`);
    const lesson = readJson(f.lesson);
    const demoBeats = fs.existsSync(f.demoBeats) ? readJson(f.demoBeats) : {};
    const pre = precheckDemoLesson(lesson, demoBeats, r, loadCaptures(f.dir));
    for (const p of pre) console.log(`  ✗ 事前確認（${p.line}）${p.problem}`);
    const co = pre.length ? null : runContentOpsValidation({ campaignId: link.campaignId, key: link.key, scriptPath: f.lesson });
    if (co) process.stdout.write(co.output.split("\n").filter((/** @type {string} */ l) => /台本の検証|✗|!/u.test(l)).map((/** @type {string} */ l) => `  ${l.trim()}\n`).join(""));
    const status = pre.length ? "fail" : (co?.status ?? "error");
    const proceed = !pre.length && !!co?.proceed;
    writeJson(f.validation, { validatedAt: new Date().toISOString(), requestId: r.requestId, inputSha256: inputSha(f), status, proceed, precheck: pre, contentOps: co ? { status: co.status, problems: co.problems, safeWarnings: co.safeWarnings, blockingWarnings: co.blockingWarnings } : null });
    console.log(`検証：${status}・${proceed ? "ナレーション・レンダリングに進める" : "進めない（VOICEVOX・レンダリングをしない）"}`);
    return proceed ? 0 : 1;
  },
  gate(o) {
    const id = req(o, "project");
    const { f, request: r } = linked(id);
    const checks = [...checkContinuation(r, id).checks];
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    checks.push({ name: "validation", passed: !!v?.proceed, reason: v ? `台本の検証 ${v.status}（${v.validatedAt}）${v.proceed ? "" : "・進めない"}` : "台本の検証がまだ（production.mjs validate）" });
    const same = !!v && fs.existsSync(f.lesson) && v.inputSha256 === inputSha(f) && v.requestId === r.requestId;
    checks.push({ name: "scriptUnchanged", passed: same, reason: same ? "検証した台本・demo-beats のまま" : "検証の後に台本・demo-beats・依頼が変わった（validate をやり直す）" });
    printChecks(checks);
    const ok = checks.every((c) => c.passed);
    console.log(ok ? "関所：通過" : "関所：止める（VOICEVOX・レンダリングをしない）");
    return ok ? 0 : 1;
  },
  async beats(o) {
    const id = req(o, "project");
    const f = files(id);
    for (const [p, what] of [[f.demoBeats, "input/demo-beats.json"], [f.narration, "audio/narration.json（narration の後）"], [f.presentation, "input/presentation.json（cc.mjs new が作る）"]]) if (!fs.existsSync(p)) throw new HandoffError(`${id}/${what} がありません`);
    const { beats, shots } = await buildBeats({ demoBeats: readJson(f.demoBeats), narration: readJson(f.narration), captures: loadCaptures(f.dir) });
    const p = readJson(f.presentation);
    writeJson(f.presentation, { ...p, beats: { ...(p.beats ?? {}), ...beats } });
    for (const s of shots) console.log(`  ${s.start.toFixed(1).padStart(6)}〜${s.end.toFixed(1).padEnd(6)}秒 録画 ${s.capture}：${s.steps.join("・")}${s.rate !== 1 ? `（×${s.rate}）` : ""}`);
    console.log(`presentation.json の beats を書きました（${Object.keys(beats).length} 場面・録画の画面 ${shots.length}）。次：node scripts/cc.mjs render --project=${id}`);
    return 0;
  },
  async "quality-check"(o) {
    const id = req(o, "project");
    const f = files(id);
    for (const [p, what] of [[f.lesson, "input/lesson.json"], [f.demoBeats, "input/demo-beats.json"], [f.narration, "audio/narration.json"], [f.mp4, `output/${id}.mp4（encode の後）`]]) if (!fs.existsSync(p)) throw new HandoffError(`${id}/${what} がありません`);
    const { measureAudio } = await import("./lib/audio.mjs");
    const q = await scoreDemoLong({ lesson: readJson(f.lesson), narration: readJson(f.narration), demoBeats: readJson(f.demoBeats), captures: loadCaptures(f.dir), audio: measureAudio(f.mp4) });
    for (const [k, v] of Object.entries(q.metrics)) {
      console.log(`  ${String(v.score).padStart(3)} ${k}`);
      for (const x of v.findings) console.log(`        - ${x}`);
    }
    console.log(`overallQuality ${q.overallQuality}・QUALITY_GATE = ${q.gate}${q.blocking.length ? `（${q.blocking.join("・")}）` : ""}`);
    const visualReview = fs.existsSync(f.visualReview) ? readJson(f.visualReview) : null;
    const rec = appendQualityAttempt(o.out ?? f.quality, { rulesVersion: q.rulesVersion, gate: q.gate, overallQuality: q.overallQuality, scores: q.scores, blocking: q.blocking, metrics: q.metrics, reviewNotes: visualReview?.notes ?? [], visualEvidence: null, humanComparison: null, rules: DEMO_LONG_RULES, weights: q.weights }, DEMO_LONG_RULES.maxAttempts);
    console.log(`試行 ${rec.latest.attempt}/${rec.maxAttempts}${rec.latest.escalation === "human-review" ? "・上限に達したので人の確認へ（公開しない）" : rec.latest.escalation === "auto-fix" ? "・修正して再レンダリング → quality-check をやり直す" : ""}`);
    return q.gate === "pass" ? 0 : 1;
  },
  async result(o) {
    const id = req(o, "project");
    const { f } = linked(id);
    const statuses = ["started", "rendered", "failed", "published"];
    const renderStatus = req(o, "render-status");
    if (!statuses.includes(renderStatus)) throw new HandoffError(`--render-status は ${statuses.join(" | ")}`);
    const rel = (/** @type {string} */ p) => (fs.existsSync(p) ? path.relative(path.dirname(projectsRoot()), p).split(path.sep).join("/") : null);
    const v = fs.existsSync(f.validation) ? readJson(f.validation) : null;
    const dur = fs.existsSync(f.narration) ? readJson(f.narration).durationSeconds : null;
    /** @type {any} */
    const r = {
      productionId: id,
      startedAt: o["started-at"] ?? new Date().toISOString(),
      completedAt: o["completed-at"] ?? null,
      scriptPath: rel(f.lesson),
      audioPath: rel(f.narrationWav),
      subtitlePath: rel(f.captions),
      videoPath: rel(f.mp4),
      durationSec: typeof dur === "number" ? Math.round(dur * 100) / 100 : null,
      validationStatus: v?.status ?? null,
      renderStatus,
      // 実際に操作した記録（ツール・規約の確認日・操作・収録日時）。動画を消した後も content-ops の campaign に残る
      captures: await captureSummaries(loadCaptures(f.dir)),
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

export async function main(/** @type {string[]} */ argv) {
  const { cmd, o } = parse(argv);
  const fn = cmd ? COMMANDS[cmd] : undefined;
  if (!fn) {
    console.log("使い方: node scripts/production.mjs show|import|validate|gate|beats|quality-check|result …（ファイル先頭のコメント）");
    return cmd ? 1 : 0;
  }
  try {
    return await fn(o);
  } catch (err) {
    console.error(err instanceof HandoffError ? `止めました：${err.message}` : err instanceof Error ? (err.stack ?? err.message) : String(err));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
