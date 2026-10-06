# claude-course

（2026-10-04に`Projects/claude-course-video`から`Projects/video-projects/claude-course`へ移動・改名。`package.json`の`name`は`claude-course-video`のまま）

「Claude Codeで始めるAI副業実践講座」の講座動画を作るプロジェクト。販売開始時はLesson 01の導入動画のみ。将来Lesson 02〜10の動画を追加できるよう、共通部分（タイトル・章タイトル・字幕・画面枠・トランジション・音声生成）とLesson固有部分（台本・画像・画面録画）を分けて作る。

## 他プロジェクトとの関係

- `../../remotion`（ニュース動画。旧`remotion-project`）とは完全に別プロジェクト。**importしない・変更しない**。VOICEVOXの音声生成ロジックだけを参考にし、このプロジェクト内に独立したコード（`scripts/voicevox/`）として持つ
- remotion（旧remotion-project）から持ち込まないもの：ニュース動画用component、HUD／overlay計画、キャラクター構成・口パク、`youtube-test-*`の構成、ニュース動画固有の素材、Git履歴
- `../../web-project`（会員サイト）は変更しない。完成MP4は`out/lesson-XX/`に書き出すところまでがこのプロジェクトの担当。**web-projectの`public/`には動画を置かない**（ログイン不要で誰でも取得できるため）。配信先（Supabase Storage／動画配信サービス）は未決定で、制作中はホスティング方式を前提にしない

## 現在の状態（2026-10-02）

- 済：Lesson 01導入動画の正式台本、VOICEVOXナレーション、字幕タイミング、会員サイトのスクショ6枚とサポーター録画（`lessons/lesson-01/assets.md`）、Remotionで全26シーンの画面（Studioで最初から最後まで確認できる。デザインと字幕ルールは2026-09-30に正式採用）
- 済（2026-09-30）：最終MP4 `out/lesson-01/lesson-01-intro.mp4`（＋`captions.vtt`・`poster.png`）
- 未着手：配信先の決定とweb-projectへの組み込み
- 進行中：メルマガ登録者向けの無料体験動画（下記「無料体験動画」）
  - 済（2026-10-02）：全編の台本（7章18シーン54文）、ナレーション（4:02.3）、字幕（`captions.json`の表記調整11件、`captions.vtt`）。声と速度（玄野武宏 ノーマル・1.04）はこの動画でも確定
  - 済（2026-10-02）：映像（Composition `FreeTrial`）と確認用MP4 `out/free-trial/free-trial-preview.mp4`（4:01.9、-16.1 LUFS／True Peak -1.1 dBTP）
  - 済（2026-10-02）：確認後の修正（l036の台本、MP4のピーク）と完成版 **`out/free-trial/free-trial-final.mp4`**（4:02.33、-16.2 LUFS／True Peak -1.8 dBTP）
  - 未着手：配信（配信先は未決定）
- 完成・ユーザー確認済み（2026-10-02）：販売ページに埋め込む講座紹介動画（下記「講座紹介動画」）。完成版 **`out/sales-intro/sales-intro-final.mp4`**（3:06.37、-16.2 LUFS／True Peak -1.6 dBTP）
  - 済（2026-10-02）：承認済み台本（6章23シーン44文）、ナレーション（3:06.4）、字幕（`captions.json`の表記調整9件、`captions.vtt`）
  - 済（2026-10-02）：映像（Composition `SalesIntro`）と確認用MP4 `out/sales-intro/sales-intro-preview.mp4`（3:06.37、-16.2 LUFS／True Peak -1.6 dBTP）
  - 済（2026-10-02）：冒頭2場面の修正と全編の見出し帯（講座名・章ラベル）の削除を反映して全編を再レンダリング。確認用MP4 `out/sales-intro/sales-intro-preview.mp4`を上書き（3:06.37、-16.2 LUFS／True Peak -1.6 dBTP）。確認用PNGは`out/sales-intro/review/`
  - 済（2026-10-02）：ユーザー確認で修正なし。確認用MP4を再レンダリングせずそのまま`sales-intro-final.mp4`としてコピー（内容は`sales-intro-preview.mp4`と同一）
  - 未着手：販売ページへの埋め込み（配信先は未決定）
- Git未初期化（初期化・commit・pushは指示があるまで行わない）

## フォルダ

