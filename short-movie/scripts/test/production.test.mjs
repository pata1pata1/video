// content-ops の制作依頼を読む consumer のテスト（node --test short-movie/scripts/test/）。
// 依頼は一時ディレクトリ（CONTENT_OPS_CAMPAIGNS_DIR）の mock。台本の検証は本物の content-ops CLI（読み取りだけ・--save なし）を呼ぶ。
// 動画フォルダも一時ディレクトリ（SHORT_MOVIE_PROJECTS_ROOT）。VOICEVOX・レンダリングはしない。
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHORT_MOVIE = path.resolve(here, "..", "..");
const CONTENT_OPS = path.resolve(process.env.CONTENT_OPS_ROOT ?? path.join(SHORT_MOVIE, "..", "..", "content-ops"));
const REAL_REQUEST = path.join(CONTENT_OPS, "campaigns", "topic-20261118-2a00425b", "production", "video-main.json");
const skip = !fs.existsSync(path.join(CONTENT_OPS, "bin", "co.mts")) || !fs.existsSync(REAL_REQUEST) ? "content-ops（../../content-ops）か実際の制作依頼がない" : false;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sm-production-"));
const CAMPAIGNS = path.join(tmp, "campaigns");
const PROJECTS = path.join(tmp, "projects");
process.env.CONTENT_OPS_ROOT = CONTENT_OPS;
process.env.CONTENT_OPS_CAMPAIGNS_DIR = CAMPAIGNS;
process.env.SHORT_MOVIE_PROJECTS_ROOT = PROJECTS;

const { main } = await import("../production.mjs");
const { readRequest, checkReadiness, contractIssues, HandoffError } = await import("../lib/production/contract.mjs");
const { buildDraftScript, precheckScript } = await import("../lib/production/script.mjs");
const { checkVisuals } = await import("../lib/production/visuals.mjs");
const { runContentOpsValidation } = await import("../lib/production/validate.mjs");

const NOW = Date.now();
const iso = (h) => new Date(NOW + h * 3_600_000).toISOString();
/** 実際の依頼（読むだけ）をもとにした mock。 */
function mockRequest(campaignId, over = {}) {
  const r = JSON.parse(fs.readFileSync(REAL_REQUEST, "utf8"));
  const m = { ...r, campaignId, ...over, factCheck: { ...r.factCheck, ...(over.factCheck ?? {}) } };
  const f = path.join(CAMPAIGNS, campaignId, "production", "video-main.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  return m;
}
const READY = { status: "ready", factCheck: { readyExpiresAt: iso(5), lastRefresh: { checkedAt: iso(-1), checkedBy: "test", sources: [], changes: {}, contradictions: [], notes: "" } } };
function project(id) {
  const dir = path.join(PROJECTS, id);
  fs.mkdirSync(path.join(dir, "input"), { recursive: true });
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ id, type: "short-movie" }));
  return dir;
}
async function run(args) {
  const out = [];
  const [log, err] = [console.log, console.error];
  console.log = (m) => out.push(String(m));
  console.error = (m) => out.push(String(m));
  const ow = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => (out.push(String(s)), true);
  try {
    const code = await main(args);
    return { code, text: out.join("\n") };
  } finally {
    console.log = log;
    console.error = err;
    process.stdout.write = ow;
  }
}
const hashTree = (dir) => {
  const h = crypto.createHash("sha256");
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p).update(fs.readFileSync(p));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return h.digest("hex");
};
const realHash = () => (fs.existsSync(REAL_REQUEST) ? crypto.createHash("sha256").update(fs.readFileSync(REAL_REQUEST)).digest("hex") : null);
const REAL_BEFORE = realHash();

test("契約を読める（content-ops.production-request/1・news-short・short-movie・news-short-top）", { skip }, () => {
  mockRequest("c-valid");
  const { request } = readRequest("c-valid", "main");
  assert.deepEqual(contractIssues(request, "c-valid", "main"), []);
  assert.equal(request.video.voice.speaker, 13);
  assert.equal(request.targetTemplate, "news-short-top");
});

