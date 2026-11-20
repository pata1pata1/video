// content-ops の制作依頼（x-clip：X 動画＋ナレーション）を short-movie で読むテスト（node --test scripts/test/xclip.test.mjs）。2026-11-20
// content-ops の campaign・workspace・学習データは一時ディレクトリ。content-ops の CLI は本物を呼ぶ（読み書きは一時ディレクトリだけ）。
// 動画フォルダも一時ディレクトリ。品質ゲートの音量は回帰fixture sm-engine-test の MP4 のコピーで測る（fixture は変えない）。VOICEVOX・レンダリング・公開はしない。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SM = path.resolve(here, "..", "..");
const CONTENT_OPS = path.resolve(process.env.CONTENT_OPS_ROOT ?? path.join(SM, "..", "..", "content-ops"));
const FIXTURE_MP4 = path.join(SM, "sm-engine-test", "output", "sm-engine-test.mp4");
const skip = !fs.existsSync(path.join(CONTENT_OPS, "bin", "co.mts")) ? "content-ops がない" : !fs.existsSync(FIXTURE_MP4) ? "回帰fixture の MP4 がない" : false;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sm-xclip-"));
const env = {
  CONTENT_OPS_ROOT: CONTENT_OPS,
  CONTENT_OPS_CAMPAIGNS_DIR: path.join(tmp, "campaigns"),
  CONTENT_OPS_WORKSPACES_DIR: path.join(tmp, "workspaces"),
  CONTENT_OPS_LEARNING_DIR: path.join(tmp, "learning"),
  CONTENT_OPS_SECRETS_DIR: path.join(tmp, "secrets"),
  CONTENT_OPS_TOPICS_DIR: path.join(tmp, "topics"),
  CONTENT_OPS_REPORTS_DIR: path.join(tmp, "reports"),
  SHORT_MOVIE_PROJECTS_ROOT: path.join(tmp, "projects"),
};
Object.assign(process.env, env);
const { main, precheckClipScript } = await import("../production.mjs");
const { scoreClipQuality } = await import("../lib/production/clipQuality.mjs");

