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

test("関所：制作を始めた後（content-ops が in-production に進めた後）も、この動画の制作なら続けられる。別の制作・期限切れは止める", { skip }, async () => {
  const { checkContinuation } = await import("../lib/production/contract.mjs");
  const base = mockRequest("c-cont", READY);
  const inProd = (pid, exp = iso(5)) => ({ ...base, status: "in-production", handoff: { ...base.handoff, productionId: pid }, factCheck: { ...base.factCheck, readyExpiresAt: exp } });
  assert.equal(checkContinuation(base, "p-cont").ready, true, "ready");
  assert.equal(checkContinuation(inProd("p-cont"), "p-cont").ready, true, "この動画の in-production");
  assert.equal(checkContinuation(inProd("p-other"), "p-cont").ready, false, "別の動画の in-production");
  assert.equal(checkContinuation(inProd("p-cont", iso(-1)), "p-cont").ready, false, "期限切れ");
  assert.equal(checkContinuation({ ...base, status: "prepared" }, "p-cont").ready, false);
  assert.equal(checkReadiness(inProd("p-cont")).ready, false, "始める（import・prepare-script）は ready だけ");
  // CLI の gate：in-production（この動画）でも検証済みなら通る
  mockRequest("c-cont2", READY);
  project("p-cont2");
  await run(["import", "--campaign=c-cont2", "--project=p-cont2"]);
  await run(["prepare-script", "--project=p-cont2"]);
  await run(["validate", "--project=p-cont2"]);
  const f = path.join(CAMPAIGNS, "c-cont2", "production", "video-main.json");
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.writeFileSync(f, JSON.stringify({ ...r, status: "in-production", handoff: { ...r.handoff, productionId: "p-cont2" } }));
  assert.equal((await run(["gate", "--project=p-cont2"])).code, 0);
  fs.writeFileSync(f, JSON.stringify({ ...r, status: "in-production", handoff: { ...r.handoff, productionId: "someone-else" } }));
  assert.equal((await run(["gate", "--project=p-cont2"])).code, 1);
});

const quality = await import("../lib/production/quality.mjs");
/** 字幕の並び（文ごと・画像ごと）から timeline を作る。 */
function timelineOf(sentences) {
  let t = 0;
  const cards = [];
  sentences.forEach((s, si) => s.cards.forEach((c) => {
    const d = Math.max(1.0, c.text.length / 7.2);
    cards.push({ sentence: si, text: c.text, image: c.image, start: t, end: t + d });
    t += d;
  }));
  let img;
  for (const c of cards) c.image = img = c.image ?? img;
  return { duration: t, cards };
}

test("品質チェック：今回の失敗と同じ形（前置きの冒頭・長い静止画・長文カード・77秒・事務的な締め）は QUALITY_GATE = fail", { skip }, () => {
  const s = { sentences: [
    { kind: "hook", cards: [{ text: "東京・中野区の路上で", image: "01.png" }, { text: "女性が刃物で刺され死亡した事件で" }, { text: "警視庁は39歳の男を逮捕しました" }] },
    { kind: "transition", cards: [{ text: "報道で分かっていることと" }, { text: "まだ分かっていないことを整理します" }] },
    ...Array.from({ length: 10 }, (_, i) => ({ kind: "fact", factIds: [`f${i}`], cards: [{ text: "捜査関係者への取材によると、", image: i % 4 === 0 ? `0${2 + i / 4}.png` : undefined }, { text: "男は供述しているということです" }, { text: "警視庁は詳しく調べています" }] })),
    { kind: "closing", cards: [{ text: "報道の出典は概要欄にまとめています" }] },
  ] };
  const visuals = { images: ["01.png", "02.png", "03.png", "04.png"].map((file) => ({ file, category: "text-card", onScreenText: ["捜査の段階", "容疑を強盗殺人に切り替え捜査書類を東京地検へ", "※11月18日の切り替えは共同通信による", "出典：NHK・共同通信"] })) };
  const q = quality.scoreQuality({ script: s, timeline: timelineOf(s.sentences), visuals, audio: { lufs: -15.2, truePeak: -1.4, longSilences: 0 } });
  assert.equal(q.gate, "fail");
  assert.ok(q.scores.hookQuality < 50 && q.scores.visualPacing < 50 && q.scores.onScreenTextLoad < 30, JSON.stringify(q.scores));
  assert.ok(q.metrics.onScreenTextLoad.findings.some((f) => f.includes("長文")), "長文カードを大きく減点");
  assert.ok(q.metrics.retentionRisk.findings.some((f) => f.includes("事務的な締め")));
  assert.equal(q.scores.audioQuality, 100, "音量は問題なし（それでも不合格）");
});

