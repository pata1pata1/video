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
- `templates/news-short-top/` … ニュースショート動画（上部字幕固定型）の**アプリ**（縦型レイアウト・テロップ・`cards.mjs`〈モーラ長からのテロップ時刻〉・`template.json`〈連番・書き出し・-14 LUFS・声のみ〉）。**動画ごとにコピーしない**
- `templates/movie-trailer/` … 映画予告編（縦型・アクション／壮大）の**アプリ**（2026-11-03）。画像＋VOICEVOXナレーション＋明朝の字幕＋最後に無音のタイトルカード。字幕の時刻は news-short-top の `cards.mjs` をそのまま使う。`sm.mjs new --template=movie-trailer` で使う。作り方はテンプレートの README
- `templates/x-clip-narration/` … X動画＋ナレーション（ユーザーのチャンネル @news_mt の過去のショート3本から学んだ型、2026-11-20）の**アプリ**。Xの動画1本を主役にし、元の音を残して要所だけナレーション・字幕を入れる。共通remotionの `"audio": "voice-over-clip"` と文ごとの `at`（秒）を使う。作り方はテンプレートの README、型は `STYLE.md` の同名の章。**news-short-top とは別の制作パターン（混ぜない）**。**素材の利用確認が必要**（他人のX動画を自由に転載できるとは扱わない）。content-ops の制作依頼 `x-clip`（2026-11-20 接続。素材の利用確認〈source-rights〉がそろうまで制作しない・確認できなければ blocked）。最初の検証サンプルは `rappa-20261120`（2026-11-20 公開 https://youtu.be/LYXq4vefwuQ・cleanup 済み。記録は content-ops の campaign `xclip-rappa-20261120`、台本は Git の履歴）
- `templates/tool-demo-short/` … AIツールの実演ショート（2026-11-22、セット03 なぎちょAI）の**アプリ**。Claude Code がツールを**実際に操作した画面の録画**（共通remotionの `npm run video:capture`）を主役に、操作した場所へ自動でズーム・黄色の枠・早送りの表示。content-ops の制作依頼 `tool-demo-short`、品質ゲート demo-short-v1（`production.mjs quality-check`。共通remotionの `core/capture/demoQuality.mjs`）。**実行していない操作を実演したように見せない**（録画の記録にある成功した操作だけ）。テスト用のダミー画面は必ず fail。作り方はテンプレートの README。横の通常動画は `../claude-course/DEMO.md`
- `scripts/sm.mjs` … 制作コマンド（new・narration・render・encode・footage）。`footage` は Pexels の縦型のフリー映像・写真の検索・自動取得・選択（共通remotionの `core/assets/stockMedia.mjs`。movie-trivia の `pexels` と同じ部品で、アプリは別。2026-11-22）。APIキーは共通remotionの `remotion/.env`（Git 管理外。movie-trivia と共通で、PC ごとに1回設定すればよい。2026-11-22）。`short-movie/.env` は古い置き場所として読むだけ。使い方は `templates/news-short-top/README.md` の「フリー映像の札」。`scripts/lib/engine.mjs` を通して共通remotionを使う
- `<id>/` … こちらで制作する動画1本ごとのフォルダ（2026-11-03〜、データだけ）：`project.json`・`input/script.json`（Git 管理）、`assets/images/`・`assets/video/`・`audio/`・`intermediate/`・`output/<id>.mp4`（Git 管理外）
- `productions/<id>/` … 旧方式（テンプレートをコピーして作った動画）。今は制作中の `robot-ai-20261030` だけ（旧方式の `sm-engine-test` は2026-11-03に削除）。新しい動画では使わない
  - ※最初の1本 `gmo-20261028`（N001）は short-movie の直下に作っていた（アップロード後に削除済み）

## 分析手順
1. `ffprobe` で尺・解像度・fps を取得
2. `ffmpeg` で一定間隔（＋シーン切替）のフレームを抽出して目視確認
3. 音声は `../talk-subtitle` の faster-whisper (.venv) で文字起こし
4. `notes.md` を書き、ユーザーに確認 → `STYLE.md` に反映

