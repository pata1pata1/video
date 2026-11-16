# 映画予告編（縦型・アクション／壮大）テンプレート

縦型 1080x1920 の映画予告風ショート。AI生成画像などの画像を、ナレーション（VOICEVOX）に合わせて切り替え、最後に無音のタイトルカードを出す（2026-11-03 作成）。

## 見た目
- 上下に黒帯（150px）、ティール＆オレンジ風の色味、周辺減光、薄いフィルムグレイン
- カット＝画像1枚。切り替わりの瞬間に白フラッシュと強い揺れ → 収まる。カットの中はゆっくりズーム（1.04〜1.2倍、in／outを交互。`motion` で指定可）
- 字幕は明朝体（Noto Serif JP）で下寄り（中心 Y=1450）。字間が広い状態から少しずつ詰まる
- 最後はタイトルカード：タイトルが大きい状態から叩きつけるように縮んで揺れ、光が横に走る → 日本語タイトル → 公開日

## 画像の作り方
- 1080x1920（9:16）で作る。上下 150px は黒帯で隠れ、さらにズームで最大 1.2倍になるので、**顔や大事なものは画面の中央付近に**置く
- 字幕は下の方（Y=1350〜1550 あたり）に出るので、そこは暗め・シンプルにしておくと読みやすい
- 画像に文字を入れない（字幕・タイトルはこのテンプレートが描く）
- AI生成画像を使う場合、出典台帳（`asset-sources.json`）に生成AIの名前・プロンプトを記録する

## 作り方（コマンドは short-movie で実行。共通remotionを使う）
1. `node scripts/sm.mjs new --project=<id> --template=movie-trailer`
2. 画像を `<id>/assets/images/` に置く
3. `<id>/input/script.json` を書く
   - `sentences[].cards[]`：字幕1枚＝1フレーズ。画像を替える札に `"image"`。2行にしたいときは `"caption"` に `\n`（「、」「。」は自動で消える）
   - `motion`：画像ごとに `{"zoom": "in"|"out", "shake": 数字}`（揺れの強さ。既定18）
   - `title`：`main`（タイトル）・`sub`（日本語タイトル）・`release`（公開日など）・`image`（タイトル背景に薄く出す画像、任意）・`seconds`（既定4）
   - `voice`：低く遅めの声が予告編らしい（例は青山龍星・速度0.95）。`sentenceGap` は0.7秒前後で間をたっぷり
   - `captionColor`：字幕の光彩とタイトルの金色
4. VOICEVOX を起動 → `node scripts/sm.mjs narration --project=<id> --dry-run` → `--dry-run` なしで生成
5. 確認：`node scripts/sm.mjs render --project=<id> --still=<png> --frame=N [--frame=M …]`
6. 書き出し：`node scripts/sm.mjs render --project=<id>` → `node scripts/sm.mjs encode --project=<id>`（`<id>/output/<id>.mp4`）
   - 書き出しは声のみ（short-movie 共通。BGM はアップロード時にプラットフォーム側で付ける）。タイトルカードの間は無音
7. 公開・再生確認の後の整理は `../../CLAUDE.md`「完成後のファイル管理」

## ファイル
```
src/Trailer.tsx      カット（画像・ズーム・揺れ・フラッシュ・色味）、字幕、タイトルカード、黒帯
src/Root.tsx         Composition "Trailer"（1080x1920・30fps。長さ＝ナレーション＋タイトルの秒数）
cards.mjs            字幕の時刻の決め方（news-short-top と同じ規則をそのまま使う）
template.json        連番・書き出し・音量（news-short-top と同じ。-14 LUFS・声のみ）
script.example.json  台本の雛形
```
