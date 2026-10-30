# movie-trivia

（2026-10-04に`Projects/movie`から`Projects/video-projects/movie-trivia`へ移動・改名。`package.json`の`name`は`movie`のまま）

YouTube向け解説・雑学動画（横1920×1080・30fps、VOICEVOXナレーション、Pexelsのフリー映像・写真）を作るプロジェクト。

## 状態
- 1本目「日本の意外な雑学10選」（`japan-trivia`）：2026-10-04にYouTubeへ投稿済み。専用ファイルは削除済み
- 2本目「動物の雑学10選」（`animal-trivia`）：2026-10-04にYouTubeへ投稿済み。専用ファイルは削除済み。（HUD風デザイン・春日部つむぎ・BGMあり。この型はパターン化していない）
- 3本目「中国の世界最大・核融合用超伝導磁石の解説」（`fusion-magnet`）：2026-10-06にYouTubeへ投稿済み。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `8cd8202` に残っている）。**pattern-01 の基準になった動画**
- 4本目「ニュース解説動画」（`sample-news-video-04`）：2026-10-07にYouTubeへ投稿済み。専用ファイルは削除済み（Gitには一度もコミットしていないので台本・投稿メモは残っていない）。初のニュース解説で、週刊誌報道を出典明記で使い、Xの投稿（文字のみ）・報道映像の静止画・本人のInstagramの写真を引用した（ユーザーが権利の申し立てリスクを承知で判断）。サムネイルは pattern-01 とは別デザイン（近未来・かわいい・スタイリッシュの3案）を動画専用に作った
- 5本目「松屋の牛めし480円の中身を分解」（`gyudon-price`）：2026-10-13にYouTubeへ投稿済み。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `c1b02aa` に残っている）。pattern-01、トレンドニュースを身近な疑問の解説にした初の動画。この動画で作ったサムネイルのデザイン（映像を全面に敷き、白の縁取り文字＋黄色の強調語＋赤い帯・丸バッジ）が pattern-01 の標準になった。
- 6本目「猫13匹虐待事件と動物愛護法」（`cat-abuse-law`）：2026-10-22にYouTubeへ投稿済み。専用ファイルは削除済み（台本・投稿メモ・図解・専用サムネイルはコミット `5c6d434` に残っている）。pattern-01。Evaの傍聴記をもとに、警察庁・検察の統計と法改正を一次情報で確認した。実名と逮捕時の報道映像の静止画（クレジット「報道映像より」）を使った（ユーザーがリスクを承知で判断）。ユーザー提供のうち、判決後の別名とされる名前や確認できない主張が書かれた画像は使わなかった。サムネイルは pattern-01 のA〜Cに加え、動画専用の別デザイン3案（D 報道・ドキュメンタリー風／E シンプル・数字／F 猫が主役）を `src/videos/cat-abuse-law/thumbs.tsx` に独自のエントリーで作った（共通の Root は変えない）。`src/current.ts` はこの動画を指したままなので、次の動画を `new-video.mjs` で作るまで Studio・lint は動かない
- 7本目「積水ハウス地面師詐欺事件」（`sekisui-jimenshi`）：2026-10-26にYouTubeへ投稿済み。pattern-03 の最初の動画。事実は積水ハウスの開示資料（2017・2018年）と総括検証報告書（2020年）で確認し、実名はウィキペディアの記事にある社長・会長だけを使った。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `4aaf7ff` に残っている）
- 8本目「福田和子事件（松山ホステス殺害事件）」（`fukuda-kazuko`）：2026-10-27にYouTubeへ投稿済み。pattern-03。事実は判決の報道（毎日新聞）・警察白書で確認し、実名はウィキペディアの記事にある本人だけを使った。本人の写真（手配カード・当時の新聞・報道映像）をネットから取得して使った（ユーザーがリスクを承知で判断）。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `2fa8db5` に残っている）
- 9本目「GMO不正アクセス事件（お名前.com デスクトップクラウド）」（`gmo-desktop-cloud`）：2026-10-28にYouTubeへ投稿済み。pattern-03（最初は pattern-01 で作ったが、事件風で作り直した）。進行中の事件で判決がないため、10月28日朝時点の内容とし、事実はGMOの公式発表（第1〜12報）と代表のブログで確認した。実名は代表の熊谷正寿だけ。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `a6b14d0` に残っている）
- 10本目「ブレイキングダウンsakkki騒動」（`sakkki-dispute`）：2026-10-30にYouTubeへ投稿済み。pattern-03。判決も警察・運営の発表もない騒動を、ユーザーの判断で「主張がぶつかっている騒動」として作った（事実と主張を分け、どちらが正しいかは言わない。10月29日時点）。事実は本人（@sakkki34）と告発した側（かじやん）のXの投稿、運営の中止告知で確認。実名ルールの例外として「sakkki」「かじやん」を使った（ユーザーがリスクを承知で判断）。告発の投稿動画から、暴行の瞬間でないコマを静止画で引用し、人物をぼかして本編とサムネイルに使った（ユーザーの指示）。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `82101ab` に残っている）
- 移行用テスト動画 `mt-engine-test`（2026-10-30、**公開しない**）：共通remotionへの移行（下の「方針」）の基準を取るために、旧手順で作った24.7秒の動画（pattern-03、Pexels 6470925・2750099、BGMあり）。Phase 2 で新しい形（`mt-engine-test/`、共通エンジン）でも作り直し、基準と一致を確認した（`../../remotion/docs/migration/phase2-movie-trivia.md`）。`src/current.ts` は今この新しい形の `mt-engine-test/` を指している。旧手順のファイル（`script/`・`public/`・`src/videos/`・`youtube/` の mt-engine-test）も残している。**移行が終わるまで削除しない**（cleanupの対象外）。基準データは `../../remotion/docs/migration/phase0-baselines.md`
- パターン：`pattern-02`（ランキング・カウントダウン、近未来HUD・春日部つむぎ・BGMなし。2026-10-23作成）、`pattern-03`（事件解説・ダーク、結末→経緯、明朝と赤・古いフィルム調・光るキーワード、青山龍星。2026-10-25作成。暗いBGM `bgm/pattern-03-dark.mp3` は「空っぽのベビーベッド」written by ゆうり(Yuli Audio Craft)、OpenTracks（旧DOVA-SYNDROME））。pattern-02 で作った動画はまだない
- `pattern-01`（シンプル解説・青山龍星。3〜6本目で使用）は2026-10-28に削除した（ユーザー判断。「もうダメ」）。型のファイルは削除前のコミット（`06ab86c`）に残っている
- `image/taiyo.mp4`（ユーザー提供・BEST建設現場の空撮）は元ファイルとして残している（Git管理外）
- `bgm/パステルハウス.mp3` は残している（台本の`bgm`で指定すれば使える。クレジット「パステルハウス written by かずち」）