## 動画の制作（ニュース系ショート）
- ニュース系（事件・炎上・時事ニュース・話題解説）のショートは、**特別な理由がない限り「ニュースショート動画（上部字幕固定型）」を使う**。型は `STYLE.md` の同名の章、作り方は `templates/news-short-top/README.md`
- **ニュースMT向けの制作パターンは2つ（混ぜない）**：`news-short-top`（画像＋ナレーション＋上部字幕。content-ops の制作依頼 `news-short` はこれだけ）と `x-clip-narration`（X動画1本＋元の音＋短いナレーション。content-ops の制作依頼 `x-clip`。素材の利用確認が済んだ依頼だけ。品質ゲートは clip-v1）。型は `STYLE.md` のそれぞれの章
- 画像は制作時点から上部の字幕帯（上から60〜300px）を空けて作る。字幕は全カット X=540・Y=175 に固定し、画像ごとに動かさない
- 画像の文字・数字・日付は公式発表などの一次情報と照らし、事実と違えば報告する。攻撃者・犯人側の主張と確認済みの事実を混同しない
- テンプレート自体は案件の都合で直さない。型を変えるときは `STYLE.md` とテンプレートを一緒に直す
- **制作は共通remotionで行う（2026-11-03、Phase 3）**：`short-movie → scripts/sm.mjs → scripts/lib/engine.mjs → 共通remotion（../../remotion の core／render／Node API）`。手順は `templates/news-short-top/README.md`。VOICEVOX・WAV・SRT・モーラ情報・ffmpeg・2パスloudnorm・AAC・連番→MP4・描画・project.json・lifecycle・cleanup は共通remotionのもの。自前でRemotionをインストールしない。**`node_modules` を作らない・`../movie-trivia/node_modules` へのジャンクションを張らない・テンプレートをコピーしない**
  - **例外：制作中の `productions/robot-ai-20261030` には触らず、旧方式（自分のコピー＋ジャンクション）のまま完成させる**（変更・移動・変換・cleanup をしない）。この案件の公開・再生確認・cleanup でジャンクションが外れる（リンクだけを外し、中身は消さない）までは、movie-trivia の `node_modules` を消せない
  - 旧方式の実装（`scripts/render.mjs`〈Phase 2-0〉、テンプレートの `scripts/build-narration.mjs`・`scripts/encode.sh`・`remotion.config.ts`・`package.json`・`public/`、`productions/sm-engine-test`）は2026-11-03にユーザーの承認を得て削除した（`../../remotion/docs/migration/phase3-short-movie.md`）。`productions/` と `.gitignore` の `productions/**`・`node_modules` の行は robot-ai-20261030 の cleanup まで残す

## content-ops の制作依頼（2026-11-19）
- content-ops（運用）が campaign に作る制作依頼（`content-ops.production-request/1`）を `scripts/production.mjs` で**読むだけ**（依頼をコピー・書き換えしない。content-ops のファイルに書かない）。手順は `PRODUCTION-HANDOFF.md`
- 依頼の status が ready で readyExpiresAt 内のときだけ本制作に進む。台本は allowedFacts だけから作り、文ごとに `kind`・`factIds`・`attribution` を付け、`production.mjs validate`（content-ops の validate-script を含む）を通す。fail ならナレーション・字幕・レンダリングをしない（依頼に紐付いた動画は sm.mjs の narration・render・encode の前に gate が自動で止める）
- 事件ニュースの画像は `input/visuals.json` に種類つきで登録し、安全な種類だけを使う（人物写真・刃物・血・現場の特定をしない）
- 結果は `<id>/output/production-result.json` を作り、content-ops 側で `production record-result` に渡す
- **最重要：視聴者に文章を読ませない**（2026-11-19、ユーザー指定）。詳細はナレーション、画面は短いキーワード・数字・見出しだけ（1画面1メッセージ・長文カード禁止）。`STYLE.md` の同名の章と失敗例 N003（nakano-20261119）
- 完成MP4の後、公開前に `production.mjs quality-check`（QUALITY_GATE）。fail は公開しない。自動修正は最大3回、超えたら人の確認

## 共通remotionとの関係（2026-10-30決定、恒久方針）
- `../../remotion` を共通の動画制作エンジンとして使う（`../../remotion/docs/video-platform-architecture.md` の13章）。VOICEVOX・WAV・FFmpeg/ffprobe・音量・字幕・project管理・cleanup・書き出し基盤は remotion の core を使い、このフォルダで新しく独自実装しない。移行計画は `../../remotion/docs/video-migration-plan.md` の **Phase 3**
- type名は **`short-movie`**（縦型ショート専用。1080×1920）。横長の movie-trivia・talk-subtitle・claude-course・character-news と混ぜない（adapter・設定・テンプレートを共有しない。共有するのは remotion の core の関数だけ）
- このフォルダに残すもの：縦型レイアウト（`templates/` の `Short.tsx`・`layout.ts`）、上部字幕帯のデザイン、cards の形式とモーラ長からのテロップ時刻（`cards.mjs`）、-14 LUFS・声のみの設定（`template.json`）、`STYLE.md`、作風の学習（`samples/`・`analysis/`）。core が出すのはモーラの長さ・数まで
- 移行用テスト動画 `sm-engine-test`（**公開しない**。テストパターン画像2枚の8秒の動画）：Phase 0（2026-10-30）に旧方式で `productions/sm-engine-test` を作り（旧方式のフォルダは2026-11-03に削除）、Phase 3（2026-11-03）に新しい形 `sm-engine-test/` で作り直して、音声・timeline・字幕・241コマ・MP4 がすべてバイト一致（-15.1 LUFS／-1.5 dBTP）。**移行が終わるまで削除しない**（cleanupの対象外）。基準データは `../../remotion/docs/migration/phase0-baselines.md`

