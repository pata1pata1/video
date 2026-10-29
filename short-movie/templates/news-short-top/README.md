# ニュースショート動画（上部字幕固定型）テンプレート

ニュース系ショート（事件・炎上・時事・話題解説）の標準。AI音声ナレーション＋画像、字幕は画面上部の専用帯に固定。
見た目のルールは `../../STYLE.md`「ニュースショート動画（上部字幕固定型）」、値は `src/layout.ts`。
最初の動画：`../../gmo-20261028/`（GMO個人情報流出事件、2026-10-28）。

## 画像の作り方（画像制作の時点で守る）
1080x1920 の縦画像を、上から次の3段で作る。全画像で帯の高さ・位置・余白をそろえる。
```
┌──────────────┐ 0
│   字幕専用帯     │  60〜300px：暗め・シンプル。見出し・顔・主役・重要情報を置かない
├──────────────┤ 約330
│ ┌──────────┐ │
│ │ 画像内見出し │ │  中段：見出しは字幕帯の下から
│ │ メインビジュアル│ │  下段：写真・図・補足
│ └──────────┘ │  下端付近（YouTubeのタイトル等が重なる）には重要情報を置かない
└──────────────┘ 1920
```
- 画像パネル（字幕帯の下の枠）の内側がズームする範囲。パネルの端から 20px 以内に文字を置かない（ズーム 1.04倍で切れる）
- パネルの位置が gmo-20261028 と違うときは、`script.json` に `"panel": {"left":…, "top":…, "width":…, "height":…}` を書く

## 映像パネル型（素材が動画のとき）
画像の代わりに素材動画をパネルの中で流す（最初の動画：ai-live-20261029、AIライブ配信の現場、2026-10-29）。
`script.json` に `clips` を書くとこの形になり、字幕枠・パネルの枠・下の説明文（`footer`）はコードで描く（値は `src/layout.ts` の `VIDEO_*`）。
- 素材は H.264 に変換して `public/video/` に置く（HEVC はそのままでは再生できない。元の音は消す）：
  `ffmpeg -i 素材.mp4 -an -c:v libx264 -crf 14 -pix_fmt yuv420p -g 30 public/video/source.mp4`
- `"video": {"src": "source.mp4", "width": 素材の幅, "height": 素材の高さ}`（パネルの高さに合わせて拡大し、左右を切る）
- 札の `"image"` には `clips` の名前を書く。`clips` の1つ＝1場面：
  - `{"from": 7.2, "to": 8.9, "x": 50}` … 素材の 7.2〜8.9 秒を場面の長さに合わせて再生（スロー／早送りは自動）。`x` は左右の切り位置（%）
  - `{"still": "live-386.jpg", "zoom": [1.0, 1.7], "origin": [60, 26]}` … 止め画（`public/video/`）を `origin`（素材の横・縦 %）に向かってズーム。数字などを見せるとき
  - `zoom` を書かなければ 1.00〜1.04倍のゆっくりズーム
- 素材より台本が長いときは、スロー（0.4倍くらいまで）と同じ区間の使い回しで合わせる。ピンぼけ・カメラ移動中の区間は避ける

## 新しい動画の作り方
1. コピー：`cp -r templates/news-short-top productions/<id>`（`public/` の中身・`node_modules` はコピーしない）
2. Remotion を使えるようにする（movie-trivia の node_modules を共用。movie-trivia 側は変更しない）：
   PowerShell（short-movie で実行）：`New-Item -ItemType Junction -Path productions\<id>\node_modules -Target C:\Users\info\Projects\video\movie-trivia\node_modules`
3. 画像を `public/images/` に置く（ファイル名は自由。`01.png` など）
4. `script.example.json` を `script.json` にして台本を書く：文ごとに `cards`（テロップ1枚＝1フレーズ）、画像を替える札に `"image"`、
   読み替えは `pronunciation`、2行にしたいテロップは `"caption"` に `\n` で改行（「、」「。」は自動で消える）
5. VOICEVOX を起動 → `node scripts/build-narration.mjs --dry-run`（読みの確認）→ `node scripts/build-narration.mjs`
6. 代表コマの確認：`node_modules/.bin/remotion still src/index.ts Short <png> --frame=N`（画像ごとに最大ズームのコマと2行テロップのコマ）
7. 書き出し：`node_modules/.bin/remotion render src/index.ts Short frames --sequence --muted --image-format=jpeg --jpeg-quality=95`
   → `bash scripts/encode.sh`（`out/<id>.mp4`、声のみ・-14 LUFS）
8. 確認：全場面のコマを抜き出して字幕位置・文字切れを見る／faster-whisper で字幕と声のズレを測る／尺・音量

## ファイル
```
src/layout.ts        字幕帯・字幕中心・パネル・ズーム上限（標準値）
src/Short.tsx        画像（パネル内だけズーム・クロスフェード）／映像パネル型（clips）＋テロップ（上部固定・最大2行・ポップイン）
scripts/build-narration.mjs  VOICEVOX で文ごとに合成、テロップの開始時刻をモーラ長から計算 → public/audio/
scripts/encode.sh    連番JPEG＋ナレーション → out/<フォルダ名>.mp4
script.example.json  台本の雛形
```
このフォルダは共通テンプレート。案件のファイルを置かない・案件の都合で直さない（直すときは STYLE.md と合わせる）。