## 新しい動画の作り方（「pattern-0Nを使用。テーマは〇〇。動画IDは〇〇。」と言われたら。パターンの指定がないニュース・事件のテーマは pattern-03）
1. `node scripts/mt.mjs new --project=<id> --pattern=pattern-0N`（動画フォルダ `<id>/`〈project.json・input/・audio/・assets/・intermediate/・output/〉と台本の雛形・図解ファイル・投稿メモを作り、`src/` をその動画に切り替える）
2. テーマを一次情報で調べる（`common/production-rules.md`）。pattern-02 は順位を決める指標と出典、pattern-03 は確定判決の有無と実名・写真を使うか（ユーザーに確認）を最初に確かめる
3. `patterns/<pattern>/README.md` の型に沿って `<id>/input/script.json` を書く（章・順位の数はテーマに合わせて決める。尺の目安は6〜8分）
4. 読みの確認 → 音声生成 → 尺の確認（足りなければ確認済みの事実を足す）
5. 素材の検索・確認・採用 → 連番化
6. 図解が必要なら `<id>/input/diagrams.tsx` に書く
7. 代表コマで確認 → 書き出し（`common/render.md`）→ 投稿メモ（`<id>/input/youtube.md`）を仕上げる
8. 完成の報告では、MP4・サムネイルと一緒に**タイトル・説明文・ハッシュタグ**を貼れる形で出す（`common/production-rules.md`「完成時の報告」）

型（見た目・声・音・演出）はパターンに決まっているので、ユーザーに聞くのはテーマ固有で判断できないこと（提供素材の権利など）だけ。

