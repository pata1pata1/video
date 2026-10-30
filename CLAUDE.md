# video（動画制作プロジェクトの置き場所）

`Projects/video` の下には動画タイプごとのフォルダ（character-news・movie-trivia・short-movie・claude-course・talk-subtitle）がある。GitHub：`pata1pata1/video`。

## 恒久方針：共通remotionを必ず使う（2026-10-30）

- この下の動画制作プロジェクトは、今あるものも今後作るもの（新しい動画ジャンル・動画制作ツール・YouTube動画タイプ・ショート動画タイプなど、すべて）も、**`../remotion`（`C:\Users\info\Projects\remotion`）の共通動画制作エンジンを必ず使う**。「使うかどうか」は検討せず、使う前提で設計する
- VOICEVOX・WAV処理・FFmpeg／ffprobe・音量処理・字幕・Pexels等の素材取得・出典管理・project管理・cleanup・render基盤・STTは、プロジェクトごとに独自実装しない（remotionの`src/core/`を使い、足りなければそちらに追加する）
- `video/<type>/`に置くのは、そのタイプだけに必要な台本形式・デザイン・レイアウト・編集ロジック・学習ロジック・固有ルールだけ
- **新しい動画プロジェクトを作る前に、`../remotion/docs/video-platform-architecture.md`の14章「video配下に新しい動画プロジェクトを作るときのチェック項目」をすべて確認する**
- 詳細：同文書の13章。既存5プロジェクトの移行計画：`../remotion/docs/video-migration-plan.md`（移行が終わるまでは各プロジェクトの今の手順で制作するが、共通処理を新しく独自実装しない）
- 縦型ショート（`short-movie`）と横長の動画タイプは混ぜない

## cleanup（全プロジェクト共通、2026-10-30）

- video配下を完成動画の保存庫にしない。アップロードと再生確認が終わったら、その動画固有の制作物（元動画・専用の画像／映像／音声／BGM・SE・中間生成物・キャッシュ・連番・一時ファイル・完成MP4・専用の出典台帳・投稿メモ等）を毎回削除する
- 手順：①削除対象の一覧 → ②削除後に残るもの → ③ユーザー確認 → ④承認後に削除（自動で即削除しない）
- 残すもの：共通エンジン・各タイプの共通コード・テンプレート・pattern・STYLE.md・CLAUDE.md・共通素材・共通設定・共通辞書・学習ロジックと学習データ・次回以降も使う設計とルール
- 対象一覧の詳細：`../remotion/docs/video-migration-plan.md`の「cleanupの対象」
- 移行用テスト動画（`movie-trivia`の`mt-engine-test`、`short-movie/productions/sm-engine-test`）は公開しない。移行が終わるまで削除しない

## Git

- commit・pushはユーザーの明示的な許可があるときだけ
