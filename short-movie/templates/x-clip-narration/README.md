# X動画＋ナレーション（@news_mt型）テンプレート

Xに投稿された動画1本を主役の映像にして、元の音を残したまま要所だけ VOICEVOX のナレーションと字幕を入れる縦型ショート（2026-11-20 作成）。ユーザーのチャンネル @news_mt の過去のショート3本から学んだ型で、型は `../../STYLE.md` の「X動画＋ナレーション（@news_mt型）」。最初の検証サンプルは rappa-20261120（2026-11-20 公開・cleanup 済み。台本は Git の履歴、記録は content-ops の campaign `xclip-rappa-20261120`）。

- `news-short-top`（画像＋ナレーション＋上部字幕）とは**別の制作パターン**。決まりを混ぜない
- content-ops の自動運用（Topic Discovery・制作依頼）にはつないでいない。人が素材を選び、手で作る

## 素材の利用確認（制作の前に必ず）
他人のX動画を「Xに公開されているから自由に転載できる」とは扱わない。1本ごとに人が次を確かめてから制作・公開する（確かめる仕組みはまだない）
- 利用してよい素材か（公開して利用してよい根拠があるか）
- 投稿者自身が撮影した動画か
- 再投稿・転載のアカウントではないか（編集済み・ナレーション入りの動画は使わない）

## 見た目と音
- 映像：`clip` の範囲をそのまま流す。`layout.fit` が `contain`（既定）なら全幅で表示し、背景に同じ映像のぼかしを敷く。`cover` は全画面（左右が切れる）。`videoCenterY` で上下位置、`zoom` で拡大
- 字幕：太ゴシック。タイトルは `layout.titleY`（既定 330）、ナレーションとセリフは `layout.captionY`（既定 640）の高さに固定
  - `style: "title"` の文：赤文字＋白縁（冒頭のタイトル。最後まで表示したまま）
  - ふつうの文：白文字＋青縁（ナレーション）
  - `lines`：動画の中のセリフ（白文字＋黒縁）。ナレーションの字幕と重なる間は出さない
- 右下に小さく `credit`（出典）
- 音：元の音＋ナレーション。ナレーションの間だけ元の音を下げる（`template.json` の `mix`。素材ごとに変えたいときは script の `mix.sourceGainDb`）。最後に -14 LUFS

## 作り方（short-movie で実行。共通remotionを使う）
1. `node scripts/sm.mjs new --project=<id> --template=x-clip-narration`
2. 上の「素材の利用確認」を済ませた動画だけを `<id>/assets/video/source.mp4` に置く（yt-dlp で取得。`ffprobe` で幅・高さ・尺を見る。素材の動画は Git 管理外）
3. 素材を見る：1秒ごとのフレーム一覧（`ffmpeg -vf "fps=1,scale=240:-2,tile=8x4"`）と文字起こし（talk-subtitle の faster-whisper）で、見どころの秒数を決める
4. `<id>/input/script.json` を書く（`script.example.json`）
   - `clip`：`file`・`start`・`end`（秒）・`width`・`height`
   - `sentences[]`：`at`（その文を始める秒数。順番どおり）と `cards`（字幕1枚＝1フレーズ。2行にするなら `caption` に `\n`）。最初の文は `style: "title"` でタイトルを読み上げる
   - 前の文が終わる前に次の `at` が来ると narration が止まる → `at` をずらすか文を短くする
   - `lines`：`start`・`end`・`text`（聞き取れるセリフだけ）
   - `source`：投稿URL・アカウント・投稿日（記録用）、`credit`：画面の出典表記
5. VOICEVOX を起動 → `node scripts/sm.mjs narration --project=<id> --dry-run`（読みの確認）→ `--dry-run` なしで生成。`audio/timeline.json` で字幕の秒数を確かめる
6. 確認：`node scripts/sm.mjs render --project=<id> --still=<png> --frame=N --frame=M …`
7. 書き出し：`node scripts/sm.mjs render --project=<id>` → `node scripts/sm.mjs encode --project=<id>`（`<id>/output/<id>.mp4`。元の音とナレーションは `intermediate/mix.wav` で混ぜる）
8. 公開・再生確認の後の整理は `../../CLAUDE.md`「完成後のファイル管理」

## ファイル
```
src/ClipShort.tsx    映像（contain／cover）・字幕（タイトル／ナレーション／セリフ）・出典
src/Root.tsx         Composition "ClipShort"（1080x1920・30fps。長さ＝clip の長さ）
cards.mjs            文を at の秒数に置き、文の中の字幕の切り替えをモーラ長で決める
template.json        "audio": "voice-over-clip"（共通remotionが元の音とナレーションを混ぜる）・mix・-14 LUFS
script.example.json  台本の雛形
```
