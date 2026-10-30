# sm-engine-test（移行用テスト動画・公開しない）

共通remotionへの移行（`../../../../remotion/docs/video-migration-plan.md` の Phase 3）で、今の方式の出力と比べるための fixture。2026-10-30 の Phase 0 で `templates/news-short-top` を今の手順どおりコピーして作った。移行が終わるまで削除しない（cleanup の対象外）。

- Git に入れているのはコード（テンプレートのコピー）と `script.json` だけ。画像・音声・連番・MP4 は Git 管理外
- 基準データ：`../../../../remotion/docs/migration/phase0-baselines.md`（ハッシュは `docs/migration/baselines/short-movie.sha256`、重いファイルのコピーは `remotion/out/migration-baselines/phase0/short-movie/`）

## 作り直す手順（今の方式）

1. `node_modules` は作らない（2026-10-30 の Phase 2-0 でジャンクションを外し、共通remotionの実行環境に移した）
2. 画像（1080×1920 のテストパターン）：
   - `ffmpeg -f lavfi -i "testsrc2=s=1080x1920:d=1" -frames:v 1 public/images/01.png`
   - `ffmpeg -f lavfi -i "smptehdbars=s=1080x1920:d=1" -frames:v 1 public/images/02.png`
3. VOICEVOX ENGINE（0.25.2）を起動して `node scripts/build-narration.mjs`
4. short-movie で `node scripts/render.mjs --production=sm-engine-test --force`（共通remotionのNode API。Phase 0 の CLI 出力と241コマ・MP4ともバイト一致を確認済み）
5. `bash scripts/encode.sh` → `out/sm-engine-test.mp4`