test("品質チェック：短い冒頭・3秒ごとの画の切り替え・短いキーワードの画面・45秒・問いで終わる動画は pass", { skip }, () => {
  const sentences = [
    { kind: "hook", factIds: ["arrest"], cards: [{ text: "なぜ男は刺したのか？", image: "01.jpg" }] },
    { kind: "fact", factIds: ["incident"], cards: [{ text: "11月16日の夜", image: "02.jpg" }, { text: "中野区の路上で", image: "03.jpg" }] },
    { kind: "fact", factIds: ["victim-age"], cards: [{ text: "24歳の女性が", image: "04.jpg" }, { text: "刺され死亡しました" }] },
    { kind: "fact", factIds: ["arrest"], cards: [{ text: "警視庁は39歳の男を", image: "05.jpg" }, { text: "逮捕しました" }] },
    { kind: "fact", factIds: ["charge-change"], cards: [{ text: "共同通信によると", image: "06.jpg" }, { text: "容疑を強盗殺人に" }, { text: "切り替えました", image: "07.jpg" }] },
    { kind: "fact", factIds: ["statement"], cards: [{ text: "捜査関係者によると", image: "08.jpg" }, { text: "男は「付き合えないなら" }, { text: "殺して自分も死のう」と", image: "09.jpg" }, { text: "供述しています" }] },
    { kind: "fact", factIds: ["police-view"], cards: [{ text: "警視庁は一方的な好意と", image: "10.jpg" }, { text: "みて調べています" }] },
    { kind: "unknown", cards: [{ text: "動機はまだ", image: "11.jpg" }, { text: "確定していません" }] },
    { kind: "fact", factIds: ["arrest"], cards: [{ text: "あなたはどう思いますか？", image: "12.jpg" }] },
  ];
  // B：実写（この出来事の公式素材・実物）・動く映像・地図・数字・図解を組み合わせ、目視でも見たくなる画
  const kinds = [
    { category: "footage", realness: "event", layout: "full" }, { category: "photo", realness: "real-object", layout: "full" }, { category: "map-overview", layout: "map" },
    { category: "photo", realness: "event", layout: "full" }, { category: "icon", layout: "big-number" }, { category: "footage", realness: "real-object", layout: "full" },
    { category: "diagram", layout: "diagram" }, { category: "photo", realness: "real-object", layout: "full" }, { category: "footage", realness: "event", layout: "full" },
    { category: "photo", realness: "real-object", layout: "zoom" }, { category: "diagram", layout: "photo-overlay", realness: "real-object" }, { category: "footage", realness: "event", layout: "full" },
  ];
  const visuals = { images: kinds.map((k, i) => ({ file: `${String(i + 1).padStart(2, "0")}.jpg`, ...k, onScreenText: i % 2 ? ["39歳の男を逮捕"] : ["11月16日 夜"] })) };
  const tl = timelineOf(sentences);
  const visualReview = { reviewer: "claude", judgments: { thumbStopping: true, visualImpact: true, understandableWithoutAudio: true, looksLikeSlidesOrCheapDiagram: false, looksAiGeneric: false } };
  const q = quality.scoreQuality({ script: { sentences }, timeline: tl, visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, visualReview });
  assert.equal(q.gate, "pass", `${JSON.stringify(q.scores)} ${q.blocking.join(" / ")}`);
  assert.ok(q.scores.visualStrength >= 85, `visualStrength 高評価 ${q.scores.visualStrength}`);
  assert.ok(q.overallQuality >= 85);
});

