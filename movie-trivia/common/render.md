# movie-trivia 共通の書き出し基盤

パターンに関係なく、全動画この手順で書き出す。パターンからは `patterns/<pattern>/render.json` の値（JPEG画質・x264設定・音量目標）だけを参照する。
2026-10-30（Phase 2）から、描画もMP4化も共通remotion（`../../remotion`）で行う：`scripts/mt.mjs` → `scripts/lib/engine.mjs` → `src/video-types/movie-trivia/`（core/render の Node API、core/media）。

## なぜ連番JPEG＋ffmpeg か

このPCではスマートアプリコントロールが Remotion 同梱の ffmpeg（compositor）を止めるため、Remotion（共通remotionの Node API・Chrome）は無音の連番画像だけを書き出し、MP4化は共通remotionの core/media（ffmpeg-static）で行う（書き出し方式 `image-sequence`）。
動画素材も `<Html5Video>` では再生しない（ブラウザのシークがコマ単位で正確でなく、映像が揺れた。2026-10-04に計測）。`mt.mjs prepare-media` で30fpsの連番JPEGにして表示する。
Windows では core/media が出力の確認に ffprobe を使うので、環境変数 `FFPROBE_PATH`（winget の ffprobe）が必要（このPCは設定済み）。

## 手順（`<id>` は動画フォルダの名前）

1. 素材の連番化：`node scripts/mt.mjs prepare-media --project=<id>`（差し替えたら `--force`）→ `<id>/intermediate/media-frames/`
2. 連番画像の書き出し（7分の動画で数十分）：`node scripts/mt.mjs render --project=<id>`（作り直しは `--force`）→ `<id>/intermediate/frames/`
   - `<id>/intermediate/render-public/` を作り直して（素材・音声へのハードリンク）、`src/` を共通remotionの実行環境でまとめる。`src/current.ts` が別の動画を指していると止まる（`mt.mjs switch --project=<id>`）
   - JPEG画質は render.json の `frames.jpegQuality`。音は出さない（`withAudio: false`）
3. MP4化：`node scripts/mt.mjs encode --project=<id>` → `<id>/output/<id>.mp4`（作り直しは `--force`）
   映像は x264、音声はナレーション（と台本・パターンに指定があればBGM）を2パスの loudnorm で render.json の目標値に合わせ、AACのピークを測って上限を超えたら下げてやり直す
   - 2と3をまとめて：共通remotionで `npm run video:render -- --type=movie-trivia --project=<id> [--force]`
   - BGMだけ聞くとき：`node scripts/mt.mjs encode --project=<id> --audio-only=<m4a>`
4. サムネイル：`node scripts/mt.mjs thumbnails --project=<id>`（台本の thumbnails の A・B・C。`--variants=A`、作り直しは `--force`）→ `<id>/output/thumbnail-A.png`
5. チャプター：`node scripts/mt.mjs chapters --project=<id>`
6. クレジット：`node scripts/mt.mjs credits --project=<id>`（ナレーション・BGM・素材ごとの画面の表記と説明文用の表記、要確認の点）

## 確認

- 代表コマ：`node scripts/mt.mjs render --project=<id> --still=<png> --frame=N --frame=M …`（1回まとめて何枚でも書き出す。`--frame` が複数なら `<png>` の名前に `-N` が付く）
- 書き出し後に、MP4から25秒おきにコマを抜き出して全体を見る

## 一部だけ直す（タイミングが変わらない修正）

字幕の改行などで音声のタイミングが変わらない場合は、全体を書き出し直さない：
`node scripts/mt.mjs render --project=<id> --frames=開始-終了` → 一時フォルダに書き出し、`intermediate/frames/` の同じ桁数の名前に上書きする（桁数は自動でそろえる）。その後 `encode --force`。

## 中間ファイル

`<id>/intermediate/` は消してよい。`<id>/output/` は完成品（Git管理外。アップロードと再生確認の後、cleanupで動画フォルダごと削除する）。

## 旧方式（Phase 2 の移行確認が終わり、削除が承認されるまで残す。新しい動画では使わない）

`npx.cmd remotion render src/index.ts Trivia frames --sequence --muted --props=props-silent.json --image-format=jpeg --jpeg-quality=95` → `node scripts/encode-mp4.mjs --script=<id> frames out/<id>/<id>.mp4`（movie-trivia 自前の node_modules と `script/`・`public/` の置き場所を使う）。