```
lessons/shared/pronunciation.json   全Lesson共通の読み辞書
lessons/lesson-XX/lesson.json       Lessonの台本＋画面指定（正本）
scripts/voicevox/                   ナレーション生成（engine / wav / lesson / subtitles / build-narration）
public/lessons/lesson-XX/audio/     生成物（手で直さない。台本を直して作り直す）
public/lessons/lesson-XX/screens/member-site/   会員サイトの実画面
public/lessons/lesson-XX/recordings/            採用した画面録画
lessons/lesson-XX/assets.md         素材台帳（どの素材をどのシーンで使うか）
lessons/free-trial/lesson.json      無料体験動画の台本（正本。--lesson=free-trial）
public/free-trial/                  無料体験動画の録画素材（01〜05）
public/free-trial/audio/            無料体験動画のナレーション生成物（手で直さない）
lessons/sales-intro/lesson.json     講座紹介動画（販売ページ用）の台本（正本。--lesson=sales-intro）
public/sales-intro/                 講座紹介動画の録画素材（X記事ツール・販売ページの画面収録）
public/sales-intro/audio/           講座紹介動画のナレーション生成物（手で直さない）
public/sales-intro/demo/            冒頭専用のデモページ（架空の美容サロンLumière、lumiere/index.html＋写真）と書き出し画像lumiere-hero.png。出典はdemo/CREDITS.md
public/sales-intro/edit/            講座紹介動画の加工素材（切り出し・30fps固定・無音）と静止画。scripts/sales-intro/prepare-recordings.mjsで作る
src/lessons/sales-intro.ts          講座紹介動画の画面指定（beats）
scripts/video/encode-mp4.mjs        画像連番＋narration.wav→MP4（--lesson=free-trial|sales-intro。AAC後のピーク確認付き）
public/free-trial/edit/             録画の加工版（切り出し・マスク・30fps固定・無音）と静止画。scripts/free-trial/prepare-recordings.mjsで作る（元の録画は変更しない）
src/lessons/free-trial.ts           無料体験動画の画面指定（beats：どの文で何を見せるか）
src/engine/contentArea.ts           内容の領域の高さ（見出し帯の有無で変わる）。recordingの画面の大きさに使う
src/scenes/recording.tsx            layout `recording`（録画・静止画の切り替え／ズーム／ハイライト／変更前・変更後／2×2の一覧／早送り表示）
src/index.ts・Root.tsx              Remotionの入口。lessons/registry.tsの全Lessonをコンポジションとして登録
src/lessons/registry.ts             Lessonごとの登録（Composition ID・lesson.json・音声・cues・shots・captions）
src/engine/                         LessonVideo（組み立て）・narration（読み込みと整合チェック）・types
src/scenes/index.tsx                layout名→画面の対応（title / chapter / points / message / compare / bubbles / flow / screenshot / cards / cautions / end / recording）。対応の無いlayoutはエラーで止まる
src/components/                     共通component（Frame / TitleCard / ChapterTitle / KeyPoints / Subtitle / SceneFade / ScreenFrame / FlowSteps / ChatBubbles / CompareCards / CardGrid / EndCard / FitText）、字幕・画面文字の改行ロジック（captionLayout.ts）、表示タイミング（reveal.ts）
src/theme/tokens.ts                 色・フォント（Noto Sans JP）・領域・字幕・動きの値
raw/                                録画・キャプチャの元データ（Git管理外）
out/lesson-XX/                      完成MP4など（Git管理外）
.cache/voicevox/                    文ごとの合成キャッシュ（Git管理外、消してもよい）
```

## 台本（lesson.json）

- 構成：`chapters[] → scenes[] → lines[]`。idは英小文字・数字・ハイフンで、ファイル内で一意（lineは`l001`〜の連番）
- `scene.layout`と`scene.visual`は映像側（Remotion、未実装）が使う画面指定。layoutは`title` / `chapter` / `points` / `message` / `compare` / `bubbles` / `flow` / `screenshot` / `cards` / `cautions` / `end`
- `lines[]`が空のシーン（章タイトルなど）は`durationSeconds`で無音の長さを指定する。台詞のあるシーンの長さは音声から決まるため`durationSeconds`は書かない
- **1 line ＝ 1字幕**。`text`がそのまま字幕になる（文末の「。」は字幕から除く）。字幕幅は最大44（全角1・半角0.5、2行×22字想定）で、超えるとエラー。長い文は複数のlineに分ける
- 読み：`text`に共通辞書を適用したものをVOICEVOXへ送る。辞書で直せない行だけ`yomi`（読み全体）を書く
- 講座本編のGitはLesson 10の`git init`〜`git commit`まで。push等は用語集の補助用語なので、本編でpushまで実践すると誤解される表現にしない

## 読み辞書（lessons/shared/pronunciation.json）

- `entries`：英語などをカタカナの読みに置き換える（長い語から順に1回だけ）。字幕は変わらない
- `engineReads`：カタカナにすると区切りがおかしくなるため、英字のままENGINEに読ませる語（`Git`、`ChatGPT`。耳で確認済みのものだけ追加する）
- 読みに英字が残る文はエラーで止まる。新しい英単語が出たら、`--dry-run --kana`でENGINEの読み（kana）を確認してから辞書に追加する
- VOICEVOX ENGINEのユーザー辞書は使わない（PC全体の状態に依存して再現できなくなるため）