/** A・C 用：文字・字幕・尺・テンポは良い台本（12文・各約3.5秒・問いで始まり事実で終わる）。 */
const goodPacing = () => [
  { kind: "hook", factIds: ["a"], cards: [{ text: "なぜ車内で破裂したのか？", image: "01.png" }] },
  ...Array.from({ length: 11 }, (_, i) => ({ kind: "fact", factIds: [`f${i}`], cards: [{ text: `事実${i}の前半を言います`, image: `${String(i + 2).padStart(2, "0")}.png` }, { text: "後半を短く言います" }] })),
];
const review0 = { visual: { thumbStopping: false, visualSurprise: false, understandableWithoutAudio: true, diagramsLookCheap: true } };

test("A：文字が少なく・字幕も尺も良く・画面もよく変わるが、模式図とカードだけ → visualStrength が低く、90点台にならない", { skip }, () => {
  const sentences = goodPacing();
  const visuals = { images: Array.from({ length: 12 }, (_, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category: i % 3 === 0 ? "text-card" : "diagram", layout: i % 3 === 0 ? "big-number" : "diagram", onScreenText: ["短い見出し"] })) };
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, review: review0 });
  assert.ok(q.scores.onScreenTextLoad >= 90 && q.scores.visualPacing >= 90 && q.scores.subtitleReadability >= 90, JSON.stringify(q.scores));
  assert.ok(q.scores.visualStrength <= 35, `実写なし：上限35（${q.scores.visualStrength}）`);
  assert.ok(q.overallQuality < 90, `90点台にしない（${q.overallQuality}）`);
  assert.equal(q.gate, "fail", "visualStrength は重要項目");
  assert.ok(q.metrics.visualStrength.findings.some((f) => f.includes("実写がない")));
});

test("C：画面は頻繁に変わるが、同じカードのデザインが続くだけ → visualVariety も visualStrength も高得点にしない", { skip }, () => {
  const sentences = goodPacing();
  const visuals = { images: Array.from({ length: 12 }, (_, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category: "text-card", layout: "panel-text", onScreenText: ["短い見出し"] })) };
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 } });
  assert.ok(q.scores.visualPacing >= 90, "切り替えの回数は十分");
  assert.ok(q.scores.visualVariety < 50, `回数だけで visualVariety を高くしない（${q.scores.visualVariety}）`);
  assert.ok(q.metrics.visualVariety.findings.some((f) => f.includes("同じデザインの画面")));
  assert.ok(q.scores.visualStrength <= 35);
  assert.ok(q.overallQuality < 70 && q.gate === "fail");
});

test("実物の写真はあるが、図・模式図が画面の半分以上で、目視でも強くない（tank-20261119 の形）→ visualStrength は上限55以下、overall は 50+visualStrength/2 まで", { skip }, () => {
  const sentences = goodPacing();
  const cats = ["photo", "photo", "diagram", "photo", "map-overview", "text-card", "diagram", "icon", "diagram", "diagram", "diagram", "photo"];
  const visuals = { images: cats.map((category, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category, layout: category === "photo" ? "photo-full" : category === "diagram" ? "diagram" : category === "map-overview" ? "map" : "big-number", onScreenText: ["短い見出し"] })) };
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, review: review0 });
  assert.ok(q.scores.visualStrength <= 55, String(q.scores.visualStrength));
  assert.ok(q.overallQuality <= 50 + Math.round(q.scores.visualStrength / 2));
  assert.ok(q.overallQuality < q.weightedQuality, "他の項目が良くても映像の弱さで抑える");
  assert.ok(q.metrics.visualStrength.findings.some((f) => f.includes("この出来事そのものの映像")));
});

