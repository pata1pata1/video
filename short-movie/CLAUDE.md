# short-movie：完成動画から学ぶ場所

ユーザーが作った完成済みショート動画を見て、作風を言語化・蓄積するためのフォルダ。

## 動画の2種類
- `ai-voice`：台本をAI音声で読み上げる方式
- `talk`：人間がトークする方式

## 置き場所
- `samples/<type>/<id>/final.mp4` … ユーザーの完成動画（git管理外）
- `samples/<type>/<id>/materials/` … 制作素材（台本・音声・画像・BGM・編集プロジェクト等）
- `samples/<type>/<id>/README.md` … 補足メモ（`_template` をコピー）
- `analysis/<id>/notes.md` … 1本ごとの分析（構成・尺・テロップ・カット割り・音声・フック等）
- `analysis/<id>/frames/` … 抽出フレーム（git管理外）
- `STYLE.md` … 全動画から抽出した作風ガイド（タイプ別）。分析のたびに更新する

## 分析手順
1. `ffprobe` で尺・解像度・fps を取得
2. `ffmpeg` で一定間隔（＋シーン切替）のフレームを抽出して目視確認
3. 音声は `../talk-subtitle` の faster-whisper (.venv) で文字起こし
4. `notes.md` を書き、ユーザーに確認 → `STYLE.md` に反映
