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
- 9本目「GMO不正アクセス事件（お名前.com デスクトップクラウド）」（`gmo-desktop-cloud`）：2026-10-28にYouTubeへ投稿済み。pattern-03（最初は pattern-01 で作ったが、事件風で作り直した）。進行中の事件で判決がないため、10月28日朝時点の内容とし、事実はGMOの公式発表（第1〜12報）と代表のブログで確認した。実名は代表の熊谷正寿だけ。専用ファイルは削除済み（台本・投稿メモ・図解はコミット `a6b14d0` に残っている）。`src/current.ts` はこの動画を指したままなので、次の動画を `new-video.mjs` で作るまで Studio・lint は動かない
- パターン：`pattern-02`（ランキング・カウントダウン、近未来HUD・春日部つむぎ・BGMなし。2026-10-23作成）、`pattern-03`（事件解説・ダーク、結末→経緯、明朝と赤・古いフィルム調・光るキーワード、青山龍星。2026-10-25作成。暗いBGM `bgm/pattern-03-dark.mp3` は「空っぽのベビーベッド」written by ゆうり(Yuli Audio Craft)、OpenTracks（旧DOVA-SYNDROME））。pattern-02 で作った動画はまだない
- `pattern-01`（シンプル解説・青山龍星。3〜6本目で使用）は2026-10-28に削除した（ユーザー判断。「もうダメ」）。型のファイルは削除前のコミット（`06ab86c`）に残っている
- `image/taiyo.mp4`（ユーザー提供・BEST建設現場の空撮）は元ファイルとして残している（Git管理外）
- `bgm/パステルハウス.mp3` は残している（台本の`bgm`で指定すれば使える。クレジット「パステルハウス written by かずち」）

## 新しい動画の作り方（「pattern-0Nを使用。テーマは〇〇。動画IDは〇〇。」と言われたら。パターンの指定がないニュース・事件のテーマは pattern-03）
1. `node scripts/new-video.mjs --id=<id> --pattern=pattern-0N`（台本の雛形・素材フォルダ・図解ファイル・投稿メモを作り、`src/` をその動画に切り替える）
2. テーマを一次情報で調べる（`common/production-rules.md`）。pattern-02 は順位を決める指標と出典、pattern-03 は確定判決の有無と実名・写真を使うか（ユーザーに確認）を最初に確かめる
3. `patterns/<pattern>/README.md` の型に沿って `script/<id>.json` を書く（章・順位の数はテーマに合わせて決める。尺の目安は6〜8分）
4. 読みの確認 → 音声生成 → 尺の確認（足りなければ確認済みの事実を足す）
5. 素材の検索・確認・採用 → 連番化
6. 図解が必要なら `src/videos/<id>/diagrams.tsx` に書く
7. 代表コマで確認 → 書き出し（`common/render.md`）→ 投稿メモ（`youtube/<id>.md`）を仕上げる
8. 完成の報告では、MP4・サムネイルと一緒に**タイトル・説明文・ハッシュタグ**を貼れる形で出す（`common/production-rules.md`「完成時の報告」）

型（見た目・声・音・演出）はパターンに決まっているので、ユーザーに聞くのはテーマ固有で判断できないこと（提供素材の権利など）だけ。

## どこに何があるか
```
common/production-rules.md  全動画共通の制作ルール（一次情報での事実確認・出典・素材確認・報道より一次情報）
common/render.md            全動画共通の書き出し基盤（連番JPEG → ffmpeg-static、一部だけ書き出し直す方法）
patterns/<pattern>/         型（config・design・subtitle・voice・bgm・render・thumbnail・台本の雛形・README）
script/<id>.json            台本（正本）。"pattern"、title系の文言、media{キー:{query}}、scenes[]（opening / chapter / ending）→ lines[]、各lineの visual、読み替え表、thumbnails[]
public/audio/<id>/          ナレーション生成物（narration.wav/json/srt）。手で直さない
public/media/<id>/          素材（<キー>.mp4|.jpg）、連番（frames/）、出典台帳 sources.json
src/                        Remotion。全動画で共通。動画ごとに違うのは src/current.ts・current-diagrams.ts（今作っている動画）と src/videos/<id>/diagrams.tsx（その動画の図解）だけ
src/pattern.ts              パターンの設定を読む（新しいパターンを作ったらここに足す）
scripts/lib/video.mjs       台本＋パターンから声・間・BGM・音量を決める（台本に書けば上書き）
youtube/<id>.md             タイトル案・説明文・出典・素材クレジット・チャプター・事実確認メモ
out/<id>/                   完成MP4・サムネイル・確認用画像・素材候補の一覧（Git管理外）
frames/                     連番JPEG（中間ファイル、消してよい）
```

## コマンド（<id> は動画のキー）
- 新しい動画：`node scripts/new-video.mjs --id=<id> --pattern=pattern-03`／既存の動画に戻す：`node scripts/new-video.mjs --switch=<id>`
- 音声：VOICEVOXアプリを起動（`http://127.0.0.1:50021`）→ `node scripts/build-narration.mjs --script=<id> --dry-run`（読みの確認）→ `--dry-run` なしで生成（文ごとにキャッシュ）
- Pexels：`node scripts/pexels.mjs candidates --script=<id> [--scene=<キー>] [--kind=video|photo] [--query="..."] [--per=9]` → `out/<id>/candidates/<キー>-<kind>.png`。採用は `node scripts/pexels.mjs pick --script=<id> --scene=<キー> --video=<pexels id>`（差し替えは `--force`）。動画は横長で長辺1280px以下の最大のファイル
- 連番化：`node scripts/prepare-media.mjs --script=<id>`（往復ループ。台本の media キーの素材は最大20秒分）
- 確認：`npm.cmd run dev`（Studio）、`npm.cmd run lint`
- 書き出し・サムネイル・チャプター：`common/render.md`

## 方針
- `../claude-course`（旧`claude-course-video`）・`../../remotion`（旧`remotion-project`）はimportも変更もしない
- Git：2026-10-06に初期化（コードと設定のみ。素材・音声・提供素材・BGMは .gitignore でローカルのみ）。push は指示があるまでしない
- `.env`（Git管理外）に`PEXELS_API_KEY`。値は表示しない
- パターンには動画固有のもの（テーマ・台本・素材・図解・タイトル・サムネイルの文言・読み替え表・出典）を入れない

## YouTube投稿後の後片付け（このmovie-triviaプロジェクトだけのルール）
- 条件：動画が完成してYouTubeへのアップロードも終わり、**今後その動画自体を修正・再編集する予定がない**こと。再編集の予定があるかどうか分からなければ、削除前にユーザーに確認する
- 削除してよいもの（その動画専用の素材）：連番画像（`frames/`）、`out/<id>/`、ナレーション（`public/audio/<id>/`）、音声・素材検索のキャッシュ（`.cache/`）、素材（`public/media/<id>/`）、台本（`script/<id>.json`）、図解（`src/videos/<id>/`）、投稿メモ（`youtube/<id>.md`）
- 残すもの：`common/`、`patterns/`、`src/`（`videos/<id>/` 以外）、`scripts/`、設定ファイル、`node_modules/`
- 図解を消した後は `src/current.ts` が消えた動画を指したままになるので、次の動画を `new-video.mjs` で作るまで Studio・lint は動かない
- 削除後、このCLAUDE.mdの状態欄を更新する
- remotion（旧remotion-project）・claude-course（旧claude-course-video）など他のプロジェクトには適用しない（用途が違うため）