test("画面の文字の決まり：onScreenText の登録が必須・長文（12字超）・要素3つ以上・計20字超は validate で止める", { skip }, () => {
  assert.ok(quality.checkOnScreenTextRules({ images: [{ file: "a.png" }] }).some((x) => x.includes("onScreenText")));
  assert.ok(quality.checkOnScreenTextRules({ images: [{ file: "a.png", onScreenText: ["容疑を強盗殺人に切り替え捜査書類を東京地検へ"] }] }).some((x) => x.includes("長文")));
  assert.ok(quality.checkOnScreenTextRules({ images: [{ file: "a.png", onScreenText: ["逮捕", "警視庁", "39歳"] }] }).some((x) => x.includes("1画面1メッセージ")));
  assert.deepEqual(quality.checkOnScreenTextRules({ images: [{ file: "a.png", onScreenText: ["39歳の男を逮捕"] }, { file: "b.png", onScreenText: [] }] }), []);
});

test("自動修正は最大3回。3回目も fail なら人の確認（human-review）", { skip }, () => {
  const f = path.join(tmp, "quality-check.json");
  const fail = { gate: "fail", overallQuality: 30, scores: {}, blocking: [], metrics: {}, reviewNotes: [] };
  assert.equal(quality.appendAttempt(f, fail).latest.escalation, "auto-fix");
  assert.equal(quality.appendAttempt(f, fail).latest.escalation, "auto-fix");
  const third = quality.appendAttempt(f, fail);
  assert.equal(third.latest.attempt, 3);
  assert.equal(third.latest.escalation, "human-review");
});

const framesLib = await import("../lib/production/frames.mjs");
/** フレームの測定値（実写らしさ・動き）から frames の要約を作る。 */
const framesOf = (spec) => framesLib.summarizeFrames(spec.map(([t, photoLike, motion, similarToPrev = 0.2]) => ({ t, photoLike, edge: photoLike ? 0.3 : 0.1, colors: photoLike ? 250 : 90, flat: photoLike ? 0.35 : 0.9, contrast: 0.4, motion, similarToPrev })));

test("フレームの抜き出し：0・1・2・3・5・8 秒、以降 2.5 秒ごと、最後のフレーム。図・カード（平らな塗り）は実写と見なさない。切り替えは動きと数えない", () => {
  assert.deepEqual(framesLib.sampleTimes(20), [0, 1, 2, 3, 5, 8, 10.5, 13, 15.5, 18, 19.95]);
  const w = 8, h = 8;
  const flat = Buffer.alloc(w * h * 3, 40);
  assert.equal(framesLib.analyzeFrame(flat, w, h).photoLike, false, "一色の画面（カード）");
  const fr = framesOf([[0, true, 0.02], [1, false, 0.0], [2, false, 0.0, 0.9], [3, false, 0.0, 0.9], [5, false, null, 0.9]]);
  assert.equal(fr.realFootageRatio, 0.2);
  assert.equal(fr.motionEvidence.movingFrames, 0, "ゆっくりズーム（0.02）は動く映像ではない");
  assert.equal(fr.repeatedVisualPatterns[0]?.frames, 4, "似た平らな画面の連続");
});

test("A・D：人の --review も Claude の目視もなくても、フレームの測定で visualStrength と QUALITY_GATE が確定する", { skip }, () => {
  const sentences = goodPacing();
  const visuals = { images: Array.from({ length: 12 }, (_, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category: "photo", layout: i % 2 ? "full" : "zoom", onScreenText: ["短い見出し"] })) };
  const frames = framesOf(Array.from({ length: 16 }, (_, k) => [k * 2.5, true, k % 3 === 0 ? 0.12 : 0.02]));
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, frames });
  assert.equal(q.metrics.visualStrength.evidence.judgmentSource, "frame-metrics");
  assert.ok(typeof q.scores.visualStrength === "number" && q.scores.visualStrength > 0);
  assert.ok(["pass", "fail"].includes(q.gate), "人の入力なしで判定が出る");
  assert.ok(!q.metrics.visualStrength.findings.some((f) => f.includes("目視の点を付けない")));
});

