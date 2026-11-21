# AIツールの実演の通常動画（tool-demo、横 1920×1080・8〜12分）

Claude Code が AIツールを**実際に操作した画面の録画**を主役にした通常動画（2026-11-22 作成。セット03 なぎちょAI）。
claude-course の外部プロジェクトで作り、claude-course の画面収録の場面（layout `recording`：録画の再生・ズーム・ハイライト・早送り・変更前後）をそのまま使う。**claude-course のアプリ（src/）は変えていない**。
縦の Shorts（45〜60秒）は `../short-movie/templates/tool-demo-short`（同じ録画・同じ品質ゲート）。根拠：content-ops の `learning/nagicho-ai/reference/analysis-20261122.md`。

- content-ops の制作依頼 `tool-demo-long`（`scripts/production.mjs`）。品質ゲート demo-long-v1（共通remotionの `core/capture/demoQuality.mjs`。Shorts と同じ採点で、尺・速さの目安だけ通常動画用）
- 講座（Lesson）の作り方・回帰fixture（free-trial・sales-intro）は変えない

## 守ること（品質ゲートが止める）
- **実行していない操作を実演したように見せない**：画面に出せるのは、録画の記録（log.json）にある成功した操作の、その操作の時間の映像だけ（`production.mjs beats` が操作の ID から区間を決める。秒数を手で書かない）
- 操作を説明する文は `kind: "demo"` と `captureSteps`。その文の間にその操作が画面に出ていること
- 早送り・スローは画面の上の帯に「早送り ×N」と必ず出る（自動）。帯の左に「実際の操作画面・M/D 収録」
- テスト用のダミー画面（`tool.kind: "dummy"`）は帯に「テスト用ダミー画面」が出て、品質ゲートは必ず fail（公開しない）
- 個人情報・API キーは録画の時点でぼかす。ログイン・有料の操作が要る場面では録画が止まる（勝手に進めない）。利用規約を確認していないツールは録画しない（共通remotionの `core/capture`、`npm run video:capture`）

## 作り方（claude-course で実行）
1. `node scripts/cc.mjs new --project=<id>` → `node scripts/production.mjs import --campaign=<c> --key=main --project=<id>`
2. 録画のシナリオ `<id>/input/captures/<captureId>.scenario.json`（形は `../../remotion/src/core/capture/scenario.mjs` の先頭）→ 共通remotionで
   `npm run video:capture -- --type=claude-course --project=<id> --scenario=<captureId>`
   - ログインが要るツール：ユーザーが `npm run video:capture -- --login --profile=<name> --url=<ログインの URL>` で自分でログインし、シナリオに `"profile": "<name>"`
3. `<id>/input/lesson.json`（`lessons/shared/lesson.example.json` の形）
   - `voice`: `{ "speaker": 11, "speedScale": 1.15 }`（玄野武宏。`speedScale` は lesson ごとに上書きできる。なければ course.json の 1.04）
   - 章（chapters）・場面（scenes）・文（lines）。録画を見せる場面は `"layout": "recording"`
   - 文ごとに `kind`（hook・demo・fact・transition・closing）。demo は `captureSteps: [{ capture, step }]`、fact は `factIds`
4. `<id>/input/demo-beats.json`：場面ごとの画面
   ```json
   { "s02-ask": [
       { "capture": "chat", "steps": ["ask"] },
       { "at": "l004", "capture": "chat", "steps": ["send"], "zoom": "auto" },
       { "at": "l005", "offset": 0.5, "capture": "chat", "steps": ["answer"], "label": "回答" }
   ] }
   ```
   `at`（文の ID）＋`offset`（秒）で切り替える。`zoom`：auto（操作した場所へ）・wide・full。`highlight: false` で枠なし。録画以外の beat（`kind: "text"` など）はそのまま使える
5. `node scripts/production.mjs validate --project=<id>`（台本・demo-beats の事前確認 → content-ops の validate-script）
6. `node scripts/cc.mjs narration --project=<id>` → `node scripts/production.mjs beats --project=<id>`（narration の時刻から presentation.json の beats を作る。台本を直したら narration → beats をやり直す）→ `node scripts/cc.mjs render / encode --project=<id>`
7. `node scripts/production.mjs quality-check --project=<id>`（demo-long-v1）→ `node scripts/production.mjs result --project=<id> --render-status=rendered`（操作の記録 `captures` も content-ops に返る）

## 目安（demo-long-v1）
尺 8〜12分（上限15分）・語り 5.5〜7.5 字/秒・最初の録画の画面は10秒以内・画面の変化は平均12秒以内（同じ画面は25秒まで）・録画の画面が全体の6割以上・音量 -18〜-14 LUFS
