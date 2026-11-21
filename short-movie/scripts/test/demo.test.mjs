// AIツールの実演ショート（tool-demo-short、2026-11-22）のテスト（node --test scripts/test/demo.test.mjs）。
// 録画のシナリオの安全ルール・画面の区間（早送り・止め）・台本の事前確認・品質ゲート demo-short-v1。
// ブラウザ・VOICEVOX・レンダリングは使わない（録画の記録 log.json は手で作った値）。共通remotionの core/capture を読む。
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SM = path.resolve(here, "..", "..");
const REMOTION = path.resolve(process.env.REMOTION_ROOT ?? path.join(SM, "..", "..", "remotion"));
const core = (/** @type {string} */ f) => import(pathToFileURL(path.join(REMOTION, "src", "core", "capture", f)).href);
const { scenarioIssues } = await core("scenario.mjs");
const { sensitiveKind, originAllowed } = await core("safety.mjs");
const { segmentsOf, MAX_RATE } = await import(pathToFileURL(path.join(SM, "templates", "tool-demo-short", "shots.mjs")).href);
const { DEMO_SHORT_RULES, precheckDemoScript, scoreDemoShort } = await import("../lib/production/demo.mjs");

const step = (id, start, end, extra = {}) => ({ id, action: "click", label: id, selector: "#x", start, end, ok: true, url: "https://tool.example/", rect: { x: 800, y: 500, w: 200, h: 60 }, error: null, ...extra });
const log = (over = {}) => ({
  schemaVersion: 1,
  captureId: "chat",
  tool: { name: "Tool", kind: "web", url: "https://tool.example/", termsUrl: "https://tool.example/terms", termsCheckedAt: "2026-11-22", automationAllowed: true },
  executedAt: "2026-11-22T03:00:00.000Z",
  status: "complete",
  stop: null,
  video: { file: "video.mp4", width: 1920, height: 1080, fps: 30, durationSec: 20 },
  steps: [step("open", 0, 1, { action: "goto", rect: null }), step("ask", 1, 4), step("send", 4, 5), step("answer", 5, 15), step("hold", 15, 19, { action: "pause", rect: null })],
  privacy: { findings: [{ kind: "email", masked: true, at: 0 }] },
  safety: { loginDetected: false, paidRefused: false, blockedNavigations: [] },
  ...over,
});

test("録画のシナリオ：利用規約の確認がない・個人情報や API キーを入力する・有料の操作は録画しない。ダミーはローカルだけ", () => {
  const base = { schemaVersion: 1, id: "chat", allowedOrigins: ["https://tool.example"], steps: [{ id: "open", action: "goto", url: "https://tool.example/", label: "開く" }] };
  assert.deepEqual(scenarioIssues({ ...base, tool: log().tool }), []);
  const noTerms = scenarioIssues({ ...base, tool: { name: "T", kind: "web", url: "https://tool.example/" } });
  assert.ok(noTerms.some((x) => /termsUrl/.test(x)) && noTerms.some((x) => /automationAllowed/.test(x)), noTerms.join("\n"));
  const typed = scenarioIssues({ ...base, tool: log().tool, steps: [...base.steps, { id: "t", action: "type", selector: "input", text: "my key is sk-test-DUMMY-NOT-A-REAL-KEY", label: "入力" }] });
  assert.ok(typed.some((x) => /秘密情報/.test(x)));
  assert.ok(scenarioIssues({ ...base, tool: log().tool, steps: [...base.steps, { id: "e", action: "type", selector: "input", text: "test.user@example.com", label: "入力" }] }).some((x) => /email/.test(x)));
  assert.ok(scenarioIssues({ ...base, tool: log().tool, steps: [...base.steps, { id: "u", action: "click", selector: "#up", label: "有料プランにアップグレード" }] }).some((x) => /有料/.test(x)));
  assert.ok(scenarioIssues({ ...base, tool: { name: "D", kind: "dummy", url: "https://example.com/" } }).some((x) => /dummy/.test(x)), "ダミーはローカルの画面だけ");
  assert.equal(sensitiveKind("連絡先 090-1234-5678"), "phone");
  assert.equal(sensitiveKind("ghp_DUMMYNOTAREALTOKEN000"), "github-token");
  assert.equal(sensitiveKind("今日の予定を3つ書き出す"), null);
  assert.equal(originAllowed("https://evil.example/x", ["https://tool.example"], false), false);
  assert.equal(originAllowed("file:///tmp/a.html", ["file://"], false), false, "file: はダミーのときだけ");
});

test("画面の区間：その操作の時間だけを再生（長ければ早送り・最大 ×8 で結果の側、短ければ最後の画面で止める）。記録にない操作は使えない", () => {
  const caps = { chat: log() };
  const timeline = { duration: 9, cards: [
    { text: "a", start: 0, end: 2, shot: { capture: "chat", steps: ["answer"] } },
    { text: "b", start: 2, end: 6, shot: { capture: "chat", steps: ["send"] } },
    { text: "c", start: 6, end: 6.5, shot: { capture: "chat", steps: ["answer", "hold"] } },
    { text: "d", start: 6.5, end: 9, textCard: { rows: ["保存"] } },
  ] };
  const [a, b, c, d] = segmentsOf(timeline, caps);
  assert.ok(Math.abs(a.rate - (15.3 - 4.7) / 2) < 1e-6, `答えの区間 10.6 秒を 2 秒で：×${a.rate}`);
  assert.equal(b.rate, 1, "短い操作は等速で再生して最後の画面で止める");
  assert.equal(c.rate, MAX_RATE, "×8 を超えるときは ×8 で結果の側（最後）を見せる");
  assert.ok(Math.abs(c.to - 19.3) < 1e-6 && Math.abs(c.from - (19.3 - 0.5 * MAX_RATE)) < 1e-6);
  assert.equal(d.src, undefined);
  assert.throws(() => segmentsOf({ duration: 1, cards: [{ text: "x", start: 0, end: 1, shot: { capture: "chat", steps: ["delete"] } }] }, caps), /記録がない/);
  const failed = log({ steps: [step("ask", 1, 4, { ok: false, error: "要素がない" })] });
  assert.throws(() => segmentsOf({ duration: 1, cards: [{ text: "x", start: 0, end: 1, shot: { capture: "chat", steps: ["ask"] } }] }, { chat: failed }), /失敗/);
});