## ナレーション生成（VOICEVOX）

- 前提：VOICEVOXアプリ（ENGINE）を起動しておく。接続先は`http://127.0.0.1:50021`固定（外部・有料APIは使わない）
- 本番話者：**玄野武宏 ノーマル（style ID 11）、speedScale 1.04**。話者は`lesson.json`の`voice.speaker`、声の設定は`scripts/voicevox/engine.mjs`の`VOICE_SETTINGS`（全Lesson共通）。pitchScale 0／intonationScale 1.0／volumeScale 1.0はENGINE初期値
  - 2026-09-30に青山龍星 ノーマル（style ID 13）から変更した（5候補の聞き比べで決定）。青山龍星は本番話者として使わない
  - speedScaleは1.00／1.04／1.08／1.12を聞き比べて1.04に決定（2026-09-30）
  - 話者を変えたら、`lesson.json`のend画面の`visual.credit`も同じ話者名に直す
- 間：冒頭0.6秒、文と文の間0.5秒、シーンの間1.0秒、末尾2.0秒（`lesson.json`の`timing`）
- コマンド：
  - `node scripts/voicevox/build-narration.mjs --lesson=01 --dry-run [--kana]`：台本検査・字幕と読みの一覧・ENGINE確認（`--kana`でENGINEの読みと推定尺も表示）。合成・書き込みなし
  - `node scripts/voicevox/build-narration.mjs --lesson=01 [--force]`：生成。既存出力は`--force`なしでは上書きしない
  - `node scripts/voicevox/build-narration.mjs --lesson=01 --line=l021`：1文だけ合成して`.cache/voicevox/preview/`に出す（試聴用）
- 処理：文ごとに`audio_query`→`synthesis`（24kHz mono 16bit、読み＋話者＋設定＋ENGINEバージョンでキャッシュ）→ 無音を挟んで1本のタイムラインに結合 → 48kHzに変換して音量を測り、線形ゲイン1回だけで-16 LUFSへ近づける（true peak -1.5 dBTPが上限。圧縮・リミッターは使わない）→ `pcm_s16le` 48kHz stereo
- 出力（`public/lessons/lesson-XX/audio/`）：
  - `narration.wav`：動画全体の音声トラック（0秒＝動画の先頭）
  - `narration.json`：ENGINEバージョン・話者・設定・音量・章／シーン／文ごとの開始・終了秒（映像側はこれを正とする）
  - `narration.srt`：1文＝1キュー、読み上げた本文のまま（音声の書き起こし）
  - `captions.vtt`：視聴者向け。時刻は`narration.srt`と同じで、表記と2行の改行は動画の字幕と同じ（`captions.json`＋`captionLayout.ts`）。`captions.json`だけ直したときは`node scripts/build-captions.mjs --lesson=01`で作り直す（音声・`narration.json`・SRTは触らない）
- 時刻はすべて**実際の音声サンプル数から**計算する（文字数からの推定はしない）
- **台本を直したら必ず`--force`で作り直す**（変わった文だけ再合成される）
- クレジット：`VOICEVOX:玄野武宏`を動画の最後と配信ページに記載する。有料講座での利用になるため、**公開前にVOICEVOXと玄野武宏の利用規約を人が確認する**
- 音量：玄野武宏（speedScale 1.04）では線形ゲインがピーク上限で止まり、約-21.4 LUFSになる（-16 LUFS未達）。MP4書き出し時に音量をどう扱うか決める

## 無料体験動画（メルマガ登録者向け）

- 講座のLessonとは別の動画。キーは`free-trial`で、`--lesson=NN`の代わりに`--lesson=free-trial`を指定する（`build-narration.mjs`・`build-captions.mjs`・`check-display-text.mjs`で使える。パスの対応は`scripts/voicevox/lesson.mjs`の`lessonPaths`）
- 保存先（既存Lessonとは共有しない）：
  - 台本：`lessons/free-trial/lesson.json`（`"lesson": "free-trial"`）。表示字幕の調整は`lessons/free-trial/captions.json`
  - 音声：`public/free-trial/audio/`（`narration.wav`・`narration.json`・`narration.srt`・`captions.vtt`）
  - 1文プレビュー：`.cache/voicevox/preview/free-trial/<文ID>.wav`
- 音声は講座と同じ設定（玄野武宏 ノーマル style ID 11、`VOICE_SETTINGS`、`timing`、共通の読み辞書、音量処理）。台本の書き方・字幕ルールもLessonと同じ
- コマンド：
  - `node scripts/voicevox/build-narration.mjs --lesson=free-trial --dry-run [--kana]`
  - `node scripts/voicevox/build-narration.mjs --lesson=free-trial [--force]`
  - `node scripts/voicevox/build-narration.mjs --lesson=free-trial --line=l001`