const co = (/** @type {string[]} */ ...args) => {
  const r = spawnSync(process.execPath, [path.join(CONTENT_OPS, "bin", "co.mts"), ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const write = (/** @type {string} */ f, /** @type {any} */ v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof v === "string" ? v : JSON.stringify(v, null, 2));
};
const iso = (/** @type {number} */ h) => new Date(Date.now() + h * 3_600_000).toISOString();
const SCRIPT = {
  id: "clip-video",
  template: "x-clip-narration",
  source: { url: "https://x.com/u/status/1", account: "@u", postedAt: "2026-11-19" },
  clip: { file: "source.mp4", start: 0, end: 30, width: 1080, height: 1920 },
  voice: { speaker: 10, name: "雨晴はう（ノーマル）", speedScale: 1.15 },
  sentences: [
    { at: 0.3, style: "title", cards: [{ text: "ラッパを鳴らす暴走族が", caption: "ラッパを鳴らす\n暴走族が" }] },
    { at: 12, cards: [{ text: "勝手に自爆する" }] },
  ],
  credit: "出典：X @u",
};

function setup(/** @type {string} */ campaign) {
  write(path.join(env.CONTENT_OPS_WORKSPACES_DIR, "news-mt", "workspace.json"), {
    schemaVersion: 1, id: "news-mt", name: "ニュースMT", status: "active", genre: "ニュース", createdAt: iso(-48), updatedAt: iso(-48),
    youtube: { channelId: null, handle: null, title: null }, x: { username: null, userId: null }, web: { sites: [] },
    profile: { audience: null, genres: [], channels: ["youtube"], contentRules: [], productionKinds: ["news-short", "news-long", "x-clip"] },
    notes: "",
  });
  assert.equal(co("campaign", "new", "--workspace=news-mt", `--id=${campaign}`, "--title=テスト").code, 0);
  write(path.join(tmp, "facts.json"), { allowedFacts: [], unknownFacts: [], creative: { angle: "暴走族のラッパ", hook: "ラッパ…", structure: [], titleCandidates: ["ラッパを鳴らす暴走族が"], visualRules: [] } });
  const prep = co("production", "prepare", `--campaign=${campaign}`, "--type=x-clip", `--facts=${path.join(tmp, "facts.json")}`);
  assert.equal(prep.code, 0, prep.out);
  assert.match(prep.out, /awaiting-input/);
}

test("x-clip：素材と利用確認がそろうまで制作しない → ready → import・validate・gate → clip-v1 の品質ゲートを content-ops に記録", { skip }, async () => {
  setup("clip-e2e");
  const dir = path.join(env.SHORT_MOVIE_PROJECTS_ROOT, "clip-video");
  write(path.join(dir, "project.json"), { version: 1, type: "short-movie", name: "clip-video", created: iso(0), status: "active", locked: false });
  write(path.join(dir, "input", "script.json"), SCRIPT);
  // 利用確認の前は ready にならず、import もできない
  assert.notEqual(co("production", "check", "--campaign=clip-e2e").code, 0);
  assert.equal(await main(["import", "--campaign=clip-e2e", "--project=clip-video"]), 1);
  assert.equal(co("production", "input", "--campaign=clip-e2e", "--id=source-video", "--status=provided", "--by=claude", "--note=https://x.com/u/status/1").code, 0);
  assert.equal(co("production", "input", "--campaign=clip-e2e", "--id=source-rights", "--status=provided", "--by=user", "--note=投稿者本人の撮影・利用の許可").code, 0);
  const ck = co("production", "check", "--campaign=clip-e2e");
  assert.equal(ck.code, 0, ck.out);
  assert.match(ck.out, /status: ready/);
  assert.equal(await main(["import", "--campaign=clip-e2e", "--project=clip-video"]), 0);
  assert.equal(await main(["prepare-script", "--project=clip-video"]), 1, "x-clip の台本は README の型で書く（news-short の下書きは作らない）");
  assert.equal(await main(["validate", "--project=clip-video"]), 0);
  assert.equal(await main(["gate", "--project=clip-video"]), 0);
  assert.equal(await main(["result", "--project=clip-video", "--render-status=started"]), 0);
  assert.equal(co("production", "record-result", "--campaign=clip-e2e", `--result=${path.join(dir, "output", "production-result.json")}`).code, 0);
  // 完成（音量は fixture の MP4 のコピー、字幕の時刻は timeline）
  write(path.join(dir, "audio", "timeline.json"), { duration: 14, cards: [{ sentence: 0, style: "title", text: "ラッパを鳴らす\n暴走族が", start: 0.3, end: 3.2 }, { sentence: 1, style: "narration", text: "勝手に自爆する", start: 12, end: 14 }] });
  fs.copyFileSync(FIXTURE_MP4, path.join(dir, "output", "clip-video.mp4"));
  assert.equal(await main(["result", "--project=clip-video", "--render-status=rendered"]), 0);
  const rr = co("production", "record-result", "--campaign=clip-e2e", `--result=${path.join(dir, "output", "production-result.json")}`);
  assert.equal(rr.code, 0, rr.out);
  await main(["quality-check", "--project=clip-video"]);
  const q = JSON.parse(fs.readFileSync(path.join(dir, "input", "quality-check.json"), "utf8"));
  assert.equal(q.attempts[0].rulesVersion, "clip-v1");
  assert.equal(q.latest.scores.rights, 100);
  assert.equal(q.latest.scores.credit, 100);
  assert.equal(q.latest.scores.titleHook, 100);
  const rq = co("production", "record-quality", "--campaign=clip-e2e", `--quality=${path.join(dir, "input", "quality-check.json")}`);
  assert.equal(rq.code, 0, rq.out);
  const request = JSON.parse(fs.readFileSync(path.join(env.CONTENT_OPS_CAMPAIGNS_DIR, "clip-e2e", "production", "video-main.json"), "utf8"));
  assert.equal(request.quality.scores.rights, 100);
  assert.equal(request.format, "x-clip-narration");
});

test("x-clip：利用を確認できない素材は blocked（制作・公開しない）", { skip }, () => {
  setup("clip-denied");
  const r = co("production", "input", "--campaign=clip-denied", "--id=source-rights", "--status=denied", "--by=claude", "--note=転載アカウントの投稿");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /status blocked/);
  assert.notEqual(co("production", "check", "--campaign=clip-denied").code, 0);
});

test("clip-v1：利用確認・出典がなければ fail。ナレーションが長すぎる（元の音を消す）と fail", () => {
  const timeline = { cards: [{ sentence: 0, text: "タイトル", start: 0.3, end: 2 }, { sentence: 1, text: "説明", start: 3, end: 6 }] };
  const ok = scoreClipQuality({ script: SCRIPT, timeline, audio: { lufs: -14, truePeak: -1.5 }, mp4Duration: 30, rightsConfirmed: true, rightsNote: "" });
  assert.equal(ok.gate, "pass", ok.blocking.join(" / "));
  const noRights = scoreClipQuality({ script: SCRIPT, timeline, audio: { lufs: -14, truePeak: -1.5 }, mp4Duration: 30, rightsConfirmed: false, rightsNote: "pending" });
  assert.equal(noRights.gate, "fail");
  const noCredit = scoreClipQuality({ script: { ...SCRIPT, credit: "" }, timeline, audio: { lufs: -14, truePeak: -1.5 }, mp4Duration: 30, rightsConfirmed: true, rightsNote: "" });
  assert.equal(noCredit.gate, "fail");
  const talky = scoreClipQuality({ script: SCRIPT, timeline: { cards: [{ sentence: 0, text: "タイトル", start: 0.3, end: 28 }] }, audio: { lufs: -14, truePeak: -1.5 }, mp4Duration: 30, rightsConfirmed: true, rightsNote: "" });
  assert.equal(talky.gate, "fail");
  assert.deepEqual(precheckClipScript({ ...SCRIPT, source: {} }).map((/** @type {any} */ x) => x.problem), ["source.url（素材の投稿 URL）がない"]);
});