## どこに何があるか（2026-10-30、Phase 2 から。共通remotionの動画プロジェクトの形）
```
common/production-rules.md  全動画共通の制作ルール（一次情報での事実確認・出典・素材確認・報道より一次情報）
common/render.md            全動画共通の書き出し手順（共通remotionのNode APIで連番JPEG → core/mediaでMP4、一部だけ書き出し直す方法）
patterns/<pattern>/         型（config・design・subtitle・voice・bgm・render・thumbnail・台本の雛形・README）
src/                        Remotion のコンポーネント（pattern・timeline・scenes・film・HUD・diagram-kit・Thumbnail・theme）。全動画で共通。
                            動画ごとに違うのは src/current.ts・current-diagrams.ts（今作っている動画を指す。mt.mjs new/switch が書き換える）だけ
src/pattern.ts              パターンの設定を読む（新しいパターンを作ったらここに足す）
scripts/mt.mjs              制作コマンドの入口 → scripts/lib/engine.mjs → ../../remotion/src/video-types/movie-trivia/（実装）
bgm/                        パターンが使う共通BGM（Git管理外）
<id>/                       動画1本のフォルダ（共通remotionの動画プロジェクト。project.json で作成・完成・公開・削除を管理）
  input/script.json         台本（正本）。"pattern"、title系の文言、media{キー:{query}}、scenes[]（opening / chapter / ending）→ lines[]、各lineの visual、読み替え表、thumbnails[]
  input/diagrams.tsx        その動画の図解
  input/youtube.md          タイトル案・説明文・出典・素材クレジット・チャプター・事実確認メモ
  audio/                    ナレーション生成物（narration.wav/json/srt）。手で直さない
  assets/                   素材（<キー>.mp4|.jpg）、出典台帳 asset-sources.json（共通remotionの台帳の形）、連番の目録 frames.json
  intermediate/             連番（frames/）・素材の連番（media-frames/）・キャッシュ・素材候補の一覧・render-public（消してよい）
  output/                   完成MP4・サムネイル
```
- `input/`・`project.json` は Git 管理、ほかは Git 管理外（`video/.gitignore`）
- **旧方式のファイル**（`script/`・`public/audio`・`public/media`・`src/videos/`・`youtube/`・`out/`・`frames/`・`.cache/` と `scripts/` の旧スクリプト〈new-video・build-narration・pexels・prepare-media・encode-mp4・chapters・wav・lib/video〉・自前の `node_modules`）は、Phase 2 の移行確認が終わり、削除をユーザーが承認するまで残す。**新しい動画では使わない**

## コマンド（<id> は動画のキー。`npm.cmd run mt -- <command> --project=<id>` でも同じ）
- 新しい動画：`node scripts/mt.mjs new --project=<id> --pattern=pattern-03`／既存の動画に戻す：`node scripts/mt.mjs switch --project=<id>`
- 音声：VOICEVOXアプリを起動（`http://127.0.0.1:50021`）→ `node scripts/mt.mjs narration --project=<id> --dry-run`（読みの確認）→ `--dry-run` なしで生成（文ごとにキャッシュ。1文だけ試すときは `--line=<id>`）
- Pexels：`node scripts/mt.mjs pexels candidates --project=<id> [--scene=<キー>] [--kind=video|photo] [--query="..."] [--per=9]` → `<id>/intermediate/candidates/<キー>-<kind>.png`。採用は `node scripts/mt.mjs pexels pick --project=<id> --scene=<キー> --video=<pexels id>`（写真は `--photo=`、差し替えは `--force`）。動画は横長で長辺1920px以下の最大のファイル（共通remotionの `pickPexelsVideoFile`）
- 連番化：`node scripts/mt.mjs prepare-media --project=<id>`（往復ループ。台本の media キーの素材は最大20秒分）
- 書き出し・サムネイル・チャプター・クレジット：`common/render.md`
- 確認：代表コマ `node scripts/mt.mjs render --project=<id> --still=<png> --frame=N [--frame=M …]`、型チェック `npm.cmd run typecheck:engine`（共通remotionの型だけで確認）・`npm.cmd run lint`（旧方式の node_modules を使う）。Studio（`npm.cmd run dev`）は旧方式の node_modules を使うので、新しい形では代表コマで確認する
- 完成・公開・後片付け：共通remotionの `npm run video:mark-completed` / `video:mark-published` / `video:cleanup -- --type=movie-trivia --project=<id>`（下の「YouTube投稿後の後片付け」）

