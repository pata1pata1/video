// content-ops の制作依頼（news-long）を movie-trivia で読む consumer のテスト（node --test scripts/test/production.test.mjs）。
// content-ops の campaign・workspace・学習データは一時ディレクトリ（CONTENT_OPS_*_DIR）。content-ops の CLI は本物を呼ぶ（読み書きは一時ディレクトリだけ）。
// 動画フォルダも一時ディレクトリ（MOVIE_TRIVIA_PROJECTS_ROOT）。品質ゲートは回帰fixture mt-engine-test の音声・MP4 のコピーで測る（fixture は変えない）。
// VOICEVOX・レンダリング・公開はしない。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MT = path.resolve(here, "..", "..");
const CONTENT_OPS = path.resolve(process.env.CONTENT_OPS_ROOT ?? path.join(MT, "..", "..", "content-ops"));
const FIXTURE = path.join(MT, "mt-engine-test");
const skip = !fs.existsSync(path.join(CONTENT_OPS, "bin", "co.mts")) ? "content-ops（../../content-ops）がない" : !fs.existsSync(path.join(FIXTURE, "output", "mt-engine-test.mp4")) ? "回帰fixture の MP4 がない" : false;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mt-production-"));
const env = {
  CONTENT_OPS_ROOT: CONTENT_OPS,
  CONTENT_OPS_CAMPAIGNS_DIR: path.join(tmp, "campaigns"),
  CONTENT_OPS_WORKSPACES_DIR: path.join(tmp, "workspaces"),
  CONTENT_OPS_LEARNING_DIR: path.join(tmp, "learning"),
  CONTENT_OPS_SECRETS_DIR: path.join(tmp, "secrets"),
  CONTENT_OPS_TOPICS_DIR: path.join(tmp, "topics"),
  CONTENT_OPS_REPORTS_DIR: path.join(tmp, "reports"),
  MOVIE_TRIVIA_PROJECTS_ROOT: path.join(tmp, "projects"),
};
Object.assign(process.env, env);
const { main, precheckScript } = await import("../production.mjs");

