# AIツールの実演ショート（tool-demo-short）

AIツールを Claude Code が**実際に操作した画面の録画**を主役にした縦型 Shorts（1080×1920・45〜60秒、2026-11-22 作成。セット03 なぎちょAI の実演動画）。
根拠は content-ops の `learning/nagicho-ai/reference/analysis-20261122.md`（参考チャンネルの上位はどれも実物の画面が主役）。
横の通常動画（8〜12分）は `../../../claude-course` の外部プロジェクト（同じ録画と同じ品質ゲート。claude-course の `DEMO.md`）。

- content-ops の制作依頼 `tool-demo-short`。品質ゲートは `production.mjs quality-check`（demo-short-v1。共通remotionの `core/capture/demoQuality.mjs`）
- news-short-top・x-clip-narration とは別の制作パターン（混ぜない）。字幕の時刻の決め方だけ news-short-top の `cards.mjs` をそのまま使う

## 守ること（品質ゲートが止める）
- **実行していない操作を実演したように見せない**：画面に出せるのは、録画の記録（log.json）にある成功した操作の、その操作の時間の映像だけ（`shots.mjs`）。操作を説明する文（`kind: "demo"`）は `captureSteps` に録画の操作を書き、その文の間にその操作が画面に出ていること
- 早送り・スローは画面に「早送り ×N」と必ず出る（自動）。画面の左上に「実際の操作画面・M/D 収録」
- テスト用のダミー画面（`tool.kind: "dummy"`）は赤い「テスト用ダミー画面」が出て、品質ゲートは必ず fail（公開しない）
- 個人情報・API キーは録画の時点でぼかす（共通remotionの `core/capture`）。ぼかしていないものが記録にあれば fail
- ログイン・有料の操作が要る場面では録画が止まる（勝手に進めない）。ログインはユーザーが `npm run video:capture -- --login --profile=<name> --url=<…>` で開いたブラウザで自分で行う
- 利用規約：シナリオの `tool.termsUrl`・`termsCheckedAt`・`automationAllowed: true`（規約が自動操作・録画・公開を禁じていないと確認した）がないと録画しない

## 作り方（short-movie で実行）
1. `node scripts/sm.mjs new --project=<id> --template=tool-demo-short` → `node scripts/production.mjs import --campaign=<c> --key=main --project=<id>`
2. 録画のシナリオ `<id>/input/captures/<captureId>.scenario.json` を書く（形は `../../../../remotion/src/core/capture/scenario.mjs` の先頭）
3. 録画：共通remotionで `npm run video:capture -- --type=short-movie --project=<id> --scenario=<captureId>`
   → `<id>/assets/captures/<captureId>/video.mp4`・`log.json`・`steps/*.png`、記録の控え `<id>/input/captures/<captureId>.log.json`（Git 管理）
   - 止まったら（ログイン・有料・失敗）その録画は使わない。理由を報告し、別の操作・別のツールにする
4. `<id>/input/script.json`（`script.example.json`）
   - `title`：上に最後まで出す題名（`|` で改行。2行まで）
   - `sentences[].cards[]`：`text`（読み上げ＝字幕。2行は `caption` に `|`）と、画面：
     - `shot: { capture, steps: [stepId…], zoom?: "auto"|"wide"|"full", highlight?: false }`：その操作の時間の映像。自動で操作した場所へズームし、黄色の枠で囲む。映像が字幕より長ければ早送り（最大 ×8。超えたら最後の部分＝結果）、短ければ最後の画面で止める
     - `textCard: { rows: [...] }`：画面の代わりの大きな文字（締めなど。多用しない）
     - 次のカードは前の `shot`／`textCard` を引き継ぐ。`badge`（例「STEP 1」）
   - 文の `kind`：`hook`・`demo`（操作の説明。`captureSteps` 必須）・`fact`（公式の情報。`factIds`）・`closing`
5. `node scripts/production.mjs validate --project=<id>` → `node scripts/sm.mjs narration / render / encode --project=<id>`
6. `node scripts/production.mjs frames --project=<id>`（目視用）→ `node scripts/production.mjs quality-check --project=<id>`（demo-short-v1）→ `result`

## 見た目
- 上：題名（2行・最後の行が強調色）／中央：操作画面のパネル（1000×1080）／下：字幕（太字・縁取り）／最下部：`credit`
- 声は玄野武宏（speaker 11）・速さ 1.3 前後（6.0〜7.5 字/秒）。BGM は script の `bgm`（任意）
