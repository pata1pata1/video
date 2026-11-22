# content-ops の制作依頼を読む（movie-trivia、news-long。2026-11-20）

content-ops（運用）が campaign に作った制作依頼（`productionType: "news-long"`・`targetProject: "movie-trivia"`・`targetTemplate: "pattern-0N"`）を、movie-trivia が読んで通常動画（1920×1080）を作る手順。
契約の正本は `../../content-ops/docs/production-handoff.md`（8章が種類の違い）。依頼は読むだけ（コピー・書き換えをしない）。依頼の読み取りの共通部分は共通remotion の `src/core/production-request/`（`scripts/lib/engine.mjs` 経由）。

```
content-ops：production decide-format（Shorts／通常／両方と pattern を比べた理由）→ production prepare --type=news-long --pattern=pattern-0N
            → （pattern-01 は台本・ベース動画、pattern-02 は実名・写真の承認を production input で）→ production check --refresh → ready
movie-trivia：node scripts/mt.mjs new --project=<id> --pattern=pattern-0N
  → node scripts/production.mjs import --campaign=<c> --key=<k> --project=<id>（ready のときだけ。<id>/input/production.json に場所と requestId だけ）
  → <id>/input/script.json（patterns/<p>/README.md の型。文ごとに kind〈hook|fact|unknown|transition|closing〉と factIds〈事実を使わない文は []〉）
  → node scripts/production.mjs validate（pattern・kind・factIds の事前確認 → content-ops の production validate-script）
  → node scripts/mt.mjs narration / pexels / prepare-media / render / encode / thumbnails（narration・render・encode の前に gate が自動で通る）
  → node scripts/production.mjs quality-check（long-v1。Claude の目視は任意で input/visual-review.json〈mp4Sha256・visualStrength・notes〉）
  → node scripts/production.mjs result --render-status=started|rendered → content-ops：production record-result・record-quality
```

## story-long（2026-11-22、セット02 つぐみの開運チャンネルの横長）

`productionType: "story-long"` も同じ手順で受ける（`scripts/production.mjs` の SUPPORTED。pattern は pattern-02 だけ）。pattern-02 をそのまま使い、台本の `voice`（`{ "speaker": 31, "speakerName": "No.7", "speedScale": 1.38 }`）と `bgm`（自作の calm-pad。`../short-movie/scripts/make-bgm.mjs --name=<名前> --seconds=<尺+20>` で作り `bgm/` に置く。Git 管理外）で落ち着いた女性の語りにする。実在の人物の実名・写真は使わない。最初の動画は `tsugumi-sleep-habits-20261122`（眠りを妨げる夜の習慣7つ、long-v2 88）。

## コマンド

| コマンド | 内容 |
|---|---|
| `node scripts/production.mjs show --campaign=<id> [--key=main] [--json]` | 依頼の中身（pattern・尺・声・事実・素材）と本制作に進めるか |
| `node scripts/production.mjs import --campaign=<id> [--key=main] --project=<id>` | ready・素材と承認がそろっているときだけ動画フォルダに紐付ける |
| `node scripts/production.mjs validate --project=<id>` | 台本の検証。fail なら VOICEVOX・書き出しに進めない |
| `node scripts/production.mjs gate --project=<id>` | 依頼が ready（またはこの動画の in-production）・期限内・検証を通過・検証の後に台本が変わっていない（mt.mjs が自動で呼ぶ。narration --dry-run・render --still は止めない） |
| `node scripts/production.mjs quality-check --project=<id> [--out=<file>]` | 公開前の品質ゲート long-v1（`scripts/lib/production/quality.mjs`）。input/quality-check.json に試行を足す（最大3回、超えたら人の確認） |
| `node scripts/production.mjs result --project=<id> --render-status=started\|rendered\|failed\|published` | content-ops へ返す結果（output/production-result.json） |

## 品質ゲート long-v1（通常動画）
- 尺：pattern の `structure.targetMinutes`／冒頭：最初の画は実際の映像・写真、pattern の openingSeconds の1.5倍まで、前置きで始めない
- 画を変える間隔：平均10秒・最長20秒（同じ画を続ける文はまとめて数える）
- 映像の強さ：実際の映像・写真の時間（60% で満点）・この出来事の素材〈Pexels 以外〉（25%）・動く映像（30%）。overall は 50＋visualStrength÷2 まで
- 画面の文字：1要素14字・1文3要素まで／ナレーション 5.5〜9.0 字/秒／音量 -18〜-14 LUFS・TP -1 以下／章2つ以上・ending・サムネイル
- 合格：overall 70・重要項目（hook・visualPacing・visualStrength・onScreenTextLoad）50・どの項目も 40 以上。基準を下げて通さない

## pattern
- pattern は固定しない。content-ops は `patterns/pattern-NN/config.json` を読んで一覧にする（新しい pattern も自動で対象）。新しい pattern が要る素材・承認は config.json の `production: { requiredInputs: [{id,label}], approvals: [{id,label,stage}] }` に書ける
- 新しい pattern は content-ops の format-decision の `newPatternNeeded`（既存では表現できない理由）→ proposals → ユーザー承認 → `patterns/pattern-NN/` と `src/pattern.ts` に1項目 → typecheck・lint・`mt-engine-test`・最終全体ゲート・既存 pattern の代表コマ

テスト：`node --test scripts/test/production.test.mjs`（一時ディレクトリ。content-ops の CLI は本物、fixture の音声・MP4 はコピーで読むだけ）
