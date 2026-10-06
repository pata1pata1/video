# movie-trivia 共通の書き出し基盤

パターンに関係なく、全動画この手順で書き出す。パターンからは `patterns/<pattern>/render.json` の値（JPEG画質・x264設定・音量目標）だけを参照する。

## なぜ連番JPEG＋ffmpeg-static か

このPCではスマートアプリコントロールが Remotion 同梱の ffmpeg を止めるため、Remotion は無音の連番画像だけを書き出し、MP4化は `scripts/encode-mp4.mjs`（ffmpeg-static）で行う。
動画素材も `<Html5Video>` では再生しない（ブラウザのシークがコマ単位で正確でなく、映像が揺れた。2026-10-04に計測）。`scripts/prepare-media.mjs` で30fpsの連番JPEGにして表示する。

## 手順

1. 素材の連番化：`node scripts/prepare-media.mjs --script=<id>`（差し替えたら `--force`）
2. 連番画像の書き出し（約40〜50分／7分の動画）：
   `npx.cmd remotion render src/index.ts Trivia frames --sequence --muted --props=props-silent.json --image-format=jpeg --jpeg-quality=95`
   （`--jpeg-quality` は render.json の `frames.jpegQuality`）
3. MP4化：`node scripts/encode-mp4.mjs --script=<id> frames out/<id>/<id>.mp4`
   映像は x264、音声はナレーション（と台本に指定があればBGM）を2パスの loudnorm で render.json の目標値に合わせ、AACのピークを測って上限を超えたら下げてやり直す
4. サムネイル：`npx.cmd remotion still src/index.ts Thumbnail-A out/<id>/thumbnail-A.png`（B・Cも）
5. チャプター：`node scripts/chapters.mjs --script=<id>`

## 確認

- 代表コマ：`npx.cmd remotion bundle src/index.ts --out-dir=<一時フォルダ>` で1回まとめてから、`npx.cmd remotion still <一時フォルダ> Trivia <png> --frame=N --scale=0.5` を繰り返すと速い（1枚ずつだと毎回30秒かかる）
- 書き出し後に、MP4から25秒おきにコマを抜き出して全体を見る

## 一部だけ直す（タイミングが変わらない修正）

字幕の改行などで音声のタイミングが変わらない場合は、全体を書き出し直さない：
`--frames=開始-終了` で別フォルダに書き出し、`frames/` に上書きコピーしてからエンコードする。
範囲によってファイル名の桁数が変わる（4桁になる）ので、`element-00000.jpeg` の5桁にそろえる。

## 中間ファイル

`frames/` は消してよい。`out/<id>/` は完成品（Git管理外）。