- 録画素材（`public/free-trial/`）：01 Claude Codeへ依頼→index.html作成（2:38、2880×1800、可変fps）／02 完成ページをブラウザで確認（0:34、2940×1800）／03 修正依頼（文字の大きさ・ボタンの色・スマホ表示）（0:36、1920×1080、音声あり）／04 修正後の確認（0:23、1920×1080、音声あり）／05 PC幅→スマホ幅の確認（0:21、3086×1800）。使うときはミュート。Macのユーザー名（ターミナルのタイトル・パス・URL欄）、ブックマークバー・タブ・Dockが映っているので、ぼかすか切り出して隠す
- 構成：1 導入・完成サイト（02）→ 2 日本語で依頼（01）→ 3 初版を確認（02）→ 4 修正を依頼（03）→ 5 変更を確認（04）→ 6 狭い画面で確認（05）→ 7 まとめ・締め。章＝見出しの1〜7、シーン＝台本の段落。`visual.recording`は使う録画の目安
- 字幕44字（2行）を超える文は意味の区切りで複数の文に分けた（l002/l003・l007/l008・l041/l042・l047/l048・l049/l050）。分けた所には文の間0.5秒が入る
- 映像：Composition `FreeTrial`（Studioで選んで確認できる）。録画を使うシーンはlayout `recording`で、何をいつ見せるかは`src/lessons/free-trial.ts`の`beats`（文IDと秒のオフセットで指定。時刻は全て`narration.json`から）。要点画面（s13 flow／s16 points／s17 cards／s18 end）は`lesson.json`の`visual`
  - 1 導入：録画04（修正後）を最初に見せ、店名・ボタンをハイライト→録画05の冒頭→録画02の4セクションを2×2で→指示文の静止画
  - 2 依頼：録画01。指示文を拡大し、読み上げに合わせて1行目・2行目・載せる内容をハイライト。生成待ち（41.6〜70秒）は8倍、完了報告（108.7〜119秒）は2.5倍で「早送り」表示。70〜108.6秒（ログに長いローカルパス）と末尾のChatGPT画面は使わない
  - 3 初版：録画02を上から→各セクションを3.6倍で（早送り表示）。料金・ボタン・所在地をハイライトした静止画
  - 4 修正依頼：変更前の静止画で店名・ボタンを示す→録画03で送信→指示3行を拡大・ハイライト→処理を6倍（早送り）→完了報告
  - 5 変更確認：録画04の再読み込み前後（「変更前」「変更後」）→店名・ボタンの比較→メニューへ移動
  - 6 狭い画面：録画05。幅を狭める操作→狭い画面を拡大。「ブラウザの幅を変えて確認」を常に表示
  - 7 まとめ：完成サイト＋要点→基本の流れ→小さく始める→講座で学ぶ事（メルマガでご案内）→締め（VOICEVOX:玄野武宏）
- 録画の加工（`node scripts/free-trial/prepare-recordings.mjs [--force]`）：macOSのメニュー・ターミナルのタイトル（ユーザー名）・ブラウザのタブ／URL欄（ローカルパス）／ブックマーク・Dock・リンクのプレビューを切り出しで除外。本文中のユーザー名（01の`ls -la /Users/…` 8〜75秒、03の`/private/tmp/…-Users-…` 23〜30.5秒）だけぼかす。指示文とサイトの変更箇所は隠さない。04はウインドウが7.75秒で15px動くので切り出し位置も合わせる
- 書き出し（このPCではWindowsのスマートアプリコントロールがRemotion同梱のffmpeg/ffprobe（compositor）のDLLを止めるため、通常の`remotion render`→MP4は失敗する。free-trialは録画を`Html5Video`で再生し、画像連番＋ffmpeg-staticで書き出す）：
  1. `npx remotion render src/index.ts FreeTrial <連番フォルダ> --sequence --muted --props='{"withAudio":false}' --image-format=jpeg --jpeg-quality=95`（約20分）
  2. `node scripts/free-trial/encode-mp4.mjs <連番フォルダ> [out/free-trial/free-trial-final.mp4]`：フレーム数を確認→映像をlibx264 CRF18 slow・フル→リミテッドレンジ・BT.709で1回エンコード→`narration.wav`を測定して2パスloudnorm（-16 LUFS）＋48kHz AAC 192k→**AACに変換した後の**True Peakをebur128で測り、-1.6 dBTP（-1.5に測定の刻み0.1 dBの余裕）を超えたらloudnormのTP目標を下げて音声だけ作り直す（ピーク上限をLUFSより優先）→映像と音声をコピーで結合、faststart
