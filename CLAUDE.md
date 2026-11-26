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
- 手順（2026-11-20 改定、ユーザー指示）：**公開と再生の確認が済んだら、人の追加指示を待たずに既存の `video:cleanup` で自動削除する**。条件は全部そろうこと：①アップロード成功と公開記録（content-ops の campaign に video ID・URL・公開日時、`co production snapshot` 済み、`video:mark-published` 済み）②公開先で再生できる（YouTube なら public・処理完了・ログインなしで見られる）③`video:cleanup --dry-run` で削除対象の一覧・残るもの・`DELETABLE: YES`（共通ファイル・他案件・fixture・リンクなし）を確認 → ④その fingerprint で `--confirm-delete=<id> --expect-fingerprint=` → ⑤結果を報告・記録（`.cleanup-log.jsonl` と campaign）。1つでも満たさない・想定外のファイルがあるときは消さずに報告する。`video:cleanup` を使えない手作業の4段階（移行前のタイプ・short-movie の `productions/`）は、従来どおりユーザー確認の後に削除する **【2026-11-22 改定（ユーザー指示）】完成MP4は当面保持する。自動で行うのは content-ops の `production post-publish`（ops/run-cycle.sh）からの remotion `video:prune`（中間ファイルだけ。`workspaces/<ws>/cleanup-policy.json` が有効な workspace だけ）。完成MP4ごと消す `video:cleanup` は自動では使わず、ユーザーの指示があるときだけ（この行の「人の追加指示を待たずに video:cleanup で自動削除」は停止）**
- **【2026-11-26 改定（ユーザー指示。上の行の2つの方針より優先）】作業が終わったら、その動画の関連物は確認せずに削除する。** 削除するのは、次のどちらかが起きた時点：①ユーザーが完成動画をフォルダから受け取った（完成MP4がフォルダから無くなった、または「受け取った」と言われた）②完成動画をアップロードした（公開の URL をもらった）。このときユーザーに確認せず、その動画固有の制作物（元動画・中間生成物・完成MP4を含む案件フォルダ）を削除し、`.cleanup-log.jsonl` に記録してから報告する
  - 消す前に：受け取り済みかアップロード済みかを確かめる（どちらでもなく、完成MP4が唯一のコピーとして残っているなら消さずに報告）。学習するタイプは学習データに記録する（talk-subtitle は `style observe`）。公開したものは `video:mark-published` で記録する
  - 方法：公開済みは `video:cleanup --dry-run` → `--confirm-delete=<id> --expect-fingerprint=<fingerprint>`（確認の質問はしない）。未公開（素材として受け取っただけ）や `video:cleanup` を使えないものは手で削除し、`method: manual` で記録する
  - 消さないもの：回帰fixture・共通コード・テンプレート・学習データ・共通素材・ほかの案件。想定外のファイルがあれば消さずに報告する
- 残すもの：共通エンジン・各タイプの共通コード・テンプレート・pattern・STYLE.md・CLAUDE.md・共通素材・共通設定・共通辞書・学習ロジックと学習データ・次回以降も使う設計とルール
- 対象一覧の詳細：`../remotion/docs/video-migration-plan.md`の「cleanupの対象」
- 回帰fixture（恒久、2026-11-06）：`character-news/youtube-test-05`・`movie-trivia/mt-engine-test`・`short-movie/sm-engine-test`・`talk-subtitle/projects/talking-test-01`・claude-courseの軽量基準（free-trial・sales-intro）。共通エンジンの回帰確認に使うのでcleanupしない（`video:cleanup`は拒否）。mt・smは公開しない。作り直せる大きなMP4・連番・intermediate・キャッシュは理由なく残さない（`../remotion/docs/video-migration-plan.md`の「回帰fixture」）

## Git

- commit・pushはユーザーの明示的な許可があるときだけ