const script = (over = {}) => ({
  template: "tool-demo-short",
  title: "AIで|仕事を早く",
  sentences: [
    { kind: "hook", factIds: [], cards: [{ text: "AIに聞いたら3秒で答え", shot: { capture: "chat", steps: ["answer"] } }] },
    { kind: "demo", captureSteps: [{ capture: "chat", step: "ask" }], cards: [{ text: "まず質問を入力します", shot: { capture: "chat", steps: ["ask"] } }] },
    { kind: "demo", captureSteps: [{ capture: "chat", step: "send" }], cards: [{ text: "送信を押します", shot: { capture: "chat", steps: ["send"] } }] },
    { kind: "closing", factIds: [], cards: [{ text: "保存して試そう", textCard: { rows: ["保存"] } }] },
  ],
  ...over,
});
/** 50 秒の timeline（文ごとのカード）。 */
const timeline = (s) => {
  const per = 50 / s.sentences.length;
  return { duration: 50, cards: s.sentences.flatMap((x, i) => x.cards.map((c) => ({ sentence: i, text: c.text, start: i * per, end: (i + 1) * per, ...(c.shot ? { shot: c.shot } : {}), ...(c.textCard ? { textCard: c.textCard } : {}) }))) };
};

test("台本の事前確認：操作の説明に録画の操作がない・失敗した操作・ダミーの録画・止まった録画は止める", () => {
  assert.deepEqual(precheckDemoScript(script(), null, { chat: log() }), []);
  const bad = script();
  bad.sentences[1].captureSteps = [{ capture: "chat", step: "delete" }];
  bad.sentences[2].captureSteps = [];
  const issues = precheckDemoScript(bad, null, { chat: log() }).map((x) => x.problem).join("\n");
  assert.match(issues, /操作「delete」がない/);
  assert.match(issues, /captureSteps がない/);
  assert.match(precheckDemoScript(script(), null, { chat: log({ tool: { ...log().tool, kind: "dummy" } }) }).map((x) => x.problem).join("\n"), /ダミー画面/);
  assert.match(precheckDemoScript(script(), null, { chat: log({ status: "stopped", stop: { reason: "login", message: "ログインが必要" } }) }).map((x) => x.problem).join("\n"), /途中で止まった/);
});

test("品質ゲート demo-short-v1：本物の録画なら採点で決まる。ダミー・言った操作が画面にない・ぼかしていない個人情報・止まった録画は点数に関係なく fail", async () => {
  // 1文が長い台本で語りの速さ・尺は採点の対象（ここでは画面の根拠と blocking を見る）
  const s = script();
  s.sentences.forEach((x) => (x.cards[0].text = `${x.cards[0].text}。`.padEnd(70, "あ")));
  const audio = { lufs: -14.2, truePeak: -1.5 };
  const ok = await scoreDemoShort({ script: s, timeline: timeline(s), captures: { chat: log() }, audio });
  assert.deepEqual(ok.blocking, [], JSON.stringify(ok.metrics, null, 1));
  assert.equal(ok.rulesVersion, DEMO_SHORT_RULES.version);
  assert.equal(ok.scores.screenEvidence, 100);
  assert.equal(ok.gate, ok.overallQuality >= 70 && ok.scores.hookQuality >= 50 && ok.scores.visualPacing >= 50 && Object.values(ok.scores).every((v) => v >= 40) ? "pass" : "fail");

  const dummy = await scoreDemoShort({ script: s, timeline: timeline(s), captures: { chat: log({ tool: { ...log().tool, kind: "dummy" } }) }, audio });
  assert.equal(dummy.gate, "fail");
  assert.ok(dummy.blocking.includes("dummy-capture"));

  // 「送信を押します」の間の画面が別の操作（ask）→ 実行した操作でも、言った操作が画面に出ていない
  const wrong = script();
  wrong.sentences[2].cards[0].shot = { capture: "chat", steps: ["ask"] };
  const w = await scoreDemoShort({ script: wrong, timeline: timeline(wrong), captures: { chat: log() }, audio });
  assert.ok(w.blocking.includes("narration-without-screen"), JSON.stringify(w.metrics.honesty));

  const leak = await scoreDemoShort({ script: s, timeline: timeline(s), captures: { chat: log({ privacy: { findings: [{ kind: "api-key", masked: false, at: 3 }] } }) }, audio });
  assert.ok(leak.blocking.includes("privacy"));

  const stopped = await scoreDemoShort({ script: s, timeline: timeline(s), captures: { chat: log({ status: "stopped", stop: { reason: "paid", message: "有料の操作" } }) }, audio });
  assert.ok(stopped.blocking.includes("capture-stopped"));
});
