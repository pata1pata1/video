# talk-subtitle

横長の人物トーク動画の、カット・字幕・書き出し・編集スタイル学習を安全に行う専用ツール。設計は **`docs/design.md`**（必ず先に読む）。

**このツールは横長動画専用**。縦型・正方形の元動画は `npm run analyze`（`phase1`）・`npm run reference -- analyze` がエラーで止める。縦型ショートは別のプロジェクトで扱う。

## 最重要ルール

- **制作中は元動画を変更・削除しない**（`projects/<id>/input/` の動画は読み取りのみ。移動・上書き・属性変更もしない）。削除してよいのは、公開後のcleanup（下記）でユーザーが承認したときだけ
- **いきなり自動でカットしない**。候補を出す → ユーザーが確認 → `input/decisions.json`（承認済み）→ 編集、の順
- 承認ファイル（`input/decisions.json`・`input/glossary.json`）は **CLI 経由で書く**（`npm run decide`・`npm run glossary`）。JSON を直接書き換えない
- ユーザーの明示的な指示が無い限り、候補を承認しない（「提案どおりでいい」と言われたら `--cut-suggested`）
- `projects/` は Git 管理外（元動画・音声・固有名詞を含むため）
- 最初から作り込まない。実動画で通して、良かった仕様を後から標準パターンとして固定する

## 環境（Windows、2026-10-09）

- remotion の共通基盤（`../../remotion/src/core/media`・`core/speech`）を `src/engine.ts` から import している。コピーしない。Remotion の描画（字幕PNG）も `../../remotion/node_modules` を Node API で使う（自前でインストールしない）

## 共通remotionとの関係（2026-10-30決定、恒久方針）

- `../../remotion` は全動画プロジェクト共通の動画制作エンジン（`../../remotion/docs/video-platform-architecture.md` の13章）。ffmpeg/ffprobe・音量・STT・Remotionの描画・project管理（lifecycle・cleanup）は core を使い、ここで新しく独自実装しない。remotion への入口は `src/engine.ts`（と `src/render.ts`）だけ
- 移行計画は `../../remotion/docs/video-migration-plan.md` の **Phase 5**（render の Node API・2パスの音量・faster-whisper を core 側へ、published・cleanup を core の lifecycle へ）。**それまでは今のまま使う**
- **このツール固有として残す（安易に共通化しない）**：文字起こし後のカット候補・承認（`decisions.json`）・固有名詞辞書・quotes・字幕案と承認・焼き込みの判断・編集スタイルの学習（`style-data/`・reference）
- **type名**：正式名は **`talk-subtitle`**。既存の `project.json` にある `"type": "human-video-editor"` は旧名称（互換alias）。いきなり書き換えない。Phase 5 でフォルダ名・プロジェクト名・type名を `talk-subtitle` にそろえる
- このツールは**横長専用**。縦型ショート（`../short-movie`）とは混ぜない
- 移行の基準データ（`talking-test-01` の字幕静止画など）は `../../remotion/docs/migration/phase0-baselines.md`。`review/subtitle-design/phase0-baseline/` はその元データ

## 公開後のcleanup（全動画プロジェクト共通、2026-10-30）

- video配下を完成動画の保存庫にしない。アップロードと再生確認が終わったら、その動画固有の制作物（`projects/<id>/` の元動画・音声・中間生成物・確認用動画・完成MP4・その案件の承認ファイルや固有名詞辞書など）を毎回削除する
- 手順：①削除対象の一覧 → ②削除後に残るもの → ③ユーザー確認 → ④承認後に削除（自動で即削除しない）
- 残すもの：コード・`docs/`・`python/`・`remotion/`・共通辞書（`_shared/glossary.json`）・字幕プリセット（`_shared/subtitle-presets`）・学習データ（`style-data/`）・CLAUDE.md。学習に使う案件は、`npm run style -- observe` や reference の結果を `style-data/` に記録してから消す
- 共通の対象一覧は `../../remotion/docs/video-migration-plan.md` の「cleanupの対象」。`talking-test-01` は Phase 5 の移行確認の入力にもなるので、cleanup する前に Phase 5 まで残すかを決める
- この PC は **Smart App Control（アプリ制御）が有効**で、署名のない exe はブロックされる（`0xC0E90002`／"An Application Control policy has blocked this file"）
  - ffprobe：remotion 同梱版はブロックされる → winget の `Gyan.FFmpeg`（ユーザー領域）を入れ、ユーザー環境変数 **`FFPROBE_PATH`** で指定済み（新しく開いたターミナルから有効）
  - whisper.cpp と PyAV の DLL もブロックされる → **Windows の文字起こしは faster-whisper**（`.venv`、`python/fw_transcribe.py`、PyAV は読み込まない。docs/design.md の11章）。**Smart App Control の設定は変更しない・提案しない**
- 状態確認：`npm run doctor`

## コマンド（`--project=<動画ID>`）