test("contractVersion・テンプレート・大きさが違う依頼は読まない", { skip }, () => {
  mockRequest("c-bad", { contractVersion: "content-ops.production-request/2" });
  assert.throws(() => readRequest("c-bad", "main"), /contractVersion/);
  mockRequest("c-bad2", { targetTemplate: "movie-trailer" });
  assert.throws(() => readRequest("c-bad2", "main"), /targetTemplate/);
  const r = mockRequest("c-bad3");
  fs.writeFileSync(path.join(CAMPAIGNS, "c-bad3", "production", "video-main.json"), JSON.stringify({ ...r, video: { ...r.video, width: 1920, height: 1080 } }));
  assert.throws(() => readRequest("c-bad3", "main"), /1080×1920/);
  assert.throws(() => readRequest("no-such", "main"), /制作依頼がありません/);
});

test("prepared では本制作に進めない（import・prepare-script を止める）", { skip }, async () => {
  mockRequest("c-prep");
  project("p-prep");
  const { request } = readRequest("c-prep", "main");
  assert.equal(checkReadiness(request).ready, false);
  const r = await run(["import", "--campaign=c-prep", "--project=p-prep"]);
  assert.equal(r.code, 1);
  assert.match(r.text, /✗ status/);
  assert.equal(fs.existsSync(path.join(PROJECTS, "p-prep", "input", "production.json")), false);
});

test("ready で期限内なら進められる。期限切れは止める", { skip }, () => {
  const ok = mockRequest("c-ready", READY);
  assert.equal(checkReadiness(ok).ready, true);
  const exp = mockRequest("c-exp", { ...READY, factCheck: { ...READY.factCheck, readyExpiresAt: iso(-1) } });
  const rd = checkReadiness(exp);
  assert.equal(rd.ready, false);
  assert.ok(rd.checks.some((c) => c.name === "readyExpiresAt" && !c.passed && /期限切れ/.test(c.reason)));
});

test("allowedFacts と creative だけから台本の下書き（kind・factIds・attribution）。分かっていないことは kind=unknown だけ", { skip }, () => {
  const r = mockRequest("c-draft", READY);
  const s = buildDraftScript(r, "p-draft");
  const ids = new Set(r.scriptRules.allowedFacts.map((f) => f.id));
  for (const x of s.sentences) {
    assert.ok(["hook", "fact", "unknown", "closing"].includes(x.kind));
    assert.ok(Array.isArray(x.factIds) && Array.isArray(x.attribution));
    for (const id of x.factIds) assert.ok(ids.has(id), id);
  }
  const fact = s.sentences.filter((x) => x.kind === "fact");
  assert.deepEqual(fact.map((x) => x.factIds[0]).sort(), [...ids].sort(), "すべての allowedFacts を1回ずつ");
  const st = fact.find((x) => x.factIds[0] === "statement-relationship");
  assert.deepEqual(st.attribution, ["捜査関係者"]);
  assert.match(st.cards.map((c) => c.text).join(""), /^捜査関係者への取材によると、/);
  assert.match(fact.find((x) => x.factIds[0] === "charge-change").cards.map((c) => c.text).join(""), /^共同通信によると、/);
  const unknown = s.sentences.filter((x) => x.kind === "unknown");
  assert.equal(unknown.length, r.scriptRules.unknownFacts.length);
  assert.ok(unknown.every((x) => x.factIds.length === 0));
  assert.equal(s.voice.speaker, 13);
  assert.deepEqual(precheckScript(s, r), []);
});

test("台本の検証（content-ops の validate-script）：下書きは通り、ready なら import → prepare-script → validate → gate", { skip }, async () => {
  mockRequest("c-flow", READY);
  project("p-flow");
  assert.equal((await run(["import", "--campaign=c-flow", "--project=p-flow"])).code, 0);
  assert.equal((await run(["prepare-script", "--project=p-flow"])).code, 0);
  const v = await run(["validate", "--project=p-flow"]);
  assert.equal(v.code, 0, v.text);
  assert.match(v.text, /検証：(pass|warning)・ナレーション・字幕・レンダリングに進める/);
  assert.equal((await run(["gate", "--project=p-flow"])).code, 0);
  // 検証の後に台本を変えたら関所で止める
  const sf = path.join(PROJECTS, "p-flow", "input", "script.json");
  const s = JSON.parse(fs.readFileSync(sf, "utf8"));
  s.sentences[1].cards[0].text += "（追記）";
  fs.writeFileSync(sf, JSON.stringify(s));
  const g = await run(["gate", "--project=p-flow"]);
  assert.equal(g.code, 1);
  assert.match(g.text, /✗ scriptUnchanged/);
});