- 確認結果（2026-10-02、確認用MP4）：1920×1080・30fps・h264 High yuv420p（bt709）・AAC 48kHz stereo・4:01.90。ebur128で-16.1 LUFS、LRA 4.1、True Peak -1.1 dBTP（AACエンコードでloudnormの上限-1.5から0.4 dB上振れ）。moov→mdat。代表フレームで字幕の欠け・画面のはみ出し・マスク漏れが無い事を確認
- 確認後の修正（2026-10-02）：
  - l036を「上部のメニューを押すと、メニューの場所へ移動します」に変更（録画04の操作＝ヘッダーの「メニュー」リンクに合わせた）。再合成はl036だけで他の53文はキャッシュを再利用。音声は+0.405秒で全体242.304秒、l037以降は全て0.405秒後ろへ（時刻は`narration.json`から計算するので映像・字幕は自動で追従）
  - l036の映像：録画04の再生開始を12.6→12.25秒にし、クリック（録画13.25秒）が「押すと」（文の開始+0.94秒）に重なるようにした。リンクのハイライトは「メニュー」を読む間（+0.45〜1.1秒）
  - MP4の音声：AAC変換後の測定でTrue Peak -1.1 dBTPになっていたため、AAC後に測ってTP目標を下げる処理を追加（TP目標-1.5→-2.1で-1.8 dBTP）
- 完成版の測定（2026-10-02、`out/free-trial/free-trial-final.mp4`）：1920×1080・30fps・h264 High yuv420p（bt709）・AAC 48kHz stereo 192k。映像7270フレーム（242.33秒）、音声の終端242.31秒（ナレーション242.304秒）。ebur128で**-16.2 LUFS**、LRA 4.1、**True Peak -1.8 dBTP**（astatsのサンプルピーク-1.81 dB）。moov→mdat（faststart）。l036の同期・後続シーン・終端（最後のフェードとクレジット）をフレームで確認。確認用の`free-trial-preview.mp4`は修正前の版

## 講座紹介動画（販売ページ用、キー sales-intro）

- 販売ページに埋め込む約3分の紹介動画。`--lesson=sales-intro`で`build-narration.mjs`・`build-captions.mjs`・`check-display-text.mjs`が使える（`scripts/voicevox/lesson.mjs`の`STANDALONE_VIDEOS`。free-trialと同じ扱い）
- 保存先：台本`lessons/sales-intro/lesson.json`、表示字幕の調整`lessons/sales-intro/captions.json`、音声`public/sales-intro/audio/`（narration.wav・narration.json・narration.srt・captions.vtt）、1文プレビュー`.cache/voicevox/preview/sales-intro/`
- コマンド：`node scripts/voicevox/build-narration.mjs --lesson=sales-intro --dry-run [--kana]`／`--lesson=sales-intro [--force]`／`--lesson=sales-intro --line=l001`
- 音声は講座と同じ設定（玄野武宏 ノーマル ID 11、speedScale 1.04、timing・音量処理も同じ）。2026-10-02生成：186.364秒（3:06.4）、44文、-19.98 LUFS／-1.5 dBTP（-16 LUFSはMP4書き出し時に合わせる）
- 読み辞書に追加（2026-10-02）：Standard→スタンダード、Premium→プレミアム、Zoom→ズーム、X→エックス（英字の単独の「X」だけ）。Lesson 01・free-trialの台本には出てこない語で、両者の読みが変わらない事を確認済み（音声は作り直していない）
- 台本：承認済み台本のまま。字幕44字を超える文だけ意味の区切りで分けた（l005/l006・l025/l026・l035/l036）。`scene.layout`・`visual`は映像制作前の仮の値で、`visual.source`は使う素材の目安
- 素材（2026-10-02確認）：
  - `X記事ツール.mov`：60.5秒、3210×1800、可変fps（平均38fps）、音声なし。テーマ・ターゲット・目的の入力→文章の雰囲気・記事タイプの選択→仕上げ設定→「X記事を生成する」→生成結果。localhost:3010、タブ・ブックマーク・左下の「N」（開発用の表示）が映るので切り出す。生成例のテーマは「モテる方法」（30代・40代の男性向け）
  - `画面収録 2026-10-02 12.51.06.mov`（販売ページ）：48.8秒、2902×1800、可変fps（平均28fps）、音声なし。ファーストビュー（つくる・効率化する・自動化する／Claude Codeを、あなたの道具に）→Claude Codeとは→できる事→身に付く事→初めてでも進められる理由→レッスン内容→学習環境→サポーター→Zoom個別サポート（Premium限定・1年間・50分・最大12回）→一生モノの価値→「できる人に頼む」だけだった側から→料金プラン→よくある質問→フッター。URL欄（ドメイン）・タブ・ブックマークは切り出す。スクロールが速く、Zoomの見出しと料金プランのカードは1秒前後で通り過ぎる
  - 再利用：美容サロンはfree-trialの加工済み素材（`public/free-trial/edit/`）、会員画面・サポーターはLesson 01の素材（courses・lesson01・os-switch・prompt-copy・glossary・claude-supporter-page・claude-supporter-demo）