| コマンド | 内容 |
|---|---|
| `npm run new -- --id=<id> [--kind=reference]` | 案件を作る（上書きしない）。reference は別のソフトで編集した横長の動画の学習用（`input/reference/` の `source/` に元動画1本・`final/` に完成動画1本と任意の SRT・`assets/` に素材。前の形の直下 source.*・final.* も可） |
| `npm run phase1 -- --project=<id>` | 解析 → 文字起こし → 固有名詞 → カット候補 → review.html を順に実行（済んだ文字起こしは省略） |
| `npm run analyze` / `transcribe` / `terms` / `candidates` / `review` | 各工程を1つずつ |
| `npm run status -- --project=<id>` | 工程・未承認の件数・次にやること |
| `npm run decide -- --project=<id> …` | 承認（下記） |
| `npm run glossary -- add|update|remove|list|prompt …` | 固有名詞辞書 |
| `npm run transcribe -- --project=<id> [--backend=auto|whisper-cpp|faster-whisper] [--dry-run]` | 文字起こし（auto：Windows→faster-whisper、Mac→whisper.cpp） |
| `npm run cut -- --project=<id> [--dry-run] [--final]` | Phase 2：承認済みカットを適用（既定は軽量プレビュー intermediate/cut-preview.mp4、`--final` で intermediate/cut.mp4）＋ timemap.json。**未決定があれば止まる。`--final` はユーザーがプレビューを確認してから** |
| `npm run quotes -- add / list / decide / align --project=<id>` | 読み上げた投稿の本文（`input/quotes.json`）。投稿の表記が字幕の正解。違いは要確認として一覧（docs/design.md の13章） |
| `npm run subtitles -- draft / show / edit / import / approve --project=<id>` | Phase 3：字幕案（intermediate/subtitles.draft.json）と確認画面 review/subtitles.html。修正は input/subtitles.json。**焼き込みはユーザーの承認後**（docs/design.md の14章） |
| `npm run subtitle-stills -- --project=<id> [--cues=…] [--variant=<name>] [--out=<folder>]` | 字幕デザインの静止画・比較（review/subtitle-design/。docs/design.md の14.1） |
| `npm run subtitle-clip -- --project=<id> [--from=秒 --to=秒]` | 承認済み字幕を焼き込んだ 10〜15 秒の確認動画（review/subtitle-clip-*.mp4。14.2）。全編の書き出しではない |
| `npm run render -- --project=<id> [--force]` | 最終書き出し output/final.mp4（字幕の焼き込み・-14 LUFS・検証。14.3）。**字幕の承認と確認動画のチェックの後、ユーザーの指示で** |
| `npm run style -- observe / show --project=<id>` | 編集スタイルの学習 S1：案件の判断を `style-data/observations/<id>.json` に記録（観察だけ。何も適用しない。**横長の動画だけ**。docs/design.md の15章） |
| `npm run reference -- register / analyze / transcribe / reconstruct / all / show --project=<id>` | 学習 S2：reference 案件の元動画と完成動画（**どちらも横長**）を比べて、残した区間・削った区間を復元（intermediate/reconstruction.json）。すべて読み取りのみ。`register` は sha256 と素材の一覧の記録だけ（解析しない） |
| `npm run setup-faster-whisper` | faster-whisper の環境（`.venv`）とモデルを用意（何度でも可） |
| `npm run typecheck` / `npm run lint` | 型チェック（remotion の TypeScript）／client JS・Python の構文チェック |

## 固有名詞を自然な文で渡されたとき

例：「今回の人物名は北岡大樹。読みは、きたおか だいき。専門用語は Claude Code と Remotion。」

1. 登録案を表で見せる（正式表記・種別・読み・別表記・誤認識されやすい形の案・案件／共通）
2. **読みが書かれていない漢字の名前は、推測で確定しない**。読みを質問するか、`--reading-unconfirmed` 付きで登録する
3. 確認が取れたら1語ずつ登録する：
   `npm run glossary -- add --project=<id> --surface=北岡大樹 --kind=person --reading="きたおか だいき" --source=user-instruction`
   英語の語：`--surface="Claude Code" --kind=term --reading="くろーど こーど"`（読みはかなで）
4. 「毎回使う」と言われた語は `--shared`
5. 文字起こしの後に辞書を変えたら `npm run terms`（prompt に反映するなら `npm run transcribe -- --force`。カット候補・承認は作り直しになる）

## チャットでの承認

| ユーザーの言い方 | コマンド |
|---|---|
| 「c3 と c7 は残す、それ以外はカット」 | `npm run decide -- --project=<id> --keep=c3,c7 --cut-rest` |
| 「提案どおりカット、確認のみの候補は保留」 | `--cut-suggested` |
| 「c4 は 12.3 秒から 13.1 秒だけ切る」 | `--range=c4:12.30-13.10` |
| 「t1 は採用、t2 はそのまま」 | `--accept-term=t1 --reject-term=t2` |
| 「t3 は Claude Code に直す」 | `--term-text=t3:Claude Code` |
| HTML で書き出した | `--import=<ダウンロードしたJSON>` |
| 一覧を見たい | `--show` |

迷う指示は実行前に、どの ID をどうするかを確認する。まず `--dry-run` で変更内容を見せてもよい。

## 未実装

Phase 4（テロップ・高度な補正・複数人）