## 方針
- **`../../remotion`（`Projects/remotion`）を共通の動画制作エンジンとして使う（2026-10-30決定、恒久方針。`../../remotion/docs/video-platform-architecture.md`の13章）**。VOICEVOX・WAV・Pexels・FFmpeg/ffprobe・音量・字幕・出典台帳・動画プロジェクト管理・cleanup・書き出し基盤は remotion の `src/core/` と `src/video-types/movie-trivia/` を使い、movie-trivia 側に同じ処理を新しく書かない。remotion側の呼び出しは `scripts/lib/engine.mjs` だけを通す（直接パスを書いたimportを散らばらせない）
  - 移行の詳細設計（正本・設計案）：`../../remotion/docs/movie-trivia-integration-design.md`。全体の順番：`../../remotion/docs/video-migration-plan.md` の **Phase 2**
  - **Phase 2 で切り替えた（2026-10-30）**：制作は `scripts/mt.mjs`（このCLAUDE.mdの「コマンド」と `common/render.md`）で行う。VOICEVOX・WAV・SRT・Pexels・ffmpeg/ffprobe・音量（2パスloudnorm・AACのピーク再測定）・BGM合成・連番→MP4・project.json・lifecycle・cleanup・描画（Node API）・出典台帳は共通remotionの core、手順は `src/video-types/movie-trivia/`
  - movie-triviaに残すのは pattern（pattern-02・03）・台本の形式・timeline・scenes・film・HUD・diagram-kit・Thumbnail・theme・見た目・台本ロジック・`common/production-rules.md`
  - **描画（Remotion）も共通remotionの実行環境**：`movie-trivia → scripts/lib/engine.mjs → 共通remotionのcore／render／Node API`。Remotion・React・フォント（`@remotion/google-fonts@4.0.525`）・Chrome は共通remotionのもの（`bundleApp` の `sharedModulesOnly` で、movie-trivia の `node_modules` を探さないことを確認済み）。movie-trivia独自のRemotion実行環境（自前の`node_modules`）は恒久的には残さない。**ただし旧方式のファイルと依存は、移行確認が終わり削除をユーザーが承認するまで削除しない**
  - remotion側の変更は、他の動画タイプの出力が変わらないことを確かめてから行う。character-news固有の部分（`src/video-types/character-news/`）は変えない
- `../short-movie` の production のうち、制作中の `robot-ai-20261030` だけが今もこの `node_modules` をジャンクションで借りている（`sm-engine-test` と新しい production は 2026-10-30 に共通remotionへ移った）。**robot-ai-20261030 の cleanup でジャンクションが外れるまで、`node_modules`の中身・依存（remotion・ffmpeg-static等）を変えない・消さない**
- `../claude-course` のファイルはimportも変更もしない（共通処理は remotion の core を通して共有する）
- Git：2026-10-06に初期化（コードと設定のみ。素材・音声・提供素材・BGMは .gitignore でローカルのみ）。push は指示があるまでしない
- `.env`（Git管理外）に`PEXELS_API_KEY`。値は表示しない
- パターンには動画固有のもの（テーマ・台本・素材・図解・タイトル・サムネイルの文言・読み替え表・出典）を入れない

## YouTube投稿後の後片付け
- **全動画プロジェクト共通の方針（2026-10-30）**：video配下を完成動画の保存庫にしない。アップロードと再生確認が終わったら、その動画固有の制作物を毎回すべて削除する。手順は「①削除対象の一覧 → ②削除後に残るもの → ③ユーザー確認 → ④承認後に削除」（自動で即削除しない）。共通の対象一覧は `../../remotion/docs/video-migration-plan.md` の「cleanupの対象」
- 条件：動画が完成してYouTubeへのアップロードと再生確認が終わったこと
- 手順（共通remotionで実行）：`npm run video:mark-completed -- --type=movie-trivia --project=<id>` → `npm run video:mark-published -- --type=movie-trivia --project=<id> --url=<YouTubeのURL>` → `npm run video:cleanup -- --type=movie-trivia --project=<id>`（dry-run：①削除対象の一覧〈SIZE〉と②残るもの〈REMAINS〉と FINGERPRINT を表示）→ ③ユーザーに見せて確認 → ④承認後に `--confirm-delete=<id> --expect-fingerprint=<表示された値>`
- 削除されるもの：動画フォルダ `<id>/` 全体（台本・図解・投稿メモ・ナレーション・素材・出典台帳・連番・キャッシュ・完成MP4・サムネイル）
- 残すもの：`common/`、`patterns/`、`src/`、`scripts/`、`bgm/` の共通BGM、設定ファイル、CLAUDE.md
- 動画フォルダを消した後は `src/current.ts` が消えた動画を指したままになるので、次の動画を `mt.mjs new` で作るまで描画・型チェックは動かない
- 旧方式で作った動画（`script/<id>.json` などに分かれているもの）は、今は `mt-engine-test` だけ（移行確認用）
- 削除後、このCLAUDE.mdの状態欄を更新する
- その動画専用のBGM（`bgm/`のうち、その動画でしか使わない曲）も削除対象。pattern が使う共通BGM（`bgm/pattern-03-dark.mp3` など）は残す
- 移行用テスト動画 `mt-engine-test` は移行が終わるまで対象外
