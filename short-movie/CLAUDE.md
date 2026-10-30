# short-movie：縦型ショート動画の制作

縦型ショート動画の制作用フォルダ。まずユーザーが作った完成済みショート動画を見て、作風を言語化・蓄積する（横型動画の制作は `../talk-subtitle`）。

## 動画の2種類
- `ai-voice`：台本をAI音声で読み上げる方式
- `talk`：人間がトークする方式

## 置き場所
- `samples/<type>/<id>/final.mp4` … ユーザーの完成動画（git管理外）
- `samples/<type>/<id>/materials/` … 制作素材（台本・音声・画像・BGM・編集プロジェクト等）
- `samples/<type>/<id>/README.md` … 補足メモ（`samples/<type>/_template` をコピー）
- `analysis/<id>/notes.md` … 1本ごとの分析（構成・尺・テロップ・カット割り・音声・フック等）
- `analysis/<id>/frames/` … 抽出フレーム（git管理外）
- `STYLE.md` … 全動画から抽出した作風ガイド（タイプ別）。分析のたびに更新する
- `templates/news-short-top/` … ニュースショート動画（上部字幕固定型）の共通テンプレート（Remotion・VOICEVOX ナレーション・字幕同期・書き出し）
- `productions/<id>/` … こちらで制作する動画1本ごとのフォルダ（テンプレートをコピーして作る。画像・音声・連番・完成MP4は Git 管理外）
  - ※最初の1本 `gmo-20261028/`（N001）は short-movie の直下にある（ルールを決める前に作ったため）

## 分析手順
1. `ffprobe` で尺・解像度・fps を取得
2. `ffmpeg` で一定間隔（＋シーン切替）のフレームを抽出して目視確認
3. 音声は `../talk-subtitle` の faster-whisper (.venv) で文字起こし
4. `notes.md` を書き、ユーザーに確認 → `STYLE.md` に反映

## 動画の制作（ニュース系ショート）
- ニュース系（事件・炎上・時事ニュース・話題解説）のショートは、**特別な理由がない限り「ニュースショート動画（上部字幕固定型）」を使う**。型は `STYLE.md` の同名の章、作り方は `templates/news-short-top/README.md`
- 画像は制作時点から上部の字幕帯（上から60〜300px）を空けて作る。字幕は全カット X=540・Y=175 に固定し、画像ごとに動かさない
- 画像の文字・数字・日付は公式発表などの一次情報と照らし、事実と違えば報告する。攻撃者・犯人側の主張と確認済みの事実を混同しない
- テンプレート自体は案件の都合で直さない。型を変えるときは `STYLE.md` とテンプレートを一緒に直す
- Remotion は今 `../movie-trivia/node_modules` をジャンクションで共用している（movie-trivia のファイルは変更しない）。**この依存は解消する（2026-10-30決定）**：最終形は `short-movie → engine.mjs → 共通remotion（../../remotion のNode API／実行環境）`。自前でRemotionをインストールしない
  - **制作中の `productions/robot-ai-20261030` には触らず、今の方式（ジャンクション）のまま完成させる**
  - 共通remotion側の準備ができるまでは、新しい production も今の方式で作る

## 共通remotionとの関係（2026-10-30決定、恒久方針）
- `../../remotion` を共通の動画制作エンジンとして使う（`../../remotion/docs/video-platform-architecture.md` の13章）。VOICEVOX・WAV・FFmpeg/ffprobe・音量・字幕・project管理・cleanup・書き出し基盤は remotion の core を使い、このフォルダで新しく独自実装しない。移行計画は `../../remotion/docs/video-migration-plan.md` の **Phase 3**
- type名は **`short-movie`**（縦型ショート専用。1080×1920）。横長の movie-trivia・talk-subtitle・claude-course・character-news と混ぜない（adapter・設定・テンプレートを共有しない。共有するのは remotion の core の関数だけ）
- このフォルダに残すもの：縦型レイアウト（`templates/` の `Short.tsx`・`layout.ts`）、cards とモーラ長からのテロップ時刻、`STYLE.md`、作風の学習（`samples/`・`analysis/`）
- 移行用テスト動画 `productions/sm-engine-test`（2026-10-30、**公開しない**。テンプレートを今の手順でコピーし、テストパターン画像2枚で作った8秒の動画）。**移行が終わるまで削除しない**（cleanupの対象外）。基準データは `../../remotion/docs/migration/phase0-baselines.md`

## 完成後のファイル管理（アップロード後の整理）
**制作中**：画像・音声・字幕・連番画像などのレンダリングデータは全部残し、いつでも修正・再書き出しできる状態にしておく。

**全動画プロジェクト共通の方針（2026-10-30）**：video配下を完成動画の保存庫にしない。アップロードと再生確認が終わったら、その動画固有の制作物（その動画専用の画像・映像素材・音声・BGM/SE・中間生成物・キャッシュ・連番・一時ファイル・完成MP4・出典メモなど、`productions/<id>/` の中身すべて）を毎回削除する。自動で即削除せず、下の手順で承認を得てから消す。共通の対象一覧は `../../remotion/docs/video-migration-plan.md` の「cleanupの対象」

**アップロード後**（この順で進める）：
1. ユーザーからアップロード完了の報告を受ける
2. アップロード先で正常に再生できることを確認する（ユーザーに確認してもらう）
3. その動画だけで使っているファイルを一覧にする
4. 削除するもの・残すものを分けてユーザーに見せる
5. ユーザーが削除を承認してから消す

**必ず残すもの**：`CLAUDE.md`、`STYLE.md`、`templates/`（ニュースショートの共通テンプレート・再利用できる Remotion コンポーネント・共通の音声／字幕生成プログラム・共通設定）、`samples/`、`analysis/`

**注意**
- アップロード前に素材を消さない。ユーザーの承認なしに消さない
- 完成MP4（`out/<id>.mp4`）も削除対象（2026-10-30の共通方針）。一覧に含めて、承認を得てから消す
- 移行用テスト動画 `productions/sm-engine-test` は移行が終わるまで対象外
- 他の動画やテンプレートから参照されているファイルは消さない
- 他のプロジェクト（`../movie-trivia` など。`node_modules` はジャンクションなので、消すときはリンクだけを外し、中身を消さない）に影響を与えない
- 消した後も、テンプレートから新しい動画を作れる状態を保つ
- ※学習用サンプル（`samples/`）の元動画 `.MOV` を学習後に消す取り決めは別（ユーザーの完成動画 `final.mp4` は残す）