- 映像：Composition `SalesIntro`（Studioで選べる）。録画を使うシーンはlayout `recording`で、何をいつ見せるかは`src/lessons/sales-intro.ts`の`beats`。要点画面（s07 flow／s12・s13・s19・s21・s22 message／s16 points／s23 end）は`lesson.json`の`visual`。`recording.tsx`に大きな文字の`text` beatと、バッジの指定（`badge`）を追加（free-trialの表示は変わらない）
  - 1 冒頭：free-trialの完成サイト（録画04）→X記事ツールの生成結果（「Claude Codeを使った制作例」）→「つくる　効率化する　自動化する」「Claude Codeを／あなたの道具に」→販売ページのレッスン内容
  - 2 サイト制作：free-trialの完成サイト→指示文（載せる内容・2行目をハイライト）→変更前で店名・ボタン→変更前／変更後の比較→基本の流れ
  - 3 ツール制作（全て「Claude Codeを使った制作例」表示）：入力画面→テーマ・ターゲット欄を拡大→入力と選択を7倍（「早送り」）＋左に「テーマ／届けたい相手／文章のスタイル」→生成ボタン→生成待ち（42.8〜50.6秒）はカットして「待ち時間を省略」→生成結果を拡大。記事テーマ・生成文は録画のまま
  - 4 学び方：会員サイトのレッスン一覧（「会員サイト（受講環境）」）＋「環境の準備／基本操作／指示の出し方／制作と修正」→Mac／Windows切替（「Mac／Windows対応」）→教材の指示文→要点
  - 5 サポート：サポーター案内ページ→Lesson 01のサポーター録画（質問入力→回答冒頭。commit→pushの行は範囲外）→Standard／Premium（全て「Standard・Premium共通：AIサポーター」表示）→販売ページのZoom個別サポートの静止画（「販売ページより」）＋「Premium限定」「１年間・最大12回」、利用条件をハイライト。架空の相談映像は無し
  - 6 締め：完成サイト・X記事ツールと「できる事が増える」→要点カード→「自分で形にできる側へ」→end（「詳しいレッスン内容・料金プランはこのページで」、VOICEVOX:玄野武宏）。価格・期間限定の訴求は無し
- 加工素材（`node scripts/sales-intro/prepare-recordings.mjs [--force]`）：X記事ツールはタブ・URL欄（localhost）・ブックマーク・左下の「N」を、販売ページはタブ・URL欄（ドメイン）・ブックマークを切り出し（サイトのヘッダーは残す）。Lesson 01のサポーター録画も0〜24秒を30fps・無音にコピー。どちらの録画にも個人名・ローカルパスは無くマスクは不要。元の録画は変更しない
- 書き出し（free-trialと同じ方法。Windowsの設定は変えない）：
  1. `npx remotion render src/index.ts SalesIntro <連番フォルダ> --sequence --muted --props='{"withAudio":false}' --image-format=jpeg --jpeg-quality=95`（約15分）
  2. `node scripts/video/encode-mp4.mjs --lesson=sales-intro <連番フォルダ> out/sales-intro/sales-intro-preview.mp4`
- 確認結果（2026-10-02、確認用MP4）：1920×1080・30fps・h264 High yuv420p（bt709）・AAC 48kHz stereo。5591フレーム・3:06.37。ebur128で-16.2 LUFS、LRA 4.4、True Peak -1.6 dBTP（TP目標-1.5で-1.3になったため-1.9で作り直し）。moov→mdat。全6章の代表フレーム（36枚）で字幕の欠け・はみ出し・切り出し漏れが無い事、説明と表示の一致を確認
- 冒頭の修正（2026-10-02、s01-hook）：
  - ホームページ：free-trialの実演サイト（録画04）から、冒頭専用のデモページ`public/sales-intro/demo/lumiere/index.html`に差し替え（白・ベージュ、大きなサロン内装写真、明朝の見出しと余白、濃いブラウンのボタン、ページ内に「※架空の美容サロンのデモページです」）。`node scripts/sales-intro/capture-demo.mjs`でインストール済みのGoogle Chrome（headless、1920×1080・倍率2）で表示して`demo/lumiere-hero.png`（3840×2160）に書き出し、動画では「制作例」ラベル付きで表示。フォントはGoogle Fontsから読むので書き出しにはネット接続が必要
  - 写真：Unsplashの「black and silver office rolling chair beside mirror」（Giorgio Trovato、Unsplash License、商用利用可・クレジット不要）。出典・取得日・確認内容は`public/sales-intro/demo/CREDITS.md`。人物・店名・ロゴは写っていない
  - ツール：生成結果の文章から、X記事ツールの入力画面の静止画（`edit/stills/x-inputs.png`、録画19.3秒：テーマ・ターゲット・目的・文章の雰囲気・記事タイプ）に変更。左に見出し「X記事作成ツール」と「テーマ／ターゲット・目的／文章のスタイル」、画面枠に「Claude Codeを使った制作例」。l001の「自分の」（文の開始+1.58秒）に合わせて+1.45秒から切り替え
  - 後半の実演（2章のfree-trial素材）と完成済みfree-trialの成果物は変更していない。音声・台本も変更なし