test("B：画面の切り替えは多くても、フレームが図・カード（平ら）ばかりなら高得点にしない（宣言が写真でも、測定を優先）", { skip }, () => {
  const sentences = goodPacing();
  const visuals = { images: Array.from({ length: 12 }, (_, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category: "photo", layout: "full", onScreenText: ["短い見出し"] })) };
  const frames = framesOf(Array.from({ length: 16 }, (_, k) => [k * 2.5, false, 0.0, 0.9]));
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, frames });
  assert.ok(q.scores.visualPacing >= 90);
  assert.ok(q.scores.visualStrength <= 35, `測定で実写なし（${q.scores.visualStrength}）`);
  assert.ok(q.overallQuality < 70 && q.gate === "fail");
});

test("C：実物・実写・動く映像が多い動画は、人の入力なしでも visualStrength が高い", { skip }, () => {
  const sentences = goodPacing();
  const kinds = ["footage", "photo", "map-overview", "photo", "footage", "diagram", "photo", "footage", "photo", "photo", "footage", "photo"];
  const visuals = { images: kinds.map((category, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category, realness: category === "footage" && i % 2 === 0 ? "event" : undefined, layout: category === "map-overview" ? "map" : category === "diagram" ? "photo-overlay" : "full", onScreenText: ["短い見出し"] })) };
  const frames = framesOf(Array.from({ length: 16 }, (_, k) => [k * 2.5, k !== 3, k % 2 === 0 ? 0.15 : 0.03]));
  const q = quality.scoreQuality({ script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, frames });
  assert.ok(q.scores.visualStrength >= 75, String(q.scores.visualStrength));
  assert.equal(q.gate, "pass", q.blocking.join(" / "));
});

test("E：人の --review は採点に使わず、機械（Claude の目視・測定）との一致／ズレを残す", { skip }, () => {
  const sentences = goodPacing();
  const visuals = { images: Array.from({ length: 12 }, (_, i) => ({ file: `${String(i + 1).padStart(2, "0")}.png`, category: i < 4 ? "photo" : "diagram", layout: i < 4 ? "full" : "diagram", onScreenText: ["短い見出し"] })) };
  const frames = framesOf(Array.from({ length: 16 }, (_, k) => [k * 2.5, k < 5, 0.02, k < 5 ? 0.2 : 0.9]));
  const visualReview = { judgments: { thumbStopping: false, visualImpact: false, understandableWithoutAudio: true, looksLikeSlidesOrCheapDiagram: true, looksAiGeneric: false } };
  const base = { script: { sentences }, timeline: timelineOf(sentences), visuals, audio: { lufs: -14.2, truePeak: -1.5, longSilences: 0 }, frames, visualReview };
  const q = quality.scoreQuality(base);
  const withHuman = quality.scoreQuality({ ...base, review: { visualVerdict: "strong" } });
  assert.equal(withHuman.scores.visualStrength, q.scores.visualStrength, "人の評価は点数を変えない");
  const cmp = quality.compareHumanReview(q, { humanFeedback: "前よりかなり良い。映像が弱い。", visualVerdict: "weak", visual: { thumbStopping: false, diagramsLookCheap: true } }, visualReview);
  assert.equal(cmp.machineVerdict, "weak");
  assert.equal(cmp.verdictAgrees, true);
  assert.equal(cmp.judgmentAgreement, "2/2");
  assert.equal(quality.compareHumanReview(q, { visualVerdict: "strong" }, visualReview).verdictAgrees, false, "ズレも残す");
  assert.equal(quality.compareHumanReview(q, null, visualReview), null, "人の評価がなければ比較しない");
});