## 完成後のファイル管理（アップロード後の整理）
**制作中**：画像・音声・字幕・連番画像などのレンダリングデータは全部残し、いつでも修正・再書き出しできる状態にしておく。

**全動画プロジェクト共通の方針（2026-10-30）**：video配下を完成動画の保存庫にしない。アップロードと再生確認が終わったら、その動画固有の制作物（その動画専用の画像・映像素材・音声・BGM/SE・中間生成物・キャッシュ・連番・一時ファイル・完成MP4・出典メモなど、動画フォルダ `<id>/` の中身すべて）を毎回削除する。**2026-11-20 から、公開と再生の確認・安全確認が済んだら人の追加指示を待たずに自動で消す**（下の手順。`../CLAUDE.md` の cleanup）。共通の対象一覧は `../../remotion/docs/video-migration-plan.md` の「cleanupの対象」 **【2026-11-22 改定（ユーザー指示）】完成MP4は当面保持する。自動で行うのは content-ops の `production post-publish`（ops/run-cycle.sh）からの remotion `video:prune`（中間ファイルだけ。`workspaces/<ws>/cleanup-policy.json` が有効な workspace だけ）。完成MP4ごと消す `video:cleanup` は自動では使わず、ユーザーの指示があるときだけ（この行の「人の追加指示を待たずに video:cleanup で自動削除」は停止）**

**アップロード後**（この順で進める。標準フロー）：
1. アップロード成功（content-ops の承認フロー、または人の報告）
2. 公開記録を確認：content-ops の campaign に video ID・URL・公開日時（`co youtube sync`）、`co production snapshot` 済み
3. アップロード先で正常に再生できることを確認する（YouTube：`co youtube video` で public・processed、ログインなしの oEmbed で埋め込みが返る）
4. 共通remotionで `npm run video:mark-completed -- --type=short-movie --project=<id>` → `npm run video:mark-published -- --type=short-movie --project=<id> --url=<URL> --at=<公開日時>`
5. `npm run video:cleanup -- --type=short-movie --project=<id> --dry-run`（①削除対象の一覧〈SIZE〉・②残るもの〈REMAINS〉・FINGERPRINT・DELETABLE）。共通ファイル・他案件・テンプレート・fixture が含まれず `DELETABLE: YES` なら、そのまま `--confirm-delete=<id> --expect-fingerprint=<表示された値>` で消す（動画フォルダ `<id>/` 全体。完成MP4も含む）
6. Git 管理の `<id>/project.json`・`input/*.json` の削除を video で commit・push し、campaign の brief.md に cleanup の結果（日時・ファイル数・サイズ）を残す。他の文書が `<id>/` を指していれば「cleanup 済み・記録は content-ops の campaign」に直す
- 2〜5 のどれかが満たせない（再生できない・`DELETABLE: NO`・想定外のファイル）ときは消さずに報告する

**必ず残すもの**：`CLAUDE.md`、`STYLE.md`、`templates/`（アプリ・共通設定）、`scripts/`、`samples/`、`analysis/`、`_shared/`（再利用する共通素材）

**注意**
- アップロード前・再生確認の前に素材を消さない。`video:cleanup` を使えない削除（下の `productions/` など）はユーザーの承認なしに消さない
- 完成MP4（`<id>/output/<id>.mp4`）も削除対象（2026-10-30の共通方針）。dry-run の一覧に含めて確認してから消す
- 移行用テスト動画 `sm-engine-test` は移行が終わるまで対象外
- 旧方式の `productions/<id>/` は `video:cleanup` の対象外（同じ4段階を手作業で行う）。`robot-ai-20261030` の cleanup はこの方法で、公開・再生確認の後に行う
- 他の動画やテンプレートから参照されているファイルは消さない
- 他のプロジェクト（`../movie-trivia` など。`node_modules` はジャンクションなので、消すときはリンクだけを外し、中身を消さない）に影響を与えない
- 消した後も、テンプレートから新しい動画を作れる状態を保つ
- ※学習用サンプル（`samples/`）の元動画 `.MOV` を学習後に消す取り決めは別（ユーザーの完成動画 `final.mp4` は残す）