- 見出し帯なし（2026-10-02、sales-introだけ）：`registry.ts`の`hideHeader: true`で、左上の講座名と右上の章ラベル（「01　冒頭」等）を全シーンで出さない。内容の領域は上端から字幕帯の上まで（1080−200＝880px。見出し帯ありは784px）になり、`recording`の画面はその高さ（`src/engine/contentArea.ts`の`useContentHeight`）に合わせて縦横比を保ったまま大きくなる（冒頭のホームページは幅約1236→1406px、X記事ツールは約1085→1255px）。字幕帯200pxはそのまま。「制作例」「早送り」「Premium限定」などの画面枠のラベルと、「X記事作成ツール」等の左の見出しは残す。X記事ツールの冒頭画面は左の見出し欄を420pxに狭めて（`side.width`）画面を広げた。Lesson 01・free-trialは`hideHeader`を指定しておらず、表示・寸法は変わらない
- 確認結果（2026-10-02、見出し帯なし・冒頭修正後の確認用MP4）：1920×1080・30fps・h264 High yuv420p（bt709）・AAC 48kHz stereo。5591フレーム・3:06.37（音声186.364秒と一致）。AAC変換後のebur128で-16.2 LUFS、LRA 4.4、True Peak -1.6 dBTP（TP目標-1.5で-1.3になったため-1.9で作り直し）。moov→mdat。全6章の代表フレーム（約50枚）で画像・字幕の切れや重なりが無い事を確認。冒頭の切り替えはMP4の音声で確認：「ホームページや、」の後の無音が1.81〜2.20秒、「自分の」が2.20秒から。ツール画面は2.05秒からフェードし2.32秒に表示完了（無音の間に切り替わる）
- 映像制作に向けたメモ：X記事ツールは制作実績の一例として紹介し、配布特典とは表現しない／Zoomの場面は「Premium限定／１年間・最大12回」と表示／最後の誘導先は販売ページ内の講座詳細・料金プラン／クレジット「VOICEVOX:玄野武宏」

## 依存関係

- `ffmpeg-static` 5.3.0（`--save-exact`）。npm 11の`allowScripts`で許可済み（バイナリのダウンロードに必要）。無い場合は`npm approve-scripts ffmpeg-static`→`npm rebuild ffmpeg-static`
- Remotion 4.0.525（`remotion`・`@remotion/cli`・`@remotion/google-fonts`、React 19.2.3）、TypeScript 5.9.3、ESLint 9.19.0＋`@remotion/eslint-config-flat`。すべて`--save-exact`。esbuildのpostinstallはallowScripts未許可のままだが、Studio・stillは動作確認済み
- Tailwindは使わない（スタイルは`src/theme/tokens.ts`の値をinline styleで使う）

## 映像（Remotion）

- コマンド：`npm.cmd run dev`（Studio。Windowsはnpm.cmd）／`npm.cmd run lint`（eslint＋tsc）／`node scripts/check-display-text.mjs --lesson=01`（字幕の表示と改行、画面文字（`visual`・章タイトル）の読点と表記、`captions.vtt`が表示と一致するかを検査）
- Composition：`L01-Intro`（1920×1080／30fps）。尺は`calculateMetadata`で`narration.json`の`durationSeconds`から決める（固定値を書かない）
- 1920×1080／30fps。**動画本体は黒〜チャコールのダークデザイン**（背景チャコール、見出し白、本文は白〜薄いグレー、補助はグレー、アクセントは青〜水色を少量、カードは濃いグレー、字幕帯は背景より濃い黒・字幕は白）。ネオン・発光・派手なHUDは使わない。過度なアニメーションは使わない。トランジションは短いフェード（`SceneFade`）のみ。色は`src/theme/tokens.ts`の`color`だけで決める
- 会員サイトのスクショ・画面録画は元の白・青系のまま使い、ダーク背景の上にブラウザ風／カード風の枠・余白・控えめな影を付けて置く（`tokens.ts`の`screen`）。動画本体の背景を白・青にしない
- 画面：上に見出し帯（講座名＋章ラベル。title・chapterのシーンでは非表示）、下200pxは字幕専用の帯で、内容は字幕帯に入らない
- BGMは使わない（Lesson 01導入動画）。ナレーションと字幕の聞きやすさを優先する
- 同期：`narration.wav`を1本だけ0秒から再生し、シーン・字幕・要点の表示時刻はすべて`narration.json`の秒数から計算する（台本の文字数から推測しない）
  - シーンは最初の文の0.4秒前から次のシーンの開始まで表示（最初のシーンは0秒から）
  - 字幕は文の開始時刻ちょうどに出し、終了後0.5秒まで（次の文が始まればそこで）残す。開始時刻は動かさない
  - 要点・手順・チップ・吹き出しを読み上げに合わせて出す対応（どの文で何番目を出すか）は`lesson.json`ではなく`src/lessons/registry.ts`の`cues`に書く
  - スクショ・録画の見せ方（素材サイズ、ゆっくりズームする範囲と開始秒、切り出し範囲、録画の再生区間）は`registry.ts`の`shots`に書く。会員サイト素材は`ScreenFrame`（ダークのブラウザ風枠・余白・控えめな影、中身は元の白・青のまま）で表示する。録画は必ずミュート
  - 画面文字（見出し・手順・カード・吹き出し）は`FitText`で字幕と同じ区切りルールで改行し、単語の途中で折り返さない（収まらない名称だけ文字を少し小さくする）。画面文字にも「|」で改行位置を指定できる
  - 和文は`palt`（プロポーショナル字詰め）で表示する（全角カナの前後に空白が見えないように）