const withSentence = (r, sentence) => {
  const s = buildDraftScript(r, "x");
  s.sentences.push(sentence);
  const f = path.join(tmp, `script-${crypto.randomUUID()}.json`);
  fs.writeFileSync(f, JSON.stringify(s));
  return f;
};

test("根拠のない事実（factIds なし・知らない factId・事実にない数字）を入れた台本は fail", { skip }, () => {
  const r = mockRequest("c-unsup", READY);
  for (const sentence of [
    { kind: "fact", factIds: [], attribution: [], cards: [{ text: "男は以前から女性につきまとっていました。" }] },
    { kind: "fact", factIds: ["motive"], attribution: [], cards: [{ text: "動機が判明しました。" }] },
    { kind: "fact", factIds: ["arrest"], attribution: [], cards: [{ text: "警視庁は41歳の男を逮捕しました。" }] },
  ]) {
    const res = runContentOpsValidation({ campaignId: "c-unsup", key: "main", scriptPath: withSentence(r, sentence) });
    assert.equal(res.status, "fail", res.output);
    assert.equal(res.proceed, false);
  }
});

test("禁止表現・人名は fail（犯人・殺害の断定・起訴済み・駅名・勤務先・人名）", { skip }, () => {
  const r = mockRequest("c-proh", READY);
  for (const text of ["犯人は逃走していました。", "男は女性を殺害しました。", "男はすでに起訴されました。", "現場は中野駅の近くです。", "被害者の勤務先も分かっています。", "山田花子さんが亡くなりました。"]) {
    const res = runContentOpsValidation({ campaignId: "c-proh", key: "main", scriptPath: withSentence(r, { kind: "unknown", factIds: [], attribution: [], cards: [{ text }] }) });
    assert.equal(res.status, "fail", `${text}\n${res.output}`);
  }
});

test("出典の明示の不足を見つける：video 側の事前確認と content-ops の検証（捜査関係者は fail、1媒体だけは進めない warning）", { skip }, () => {
  const r = mockRequest("c-attr", READY);
  const s = buildDraftScript(r, "x");
  const st = s.sentences.find((x) => x.factIds[0] === "statement-relationship");
  st.cards = [{ text: "男は「付き合えないなら殺して自分も死のうと思った」と供述しているということです。" }];
  st.attribution = [];
  assert.ok(precheckScript(s, r).some((p) => /出典の明示が必要/.test(p.problem)));
  const f1 = path.join(tmp, "attr1.json");
  fs.writeFileSync(f1, JSON.stringify(s));
  assert.equal(runContentOpsValidation({ campaignId: "c-attr", key: "main", scriptPath: f1 }).status, "fail");
  const s2 = buildDraftScript(r, "x");
  const cc = s2.sentences.find((x) => x.factIds[0] === "charge-change");
  cc.cards = [{ text: "18日、警視庁は容疑を強盗殺人に切り替えて捜査書類を東京地検に送りました。" }];
  cc.attribution = [];
  const f2 = path.join(tmp, "attr2.json");
  fs.writeFileSync(f2, JSON.stringify(s2));
  const res = runContentOpsValidation({ campaignId: "c-attr", key: "main", scriptPath: f2 });
  assert.equal(res.status, "warning");
  assert.equal(res.renderAllowed, true);
  assert.equal(res.proceed, false, "出典の明示漏れは安全に関わる warning なので進めない");
  assert.ok(res.blockingWarnings.length > 0);
});