const co = (/** @type {string[]} */ ...args) => {
  const r = spawnSync(process.execPath, [path.join(CONTENT_OPS, "bin", "co.mts"), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const write = (/** @type {string} */ f, /** @type {any} */ v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v, null, 2));
};
const NOW = new Date();
const iso = (/** @type {number} */ h) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const CAMPAIGN = "long-e2e";
const PROJECT = "long-e2e-video";

function setupContentOps() {
  write(path.join(env.CONTENT_OPS_WORKSPACES_DIR, "news-mt", "workspace.json"), {
    schemaVersion: 1, id: "news-mt", name: "ニュースMT", status: "active", genre: "ニュース", createdAt: iso(-48), updatedAt: iso(-48),
    youtube: { channelId: null, handle: null, title: null }, x: { username: null, userId: null }, web: { sites: [] },
    profile: { audience: null, genres: [{ key: "unsolved-mysteries", name: "未解決事件", description: null }], channels: ["youtube"], contentRules: [], productionKinds: ["news-short", "news-long", "x-clip"] },
    notes: "",
  });
  assert.equal(co("campaign", "new", "--workspace=news-mt", `--id=${CAMPAIGN}`, "--title=テスト").code, 0);
  const fc = { checkedAt: iso(-1), checkedBy: "claude", method: "本文", sources: [{ url: "https://a.example/1", publisher: "共同通信", publishedAt: null, checked: true, findings: [] }, { url: "https://b.example/1", publisher: "NHK", publishedAt: null, checked: true, findings: [] }], consistentFacts: [], differences: [], unverified: [], investigatorSourced: [], legalStage: "未解決", motiveConfirmed: false, victimHandling: "実名を使わない", contradictions: [], verdict: "pass" };
  write(path.join(env.CONTENT_OPS_CAMPAIGNS_DIR, CAMPAIGN, "topic.json"), { schemaVersion: 1, campaignId: CAMPAIGN, topic: { id: "tp-x", category: "other", categories: [], genre: "unsolved-mysteries" }, sourceUrls: ["https://a.example/1"], safety: { level: "medium", score: 65, flags: ["事件として扱うジャンル（unsolved-mysteries）"], legalStage: null, rules: [], acknowledgedBy: null }, autoSelection: { autoSelect: { mode: "bootstrap", score: 70, scoreGap: 4 }, youtubeConfidence: "high", opportunity: { label: "strong" }, factCheck: fc } });
  write(path.join(tmp, "decision.json"), { schemaVersion: 1, decidedAt: iso(0), decidedBy: "claude", short: null, long: { pattern: "pattern-03", durationSec: 540, reason: "経緯を語る事件", structure: ["結末", "経緯"] }, reasons: ["公式資料がある"], assets: ["公開捜査ページ"], patternComparison: [{ pattern: "pattern-03", fit: "good", note: "結末から入る" }, { pattern: "pattern-02", fit: "poor", note: "人物写真が主役" }], newPatternNeeded: null, autoSelectTracks: { short: false, long: true } });
  write(path.join(tmp, "facts.json"), { allowedFacts: [{ id: "incident", statement: "事件は未解決のまま30年になった", sources: ["共同通信", "NHK"], attribution: null, required: true }], unknownFacts: ["犯人"], creative: { angle: "未解決の理由", hook: "30年前…", structure: [{ startSec: 0, endSec: 40, section: "冒頭", content: "", notes: "" }], titleCandidates: ["未解決のまま30年"], visualRules: [] } });
  write(path.join(tmp, "refresh.json"), { checkedAt: iso(0), checkedBy: "claude", sources: [{ url: "https://a.example/1", publisher: "共同通信", checked: true, findings: [] }, { url: "https://b.example/1", publisher: "NHK", checked: true, findings: [] }], changes: { newArrest: false, rearrest: false, referral: false, indictment: false, release: false, chargeChange: false, damageUpdate: false, motiveNews: false, other: [] }, contradictions: [], notes: "" });
}

function setupProject() {
  const dir = path.join(env.MOVIE_TRIVIA_PROJECTS_ROOT, PROJECT);
  write(path.join(dir, "project.json"), { version: 1, type: "movie-trivia", name: PROJECT, created: iso(0), status: "active", locked: false });
  write(path.join(dir, "input", "script.json"), {
    id: PROJECT, pattern: "pattern-03", title: "未解決のまま30年",
    scenes: [
      { id: "opening", kind: "opening", lines: [{ id: "o1", kind: "fact", factIds: ["incident"], visual: { title: true, footage: "hook1" }, text: "事件は未解決のまま30年になりました。" }, { id: "o2", kind: "hook", factIds: [], text: "なぜ分からないのか。" }] },
      { id: "e", kind: "ending", lines: [{ id: "e1", kind: "closing", factIds: [], text: "あなたはどう考えますか。" }] },
    ],
  });
  return dir;
}

test("news-long の制作依頼：content-ops で依頼 → ready → movie-trivia で import・validate・gate → 結果と品質ゲートを content-ops に記録", { skip }, async () => {
  setupContentOps();
  // 形式の判断なしでは依頼を作らない
  assert.match(co("production", "prepare", `--campaign=${CAMPAIGN}`, "--type=news-long", "--pattern=pattern-03", `--facts=${path.join(tmp, "facts.json")}`).out, /形式の判断がありません/);
  assert.equal(co("production", "decide-format", `--campaign=${CAMPAIGN}`, `--decision=${path.join(tmp, "decision.json")}`).code, 0);
  const prep = co("production", "prepare", `--campaign=${CAMPAIGN}`, "--type=news-long", "--pattern=pattern-03", `--facts=${path.join(tmp, "facts.json")}`);
  assert.equal(prep.code, 0, prep.out);
  // ready の前は import できない
  const dir = setupProject();
  assert.equal(await main(["import", `--campaign=${CAMPAIGN}`, "--key=main", `--project=${PROJECT}`]), 1);
  assert.equal(co("production", "check", `--campaign=${CAMPAIGN}`, `--refresh=${path.join(tmp, "refresh.json")}`).code, 0);
  assert.equal(await main(["show", `--campaign=${CAMPAIGN}`]), 0);
  assert.equal(await main(["import", `--campaign=${CAMPAIGN}`, "--key=main", `--project=${PROJECT}`]), 0);
  assert.ok(fs.existsSync(path.join(dir, "input", "production.json")));
  // gate：検証の前は止める
  assert.equal(await main(["gate", `--project=${PROJECT}`]), 1);
  assert.equal(await main(["validate", `--project=${PROJECT}`]), 0);
  assert.equal(await main(["gate", `--project=${PROJECT}`]), 0);
  // 検証の後に台本を変えたら止める
  const s = JSON.parse(fs.readFileSync(path.join(dir, "input", "script.json"), "utf8"));
  fs.writeFileSync(path.join(dir, "input", "script.json"), JSON.stringify({ ...s, title: "変えた" }));
  assert.equal(await main(["gate", `--project=${PROJECT}`]), 1);
  assert.equal(await main(["validate", `--project=${PROJECT}`]), 0);
  // 結果：started → content-ops で in-production
  assert.equal(await main(["result", `--project=${PROJECT}`, "--render-status=started"]), 0);
  const resFile = path.join(dir, "output", "production-result.json");
  assert.equal(co("production", "record-result", `--campaign=${CAMPAIGN}`, `--result=${resFile}`).code, 0);
  // 完成：fixture の音声・MP4 のコピーで rendered → 品質ゲート（25秒の動画は pattern-03 の尺に足りないので fail を記録する）
  fs.copyFileSync(path.join(FIXTURE, "audio", "narration.json"), path.join(dir, "audio", "narration.json").replace(/narration.json$/, (x) => (fs.mkdirSync(path.join(dir, "audio"), { recursive: true }), x)));
  fs.mkdirSync(path.join(dir, "output"), { recursive: true });
  fs.copyFileSync(path.join(FIXTURE, "output", "mt-engine-test.mp4"), path.join(dir, "output", `${PROJECT}.mp4`));
  assert.equal(await main(["result", `--project=${PROJECT}`, "--render-status=rendered"]), 0);
  const rec = co("production", "record-result", `--campaign=${CAMPAIGN}`, `--result=${resFile}`);
  assert.equal(rec.code, 0, rec.out);
  assert.match(rec.out, /status rendered/);
  assert.equal(await main(["quality-check", `--project=${PROJECT}`]), 1);
  const q = JSON.parse(fs.readFileSync(path.join(dir, "input", "quality-check.json"), "utf8"));
  assert.equal(q.latest.gate, "fail");
  assert.ok(q.attempts[0].blocking.some((/** @type {string} */ b) => b.startsWith("duration")));
  const rq = co("production", "record-quality", `--campaign=${CAMPAIGN}`, `--quality=${path.join(dir, "input", "quality-check.json")}`);
  assert.equal(rq.code, 0, rq.out);
  assert.match(rq.out, /QUALITY_GATE = fail/);
  const request = JSON.parse(fs.readFileSync(path.join(env.CONTENT_OPS_CAMPAIGNS_DIR, CAMPAIGN, "production", "video-main.json"), "utf8"));
  assert.equal(request.quality.gate, "fail");
  assert.equal(request.format, "movie-trivia/pattern-03");
  const campaign = JSON.parse(fs.readFileSync(path.join(env.CONTENT_OPS_CAMPAIGNS_DIR, CAMPAIGN, "campaign.json"), "utf8"));
  assert.equal(campaign.attributes.youtubeFormat, "long");
  assert.equal(campaign.attributes.pattern, "pattern-03");
  assert.ok(fs.existsSync(path.join(env.CONTENT_OPS_LEARNING_DIR, "prepublish", `${PROJECT}.json`)), "不合格は学習データに残す（一時ディレクトリ）");
});

test("台本の事前確認：pattern が依頼どおり・文ごとに kind と factIds", () => {
  const r = { targetTemplate: "pattern-03", scriptRules: { allowedFacts: [{ id: "a" }] }, workflow: { factual: true } };
  assert.deepEqual(precheckScript({ pattern: "pattern-03", scenes: [{ id: "o", lines: [{ id: "o1", kind: "fact", factIds: ["a"], text: "x" }] }] }, r), []);
  const bad = precheckScript({ pattern: "pattern-02", scenes: [{ id: "o", lines: [{ id: "o1", kind: "fact", text: "x" }, { id: "o2", kind: "fact", factIds: ["zz"], text: "y" }] }] }, r).map((/** @type {any} */ x) => x.problem);
  assert.ok(bad.some((p) => p.includes("pattern")));
  assert.ok(bad.some((p) => p.includes("factIds がない")));
  assert.ok(bad.some((p) => p.includes("zz")));
});