- 表示文字の表記（字幕・タイトル・見出し・要点・画面中央のメッセージなど視聴者に見える日本語すべて。`lesson.json`の`text`・`yomi`・音声・`narration.json`・SRTは変えない）：
  - 画面文字は`lesson.json`の`visual`（と章タイトル）に最初からこのルールで書く。字幕は下記`captions.json`で整える
  - 表記の調整は`lessons/lesson-XX/captions.json`の`overrides`（文ID→表示字幕）に書く。無い文は`narration.json`の`caption`をそのまま出す。存在しない文IDや2行（全角50字）を超える字幕は読み込み時にエラー
  - 「、」は表示しない（描画時に取り除く。2行に分ける位置の目印としてだけ使う）。名詞の並びは「・」、動作の並びは全角スペースで区切る。「|」で2行の区切り位置を指定できる
  - 2行表示（`src/components/captionLayout.ts`）：1行は全角25字まで（英字は0.6字として計算）。超えたら意味の区切り（「、」「」」「・」全角スペースの後、「「」の前、ひらがなの後で次が漢字・カタカナ・英字になる所）だけで改行し、その中で元の「、」の位置を優先、次に2行の長さが均等になる位置を選ぶ。英字の名称（Claude Code・Windows等）・漢字語・カタカナ語の途中、ひらがな同士の間（「ます」「です」だけ残さない）、「下さい」「欲しい」の直前では改行せず、2行目を助詞・小さい字で始めない。短すぎる行（全体の35%未満）は他に候補が無いときだけ。各行はブラウザに折り返させない
  - 漢字にできる一般語は読みやすさを損なわない範囲で漢字にする（例：三つ→３つ、こと→事、すべて→全て、つかむ→掴む、ください→下さい、たとえば→例えば、とき→時）。「できる」「ただし」「まず」「このように」などはひらがなのまま
- `narration.json`と`lesson.json`の章・シーン・文（ID・順番・本文）が一致しないと、読み込み時にエラーで止まる（台本を直したら音声を`--force`で作り直す）
- 画面キャプチャはテスト用アカウントで撮り、メールアドレス・氏名・ChatGPTのアカウント名などの個人情報は映さない（またはぼかす）
- 完成MP4の書き出し（`narration.wav`自体は変えない）：
  1. `npx remotion render src/index.ts L01-Intro <中間ファイル>.mp4 --codec=h264 --crf=18 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k`（中間ファイルはout外。Remotionの出力はJPEGフレーム由来でyuvj420p（フルレンジ）になる）
  2. 音量を測る：`ffmpeg -i 中間.mp4 -vn -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -`
  3. 仕上げ（ffmpeg-static）：映像はlibx264 CRF18 preset slow・`scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`＋bt709タグ、音声は2で測った値を入れた2パスloudnorm（I=-16・TP=-1.5）→`aresample=48000`→AAC 192k stereo、`-movflags +faststart`
  4. 確認：`npx remotion ffprobe`で1920×1080・30fps・h264・yuv420p・AAC 48kHz・フレーム数、`ebur128=peak=true`で-16 LUFS前後／True Peak -1〜-2 dBTP、先頭のatomがmoov→mdat（faststart）
  - poster：`npx remotion still src/index.ts L01-Intro out/lesson-01/poster.png --frame=17`（最初の字幕が出る直前のタイトル画面）。`captions.vtt`は`public/lessons/lesson-01/audio/`からコピー
- サポーター録画（`claude-supporter-demo.mp4`）はミュートで使い、「質問する→回答が始まる→1ステップずつ案内される」部分を中心にする。回答中の「ファイルを修正→commit→push」が長く目立つ使い方はしない（本編でpushまで実践すると誤解させない）
