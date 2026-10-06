# Lesson 01 導入動画 素材台帳

本採用素材は `public/lessons/lesson-01/` 以下（Remotionでは `staticFile("lessons/lesson-01/…")` で参照）。元データは `raw/` に残す（Git管理外）。素材を差し替えるときは raw を更新 → ここへコピー → この台帳を更新する。

## 会員サイトのスクリーンショット（`screens/member-site/`）

共通：web-project（ローカル起動）をStandardテストアカウントで撮影（2026-09-30）。1920×1080表示・deviceScaleFactor 2 → 3840×2160 PNG。個人情報（名前・メールアドレス・利用期限・頭文字アイコン）は撮影時にDOM表示上だけ隠し、撮影前チェック済み。サイドバーのOS選択はWindows、スクロールバー非表示。保存後の画像加工なし。

| ファイル | 種類 | 見せるもの | 使う章・シーン（lesson.json） |
|---|---|---|---|
| `courses.png` | スクショ | レッスン一覧（講座名・10レッスン・STEP構成） | 03 この講座の進め方／s11-lessons（全10レッスン） |
| `lesson01.png` | スクショ | Lesson 01の本文（「このレッスンのゴール」から。導入動画枠は写っていない） | 03 この講座の進め方／s12-practice（教材を読む）。05 まとめ／s26-end（ここからLesson 01へ）にも使える |
| `os-switch.png` | スクショ | Lesson 02のMac / Windows切替（「表示中：Windows」）とWindows用の本文 | 03 この講座の進め方／s13-platform |
| `prompt-copy.png` | スクショ | Lesson 01の指示文ブロック（カフェ紹介ページの例）と「コピー」ボタン | 03 この講座の進め方／s14-copy。02 Claude Codeの概要／s07-examples（日本語で頼める）の補足にも使える |
| `glossary.png` | スクショ | 用語集（カテゴリー・ターミナル／PowerShell等の用語カード） | 03 この講座の進め方／s15-glossary。05 まとめ／s25-help（教材・用語集・サポーター） |
| `claude-supporter-page.png` | スクショ | 会員サイトのClaude Codeサポーター案内ページ（ダウンロードボタン・利用開始までの流れ） | 04 Claude Codeサポーター／s19-supporter。05 まとめ／s25-help |

## Claude Codeサポーターの画面録画（`recordings/`）

| ファイル | 種類 | 見せるもの | 使う章・シーン（lesson.json） |
|---|---|---|---|
| `claude-supporter-demo.mp4` | 画面録画 | ChatGPT上のClaude Codeサポーター：プラグイン画面→「commitとpushの違いを教えてください」と質問→回答が表示される様子 | 04 Claude Codeサポーター／s20-questions（質問例。l055と同じ質問）・s21-steps（1ステップずつ案内） |

- 仕様：35.8秒、1448×866（16:9ではない）、H.264 30fps。音声トラックあり（実質無音、-91 dB）→ **動画内では必ずミュートして使う**（ナレーションのみ）
- 1448×866のため、Remotionでは共通の画面枠に収めて表示する（引き伸ばさない）
- 抜き出したフレーム（0.5秒・10秒・20秒・30秒・35秒付近）では、ChatGPTのアカウント名・チャット履歴は写っていない。全編の目視確認は未実施

## 採用しないもの

- `raw/screens/dashboard-test.png`：撮影テスト用（ダッシュボード）。今の台本にダッシュボードを見せるシーンはない

## 動画での使い方（2026-09-30実装）

`lesson.json`の`visual.src`／`visual.recording`に上の実ファイル名を指定済み。ズーム範囲・録画の再生区間は`src/lessons/registry.ts`の`shots`。

| シーン | 素材 | 見せ方 |
|---|---|---|
| s11-lessons | courses.png | 全体→講座タイトルとSTEP1・2へゆっくりズーム。左にテーマのチップ |
| s12-practice | lesson01.png | 全体→本文へズーム。左に4ステップ（教材を読む→指示→確認→修正） |
| s13-platform | os-switch.png | 全体→「表示中：Windows」の切替部分へズーム |
| s14-copy | prompt-copy.png | 全体→指示文ブロックとコピーボタンへズーム |
| s15-glossary | glossary.png | 全体→カテゴリーと用語カードへズーム。左に用語チップ |
| s19-supporter | claude-supporter-page.png | 全体→ダウンロードボタンのある上部へズーム |
| s20-questions | claude-supporter-demo.mp4 | 0.5〜2.9秒（サポーターを開く）→l055の読み上げから8.8〜12.4秒（commit/pushの質問を入力）。待ち時間（14〜18秒）は使わない |
| s21-steps | claude-supporter-demo.mp4 | 18.8〜23.6秒（回答が出始める）を回答冒頭（定義部分）だけ切り出して表示。「①ファイルを修正→②commit→③push」の行は切り出し範囲外 |