test("分かっていないこと（unknownFacts）を事実の文に書けば事前確認で止める", { skip }, () => {
  const r = mockRequest("c-unk", READY);
  const s = buildDraftScript(r, "x");
  s.sentences.push({ kind: "fact", factIds: ["arrest"], attribution: [], cards: [{ text: "動機は金銭トラブルとされます。" }] });
  assert.ok(precheckScript(s, r).some((p) => /分かっていないこと（動機）/.test(p.problem)));
});

test("画像の安全方針：登録のない画像・禁止の種類・事件現場を示す地図は止める", { skip }, () => {
  const r = mockRequest("c-vis", READY);
  const s = buildDraftScript(r, "x");
  const file = s.sentences[0].cards[0].image;
  assert.ok(checkVisuals(s, { images: [] }, r).some((x) => x.includes("登録がない")));
  assert.ok(checkVisuals(s, { images: [{ file, category: "knife-closeup" }] }, r).some((x) => x.includes("刃物")));
  assert.ok(checkVisuals(s, { images: [{ file, category: "stock-photo" }] }, r).some((x) => x.includes("使える種類ではない")));
  assert.ok(checkVisuals(s, { images: [{ file, category: "map-overview", showsIncidentLocation: true }] }, r).some((x) => x.includes("地点を示さない")));
});

test("content-ops へ返す結果 JSON（productionId・パス・尺・検証・状態）", { skip }, async () => {
  mockRequest("c-res", READY);
  const dir = project("p-res");
  await run(["import", "--campaign=c-res", "--project=p-res"]);
  await run(["prepare-script", "--project=p-res"]);
  await run(["validate", "--project=p-res"]);
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  fs.writeFileSync(path.join(dir, "audio", "timeline.json"), JSON.stringify({ duration: 81.234, cards: [] }));
  const r = await run(["result", "--project=p-res", "--render-status=started", "--started-at=2026-11-19T01:00:00.000Z"]);
  assert.equal(r.code, 0);
  const res = JSON.parse(fs.readFileSync(path.join(dir, "output", "production-result.json"), "utf8"));
  assert.deepEqual(Object.keys(res), ["productionId", "startedAt", "completedAt", "scriptPath", "audioPath", "subtitlePath", "videoPath", "durationSec", "validationStatus", "renderStatus"]);
  assert.equal(res.productionId, "p-res");
  assert.equal(res.durationSec, 81.23);
  assert.match(res.scriptPath, /p-res\/input\/script\.json$/);
  assert.equal(res.videoPath, null);
  assert.ok(["pass", "warning"].includes(res.validationStatus));
  assert.equal(res.renderStatus, "started");
  assert.equal((await run(["result", "--project=p-res", "--render-status=done"])).code, 1);
});

test("content-ops 側のファイルを変更しない（mock の依頼・実際の依頼とも）", { skip }, async () => {
  mockRequest("c-ro", READY);
  project("p-ro");
  const before = hashTree(CAMPAIGNS);
  await run(["show", "--campaign=c-ro"]);
  await run(["import", "--campaign=c-ro", "--project=p-ro"]);
  await run(["prepare-script", "--project=p-ro"]);
  await run(["validate", "--project=p-ro"]);
  await run(["gate", "--project=p-ro"]);
  await run(["result", "--project=p-ro", "--render-status=started"]);
  assert.equal(hashTree(CAMPAIGNS), before, "一時 campaigns の中身が変わっていない");
  // 実際の依頼：読むだけ（show）
  delete process.env.CONTENT_OPS_CAMPAIGNS_DIR;
  try {
    const s = await run(["show", "--campaign=topic-20261118-2a00425b", "--key=main"]);
    assert.equal(s.code, 0);
    assert.match(s.text, /まだ進められない/);
  } finally {
    process.env.CONTENT_OPS_CAMPAIGNS_DIR = CAMPAIGNS;
  }
  assert.equal(realHash(), REAL_BEFORE);
  const link = JSON.parse(fs.readFileSync(path.join(PROJECTS, "p-ro", "input", "production.json"), "utf8"));
  assert.deepEqual(Object.keys(link).sort(), ["campaignId", "contractVersion", "importedAt", "key", "productionId", "requestId", "requestPath"].sort(), "紐付けは場所と requestId だけ（依頼のコピーではない）");
  assert.ok(HandoffError);
});
