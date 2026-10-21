# talk-subtitle 設計

横長の人物トーク動画の、カット・字幕・書き出し・編集スタイル学習を Claude Code と一緒に「安全に」行う専用ツール。**横長動画専用**（縦型・正方形の動画は解析の時点でエラーで止まる。縦型ショートは別のプロジェクトで扱う）。
最初から完成形を作り込まず、**実際の撮影動画1本で全工程を通し、良かった仕様を後から標準パターンとして固定する**。

- 作成：2026-10-09
- 状態：Phase 1〜3（解析・文字起こし・固有名詞・カット候補と確認・カット・字幕・焼き込みと書き出し）実装済み。Phase 4 は未実装

## 1. 基本方針

1. **元動画は変更・削除しない**。読み取りだけ。sha256 を記録し、変わっていたら止まる
2. **いきなり自動でカットしない**。機械が出すのは「候補」だけで、初期値はすべて「未決定（pending）」
3. **人が承認したものだけを `input/` に置く**（`input/decisions.json`・`input/glossary.json`、将来 `input/subtitles.json`）。機械が作るものは `intermediate/`・`review/`
4. **HTML（細かく確認）とチャット（簡単な承認・修正）のどちらから変更しても、同じ `input/decisions.json` に反映される**
5. **前の段階の指紋を持つ**：候補が作り直されると古い承認は使えない（気付かないまま古い承認でカットしない）
6. **固定値を持たない**：解像度・fps・縦横比・長さ・回転は ffprobe で毎回取得する。表示上の向きが横長でない元動画は扱わない
7. **最初は単純に**：判定ロジックは実動画で必要性を確認してから高度化する

## 2. 置き場所と構成

コード本体は `C:\Users\info\Projects\video\talk-subtitle`（Mac は `~/Projects/video/talk-subtitle`）。動画1本ごとの案件は `projects/<video-id>/`。

```
talk-subtitle/
  CLAUDE.md                  Claude Code 向けの運用ルール
  docs/design.md             この文書
  package.json               依存パッケージなし（Node 22.18 以上、.ts を直接実行）
  src/
    engine.ts                remotion の共通基盤（core/media・core/speech）への唯一の窓口
    paths.ts project.ts      プロジェクトの場所・project.json・安全な書き込み
    config.ts                解析設定（既定値＋案件ごとの input/settings.json）
    analyze.ts               ffprobe（回転を含む）・音声抽出・ラウドネス・無音検出・確認用プロキシ
    stt.ts                   文字起こしの backend 切り替え（auto／whisper-cpp／faster-whisper）
    transcript.ts            transcript.json の型（どの backend でも同じ形式）
    glossary.ts              固有名詞辞書（2層）・Whisper prompt
    terms.ts                 固有名詞の補正候補・承認済み補正の適用
    candidates.ts            カット候補
    decisions.ts             承認ファイル（HTML／チャット共通）
    review.ts                確認用 HTML
    text.ts                  文字列の正規化・時刻の対応・類似度
    cli.ts                   引数の解析・エラー表示
  scripts/                   CLI の入口（npm run <名前>）
  python/                    fw_transcribe.py（faster-whisper の実行部分）・requirements.txt
  .venv/                     faster-whisper 用の Python 環境（Git 管理外。npm run setup-faster-whisper で作る）
  .local/models/             faster-whisper のモデル（Git 管理外、large-v3-turbo 約1.6GB）
  _shared/
    glossary.json            共通の固有名詞辞書
    subtitle-presets/        字幕デザインの preset（default.json。良い形が決まったら pattern-01.json として固定）
  projects/                  Git 管理外（.gitignore）
    <video-id>/
      project.json
      input/                 元動画・glossary.json・decisions.json・settings.json（人が置く／承認したもの）
      audio/                 source-16k.wav（解析・文字起こし用）
      intermediate/          probe.json・loudness.json・silences.json・transcript.json・term-candidates.json・
                             transcript.corrected.json・cut-candidates.json・review-proxy.mp4
      review/                review.html
      output/                完成動画（Phase 3）
```

- remotion 側の動画タイプ名 `human-video-editor` は `project.json` の `type` に互換のため記録するだけ。作業フォルダ名は `talk-subtitle` で統一する
- remotion の `src/core/` は **コピーせず import する**（`src/engine.ts` の1か所だけ。`../../remotion` の位置関係が前提）。FFmpeg・ffprobe・whisper.cpp（`remotion/.local/whisper.cpp`）のパス解決も remotion 側の仕組みを使う
- remotion の `video:new-project`／`video:cleanup` の管理対象ではない（独自の `projects/`）。汎用化できた部品は後で remotion の `src/core/` へ移す

## 3. 制作フロー

```
元動画（input/ に置く）＋ 固有名詞（自然な文で指示 → Claude が整理 → 確認 → glossary.json）
 ↓ npm run analyze      probe・音声抽出・ラウドネス・無音検出・（必要なら）確認用プロキシ
 ↓ npm run transcribe   Whisper（Windows: faster-whisper／Mac: whisper.cpp。glossary から作った prompt を渡す）
 ↓ npm run terms        glossary による固有名詞の補正候補 → transcript.corrected.json
 ↓ npm run candidates   カット候補（無音・フィラー・言い直し・撮り直し・不明瞭）
 ↓ npm run review       review/review.html
 ↓ 【ユーザーが確認】HTML または チャット → npm run decide → input/decisions.json
 ↓ (Phase 2) npm run cut      承認済みのカット → intermediate/cut.mp4・timemap.json（まずは低解像度のプレビュー）
 ↓ (Phase 3) npm run subtitles 補正後の文字起こし＋timemap → 字幕案
 ↓ 【ユーザーが確認】字幕の修正（HTML／チャット）→ input/subtitles.json
 ↓ (Phase 3) npm run render    Remotion で字幕・テロップを焼き込み → output/final.mp4
```

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 案件の作成・解析・文字起こし・固有名詞（辞書・prompt・補正候補）・カット候補・確認（HTML／チャット） | **実装済み** |
| 2 | 承認の検証・カットのプレビュー・本番のカット・timemap | **実装済み** |
| 3 | 字幕の生成・確認・Remotion での焼き込み・書き出し（YouTube 向けに -14 LUFS） | 実装済み（字幕案・確認・デザイン確認・焼き込み・最終書き出し） |
| 4 | テロップ、高度な補正（kuromoji・モーラ単位の編集距離）、自動採用ルール、複数人・複数カメラ | 未実装 |

## 4. 解析（Phase 1）

- `intermediate/probe.json`：コーデック・保存上の解像度・**回転（Display Matrix／rotate タグ）**・**表示上の解像度**・fps・縦横比（`16:9` など）・向き・長さ・音声の情報。スマホ撮影の動画は回転の情報つきで保存されていることがあるので、表示サイズは回転を考慮して決める
- 横長の確認：`npm run analyze`（`phase1`）は元動画を登録する前に向きを確かめ、表示上の向きが横長でなければ「talk-subtitle は横長動画専用です。…縦型ショートは別のプロジェクトで扱ってください。」で止まる（`assertLandscape`。project.json には何も記録しない）
- `audio/source-16k.wav`：16kHz・モノラル（無音検出・文字起こし用）
- `intermediate/loudness.json`：EBU R128 と平均・最大音量
- `intermediate/silences.json`：無音区間。しきい値は固定せず、平均音量から決める（`平均音量 - 14dB` を -50〜-30dB の範囲に収める）。`input/settings.json` で上書きできる
- `intermediate/review-proxy.mp4`：ブラウザで再生できない元動画（HEVC など）のときだけ作る、確認用の軽い H.264（回転は反映済み）。元動画とは別ファイル

## 5. 固有名詞（glossary）

### 5.1 2層の辞書

- 案件専用：`projects/<video-id>/input/glossary.json`
- 共通：`_shared/glossary.json`
- 合わせて使う。同じ正式表記が両方にあれば案件側を優先する

```jsonc
{
  "version": 1,
  "entries": [
    {
      "id": "person-kitaoka-daiki",     // 自動で付ける
      "surface": "北岡大樹",            // 正式表記
      "readings": ["きたおかだいき"],    // 読み（ひらがな。空白・カタカナは自動で正規化）
      "readingConfirmed": true,         // 読みを人が確認したか（false の間は読みでの補正候補を出さない）
      "kind": "person",                 // person|company|store|product|place|term|english|other
      "aliases": ["北岡さん"],           // 正しい別表記（補正しない）
      "misrecognitions": ["北丘大気"],   // 確認済みの誤認識（候補として「採用」が初期値になる）
      "contextHints": ["代表"],          // 将来の文脈判定用（Phase 1 では表示のみ）
      "matchPolicy": "auto",            // auto | suggest-only（suggest-only は初期値を必ず未決定にする）
      "note": "話し手本人",
      "source": "user-instruction",     // user-instruction | manual | learned-from-review
      "addedAt": "2026-10-09T…"
    }
  ]
}
```

### 5.2 自然な文の指示から登録する

例：「今回の人物名は北岡大樹。読みは、きたおか だいき。専門用語は Claude Code と Remotion。」

1. Claude が文を解析し、登録案を表で見せる（正式表記・種別・読み・別表記・誤認識されやすい形の案）
2. **人名など、読みが決まらない漢字は必ず確認する**（大樹＝だいき／たいき／ひろき）。確認できなければ `--reading-unconfirmed` で登録し、読みでの補正には使わない
3. 承認されたら `npm run glossary -- add …` で登録する（Claude が JSON を直接書き換えない。CLI が検証・重複確認・差分表示を行う）
4. 「いつも使う」語は `--shared` で共通辞書へ

### 5.3 使う場所

1. **Whisper の前**：正式表記を「、」で並べた prompt（案件 → 共通の順、最大 200 文字）を whisper.cpp の `--prompt` に渡す
2. **Whisper の後**（`npm run terms`）：補正候補を出す。**全置換はしない**。Phase 1 の判定は次の4種類だけ

| 種類 | 条件 | 初期値 |
|---|---|---|
| `misrecognition` | 確認済みの誤認識と完全一致 | 採用（`suggest-only` なら未決定） |
| `case-variant` | 英字の正式表記と、大文字小文字・空白・ハイフン・中黒だけが違う（`claude code`→`Claude Code`） | 未決定 |
| `reading-kana` | 読みがそのままひらがな／カタカナで出ている（`くろーどこーど`・`クロードコード`）。読みが3文字未満、または未確認なら出さない | 未決定 |
| （一致） | 正式表記・別表記がそのまま出ている | 補正しない（件数だけ報告） |

- 正式表記・別表記の内側に重なる一致は無視する（「北岡」が「北岡大樹」の一部である場合など）
- 補正後のテキストは `intermediate/transcript.corrected.json`。補正前の `transcript.json` は残す。時刻は変えない（置き換えた範囲の時刻をそのまま使う）
- 補正はテキストだけで時刻を変えないので、**辞書を後から直してもカットの承認は無効にならない**
- 字幕の確認で固有名詞が直されたら、「誤認識として辞書に追加しますか？」と提案する（Phase 3）

## 6. カット候補（Phase 1）

`intermediate/cut-candidates.json`。各候補は `{id, kind, start, end, confidence, suggestion: cut|review, reason, text, context}`。元にした文字起こし・無音・元動画の指紋を持つ。**カット候補は補正前の文字起こしから作る**（辞書の変更でカット候補の ID が変わらないようにするため）。

| kind | 検出方法 | 提案 |
|---|---|---|
| `silence` | **単語と単語の時刻の隙間**（既定 0.7秒以上、冒頭・末尾を含む）のうち、音量（WAV から直接測る RMS）が話し声より 15dB 以上小さいもの。前後に余白（既定 0.2秒）を残す | cut |
| `filler` | えー・えっと・うーん・あのー など。あの・その・まあ は普通の言葉でもあるので確認だけ | cut／review |
| `restart` | 同じ語句（3文字以上、または「、」を挟んだ2文字）が続けて繰り返される。前の方を削る | cut |
| `retake` | 隣り合う文がよく似ている、または前の文が次の文の書き出しと同じ。**後のテイクを残す** | cut |
| `correction-marker` | 「じゃなくて」「言い直し」「もう一回」「失礼しました」など | review |
| `unclear` | 確からしさが低い文／単語の隙間なのに音がある（話し声との差が 15dB 未満）区間 | review（削る提案はしない） |

Whisper はフィラーを文字に起こさないことがあるので、`unclear`（声はあるのに文字が無い）も見る。

**実動画での調整（2026-10-09、最初の実案件）**：最初は ffmpeg の silencedetect で間を探していたが、実際の撮影では小さな物音（クリック音・息）で無音が途切れ、間の大半を拾えなかった（67区間・26.7秒のみ。その分「声はあるのに文字が無い」が117件に増えた）。単語の隙間＋区間の音量で判定する方式に変更し、無音・間 64件（190.7秒）／不明瞭 21件になった。`silences.json` は参考情報として残す。

## 7. 確認と承認（HTML／チャット共通）

### 7.1 承認ファイル `input/decisions.json`

```jsonc
{
  "version": 1,
  "project": "sample-video-01",
  "cuts":  { "candidatesFingerprint": "…", "items": { "c3": { "decision": "keep", "by": "chat", "at": "…" },
                                                      "c4": { "decision": "cut", "start": 12.3, "end": 13.1, "by": "html", "at": "…" } } },
  "terms": { "candidatesFingerprint": "…", "items": { "t1": { "decision": "accept", "replacement": "Claude Code", "by": "chat", "at": "…" } } },
  "history": [ { "at": "…", "by": "chat", "summary": "keep c3,c7; cut rest" } ]
}
```

- 候補を作り直して指紋が変わると、古い承認は読み込まない（`npm run status` が「作り直し後の承認が必要」と表示する）
- 決定は1件ずつ記録し、いつ・どちらから変更したかを `history` に残す

### 7.2 チャット

「c3 と c7 は残す、それ以外はカット」→ Claude が次を実行する：

```
npm run decide -- --project=<id> --keep=c3,c7 --cut-rest
npm run decide -- --project=<id> --range=c4:12.30-13.10       # 範囲の調整
npm run decide -- --project=<id> --accept-term=t1 --reject-term=t2 --term-text=t3:"Claude Code"
```

`decide` は承認ファイルを更新したあと、`transcript.corrected.json` と `review.html` を作り直す。

### 7.3 HTML（`review/review.html`）

- 映像を見ながら、候補ごとに「前後を再生」「採用／残す／未決定」「開始・終了の調整（現在位置で設定）」
- 「カットを適用して再生」：カットに決めた区間を飛ばして再生し、つながりを確認する
- 固有名詞の補正候補（変更前→変更後、置き換え文字の編集）と全文（クリックでその位置へ移動）
- 「承認内容を書き出す」→ JSON をダウンロード → `npm run decide -- --project=<id> --import=<ファイル>` で取り込む（指紋が一致しなければ拒否）。途中の状態はブラウザに一時保存する

## 8. 字幕デザイン（Phase 3 で使う。preset は先に用意）

`_shared/subtitle-presets/default.json`（仮の default）。character-news の字幕とは別物。

- 白・太字・黒の縁取り（半透明の背景に切り替え可）・画面の下部・2行以内・スマホで読めるサイズ
- サイズ・位置は**画面の短辺に対する比率**で持つ（解像度が違っても同じ preset が使える）
- フォント・サイズ・色・位置・縁取り・背景・改行（1行の最大文字数・行数・分割位置）・強調表示を設定で変えられる
- 案件ごとの上書きは `input/subtitle-style.json`。実際の動画で調整して良かったものを `_shared/subtitle-presets/pattern-01.json` として固定する

## 9. 今後拡張するときの方針

- 複数人：文字起こしのセグメントに `speaker` を後から足せる形にする（話者分離は Phase 4 以降）
- 複数カメラ・複数の元動画：`project.json` の `source` を配列に拡張する（Phase 1 は1本）

## 10. 動作確認と環境の制約（2026-10-09）

### 確認したこと
- 型チェック（`npm run typecheck`）が通る
- 合成のテスト動画（30fps・87.5秒、remotion の youtube-test-05 のナレーションを使用）で確認：
  - 解析：解像度・縦横比・向き・fps・長さを ffprobe から取得、無音しきい値の自動決定（-41dB）
  - 元動画を差し替えると `--replace-source` なしでは止まる。テスト後も元動画の sha256 は登録時と同じ
  - 固有名詞：辞書の登録・追記・エラー、Whisper prompt、補正候補（確認済みの誤認識・表記ゆれ・かなの読み）、補正の反映
  - カット候補（無音・フィラー・言い直し・撮り直し・訂正の言葉・不明瞭）、チャットでの承認（keep／cut-rest／range／term／dry-run／各種エラー）
  - 候補を作り直すと、古い承認があれば `--force` なしでは止まり、承認時は `--discard-stale` が必要（破棄した承認は history に残る）
  - review.html の表示・操作 → 書き出し → `--import` で同じ decisions.json に反映
- **文字起こしは、実際の Whisper では未確認**（下記の理由。テストでは SRT から作った代わりのデータを使った）

### Smart App Control
この PC は Smart App Control（アプリ制御）が有効で、署名・評判の無い exe が起動できない。
- ffprobe（remotion 同梱）→ winget の `Gyan.FFmpeg` を導入し、ユーザー環境変数 `FFPROBE_PATH` で指定して解決
- whisper.cpp（`whisper-cli.exe`）・PyAV の DLL → ブロックされる。Windows の文字起こしは faster-whisper（PyAV を読み込まない形）で行う（11章）。**Smart App Control の設定は変更しない**（ユーザーの方針）

## 11. 文字起こしの backend（2026-10-09）

| backend | 使う場面 | 実体 |
|---|---|---|
| `auto`（既定） | Windows → faster-whisper、Mac など → whisper-cpp | — |
| `faster-whisper` | Windows の標準 | `.venv` の Python 3.12 ＋ faster-whisper 1.2.1（ctranslate2）。`python/fw_transcribe.py` を `python -I` で実行 |
| `whisper-cpp` | Mac の標準 | remotion の `src/core/speech`（whisper.cpp 1.9.2）。この Windows PC では Smart App Control にブロックされる |

- 指定方法：`npm run transcribe -- --project=<id> --backend=…`（phase1 も同じ）、または案件の `input/settings.json` に `{ "transcribe": { "backend": "faster-whisper" } }`
- 共通：モデル `large-v3-turbo`、言語 `ja`、glossary から作った prompt（faster-whisper は `initial_prompt`、whisper.cpp は `--prompt`）。入力はどちらも `npm run analyze` が ffmpeg で作った `audio/source-16k.wav`（元動画には触れない）。完全ローカル（faster-whisper はモデルの初回ダウンロードだけ通信）
- faster-whisper の既定：CPU・`compute_type=int8`・6スレッド・beam_size 5（`input/settings.json` の `transcribe.fasterWhisper` で変更可）。i5-9400 で 25 秒の音声が約 13〜20 秒
- 導入：`npm run setup-faster-whisper`（Python は `winget install --id Python.Python.3.12 -e --scope user`。`.venv` 作成・requirements 導入・モデル取得。何度実行しても安全）。確認：`npm run doctor`

### PyAV を使わない理由と方法
- Smart App Control が PyAV の DLL をブロックする（設定は変えない方針）。ctranslate2・onnxruntime・tokenizers・numpy は問題なく動く
- faster-whisper が PyAV を使うのは、音声ファイルを読む `decode_audio()` だけ。talk-subtitle は faster-whisper にファイルを渡さず、`audio/source-16k.wav` を Python 標準の `wave` で読んで float32 の配列で渡す
- `fw_transcribe.py` は `main()` の最初に `sys.modules["av"]` へ代わりのモジュール（`_PyAVNotUsed`）を登録し、本物の PyAV を一度も読み込まない（読み込もうとするだけでブロック通知が出るため）。faster-whisper 本体（site-packages）は変更しない
- 毎回の結果で「代わりのモジュールが有効だったこと」と「送った prompt が届いたこと」を Python から返し、Node 側で照合する（違えばエラー）

### transcript.json の互換性
- remotion の Transcript（schemaVersion 1）と同じ形式。違いは `engine` だけ：`name`（`whisper.cpp`／`faster-whisper`）・`wordTimestamps`（`token`／`word`）、追加の `backend`・`backendReason`・`device`・`computeType`・`threads`・`beamSize`・`runtime`
- 後工程（固有名詞の補正・カット候補・字幕）は `language`・`source`・`text`・`segments` だけを読むので、backend によって処理は変わらない
- faster-whisper の単語は 1〜3 文字程度で、句読点は直前の語に付く（例：`しました。`）。whisper.cpp のトークンと同じく、文字を連結すると文の文字列になる

## 12. Phase 2：カット（2026-10-09 実装）

`npm run cut -- --project=<id> [--dry-run] [--force]` → `intermediate/cut-preview.mp4`（軽量：短辺 540px・CRF 28）
`npm run cut -- --project=<id> --final [--force]` → `intermediate/cut.mp4`（元の解像度・CRF 18。プレビュー確認後に実行。`output/final.mp4` は Phase 3 で作る）

### 実行前に止まる条件
- 元動画の sha256 が登録時と違う（毎回ファイル全体を計算し直す）
- `cut-candidates.json` の内容が自分の指紋と合わない／`decisions.json` の承認が今の候補に対応していない／候補が今の元動画から作られていない
- 未決定の候補が1件でもある
- フレームに合わせたあとの長さが、承認から計算した見込みと 0.5秒以上違う

### カットの方法（ffmpeg 1回で処理し、区間ごとのファイルは作らない）
- 元動画は可変フレームレート（フレームの間隔が 15.0〜18.3ms）なので、固定の fps を前提にしない。ffprobe で全フレームの時刻を取り、カットの境目を一番近いフレームの時刻に合わせる
- 映像：`select` で残す区間のフレームだけを通し、`setpts` で各フレームの時刻から「それより前に削った合計時間」を引く
- 音声：元の音声を 48kHz PCM に展開し、映像と同じ区間表を使ってサンプル単位でつなぐ。つなぎ目ごとに 8ms のフェードイン・アウトを入れてプチノイズを防ぐ。その後 AAC にして映像と合わせる。映像と音声が同じ区間表を使うので、つなぎ目が増えてもずれが積み重ならない
- 回転：ffmpeg の自動回転で、読み込んだフレームを正しい向き（今回は 180°）にしてから書き出す。出力には回転情報を残さない
- 書き出しは一時ファイルに行い、次の確認がすべて通った場合だけ本来の名前に変える。失敗したときは `*.failed.mp4` と `*.report.json` を残して止まる
  - フレーム数が予定と一致する
  - 映像と音声の長さが予定から 0.05秒以内
  - 回転 0° で、表示上の解像度が元と同じ
  - 音声：8か所で元の音声と相関を取り、ずれが 10ms 以内・相関 0.8 以上
  - 映像：5か所で元の同じ時刻のフレームと比べる（話している人の映像では前後のフレームとの差が出にくいので、参考値。主な根拠はフレーム数の一致）

### timemap.json
- `segments`：残した区間。`srcStart`／`srcEnd`（元の時刻、どちらも実在するフレームの時刻）、`outStart`／`outEnd`（カット後の時刻）、`frames`
- `removed`：削った区間と、その原因になった承認済み候補の ID
- `source`（ファイル・sha256・長さ・フレーム数）、`candidatesFingerprint`、`decisionsFingerprint`（承認したカット範囲の指紋）、`outputDurationSeconds`、`outputFrames`
- 変換：元の時刻 → カット後の時刻（削った区間なら null）、カット後の時刻 → 元の時刻（`src/cut.ts` の `srcToOut`／`outToSrc`）。字幕（Phase 3）は単語の時刻をこれでカット後の時刻に変換する

### 最初の実案件での結果
承認 98件（重なりをまとめて削る区間は 97個、残す区間は 96個）。593.032秒 → 367.216秒（見込み 367.320秒、差 0.10秒）。フレーム 22032／予定 22032。境目のフレーム合わせは最大 8.3ms。180° 回転は正しく直り、出力の回転は 0°。音声 8か所のずれは 0〜0.1ms（相関 0.99 以上）

**不具合と修正（2026-10-09）**：フレーム時刻の一覧を読むとき、ffprobe の出力の最後の空行を `Number("")`＝0 として読み込み、t=0 のフレームが1つ余分に入っていた。そのせいで、フレームを選ぶ判定の許容幅が 0 になり、境目の時刻（小数6桁に丸めた値）と ffmpeg 内部の正確な時刻の差で、前の区間のフレームが1枚入り、次の区間の先頭フレームが1枚抜けることがあった。確認処理のフレーム数も1多く数えていたため、1回目のプレビュー（承認98件の時点）は確認を通っていたが、実際には境目で1フレームのずれがあった。空行を読み飛ばすように直し、許容幅に下限（2ms）を設け、確認項目に「同じ時刻のフレームが無いこと」を追加した。あわせて、出力の映像の時刻の単位を元動画と同じにした（`-enc_time_base:v demux`）。修正後のプレビュー（承認140件）：フレーム 20107／予定 20107、同じ時刻のフレーム 0、335.133秒

## 13. 読み上げ部分（元投稿）を字幕の正解にする（2026-10-09）

撮影中に SNS の投稿などを読み上げている部分は、Whisper の文字起こしより**元の投稿本文を正解**として字幕を作る。

- 投稿本文は案件ごとに `input/quotes.json` に登録する（`npm run quotes -- add --project=<id> --id=… --author=… --line="…"…`）。ユーザーが投稿画像で確かめた文面だけを入れる
- `npm run quotes -- align --project=<id>`：投稿の1行ごとに、文字起こしの中で読み上げている場所を探し、`intermediate/quote-alignment.json` に書き出す
  - 補正後と補正前の両方の文字起こしで照合し、よく一致したほうを使う（辞書の補正 たろう→太郎 が、投稿のかな表記「たろう」を隠すことがあるため）
  - 文字の Dice 係数で一番近い範囲を探す。投稿の先頭や末尾が一致しない場合（漢字とかなの違い：港町辺り↔みなとまちあたり）は、句読点・文の区切りまで範囲を広げる
  - 判定：`same`（句読点以外は一致）／`use-quote`（2文字以内の違い。誤認識の可能性 → 投稿の表記を採用する案）／`review`（3文字以上の抜け・追加。省略・言い換えか誤認識かを音声で確認）。見つからない行は「読み上げていない」として字幕に追加しない
- Phase 3 の字幕では、照合済みの範囲の文字を投稿の表記に置き換える（`review` は人が決めた表記）。投稿にあって読んでいない部分は入れず、話し手が省いた・言い換えた所は話した内容に合わせる。辞書の補正と食い違う場合は、照合済みの範囲では投稿の表記を優先する
- ユーザーの判断は `input/quotes.json` の `decisions` に記録する（`npm run quotes -- decide --project=<id> --line=<投稿ID>:<行番号>[,…] --use=post [--flag="…"] [--at=<元の秒>]`）。行は本文で紐づけるので、行の並べ替え・追加では消えない
  - `--flag`：投稿の表記を採用しつつ要確認を残す（例：「最初に」↔「最初は」のように、話し手の言い換えの可能性がある所）。Phase 3 の字幕確認で目立たせる
  - 短い行（「たろうさん」）が長い行の範囲に含まれる場合は `coveredBy` を付け、長い行の判断に従う
  - 照合結果の各行に `state`：`resolved`（一致・判断済み）／`flagged`（採用・要確認）／`pending`（未決定）。Phase 3 は `pending` が残っていれば字幕を確定しない
- 投稿画像そのものは保存しない。画像で読める範囲だけをユーザーがテキストで渡し、写っていない部分を推測で補わない

## 14. Phase 3：字幕案（2026-10-09 実装。焼き込みはまだ）

`npm run subtitles -- draft --project=<id>` → `intermediate/subtitles.draft.json` と `review/subtitles.html`

- 実行前に止まる条件：timemap.json が今のカット承認から作られていない／cut.mp4（本番）が timemap とフレーム数・長さで一致しない／cut.report.json に問題がある／元動画が変わっている
- 字幕の元：`transcript.corrected.json`（辞書の補正済み）の語ごとの時刻を timemap で cut.mp4 の時刻に移す
  - 語の時刻の半分以上がカット範囲なら、その語は字幕に入れない（`dropped` に記録）
  - Whisper が1語に 1.2 秒以上の時刻を付けた場合（間を含んでしまう）、声は後ろ（または前）にあるとみなし、残した区間側に時刻を詰めて判定する（例：「元」に 7.7 秒）。辞書の補正でまとめた語（probability が null）は対象外
- 読み上げた投稿：照合済み（確定・採用要確認）の行は、その範囲の語を投稿の表記1つにまとめて置き換える。投稿行に句読点が無ければ、話した文末の 、。 を残す。`coveredBy`（長い行の中の短い行）は長い行に従う
- 字幕の区切り：文末（。！？）・0.6 秒以上の間・投稿の行の境目で区切る。1行分を超えて読点で終わるところでも区切る。長すぎる（2行×1行の文字数の 90%）・長く出すぎる（maxDisplaySeconds）場合は、最後の読点（無ければ助詞）の後ろで分ける。語の途中では分けない
- 改行：読点 → 助詞・ひらがなから漢字/カタカナに変わる所 → 語の境目、の順に優先し、2行の長さをそろえる。送り仮名の途中（戻|って）・複合語の途中（取り|出す）は避ける。行の中の 、 は全角スペース、字幕の終わりの 、。 は付けない（preset の `layout.commaStyle`）
- 表示時間：話し終わりから最大 0.3 秒残す・次の字幕との 0.15 秒以下のすき間は詰める・最短 0.8 秒
- 要確認（`review: true`）にするもの
  - 元投稿の表記を採用しつつ要確認を残した行（`quotes -- decide --flag`）、投稿行の一部がカット範囲にある行
  - 直前・直後の語（フィラー・1文字のかな以外）がカットされている字幕（文のつながり）
  - 一部がカット範囲にかかる語のうち、切った部分の音量が話し声 −12dB より大きいもの（無音の余白だけ切った語は対象外）
  - Whisper の確信度 0.3 未満の語（あいづち・辞書の固有名詞の中の文字は除く）
  - 2行・1行の文字数に収まらない字幕
- ユーザーの修正は `input/subtitles.json`（`edits`：字幕 ID ごとの text／deleted／ok と、元の案の文字）。字幕案を作り直したときは、同じ ID で文字が同じか、同じ文字の字幕が1つだけある場合に引き継ぎ、引き継げない修正は表示する
  - チャット：`npm run subtitles -- edit --project=<id> --cue=s012 --text="…"`（改行は `\n`）／`--delete`／`--ok`／`--reset`
  - HTML：review/subtitles.html で修正 → 書き出し → `npm run subtitles -- import --project=<id> --file=…`
  - 承認：`npm run subtitles -- approve`（要確認がすべて確認OK・修正・削除になっているときだけ）。焼き込み（Remotion → output/final.mp4、-14 LUFS）は承認後の次の段階

### 14.1 字幕デザインの確認（静止画）

`npm run subtitle-stills -- --project=<id> [--cues=s010,s002,s044,s056]` → `review/subtitle-design/*.png`・`sheet.png`（2×2）

- cut.mp4 から ffmpeg でフレームを取り出し、Remotion（`talk-subtitle/remotion/` の `Subtitle` コンポーネント。最終レンダリングでも同じものを使う）で字幕を重ねて PNG にする
- Remotion のパッケージ・headless Chrome は `../../remotion` にあるものを Node API（`src/render.ts`）で使う。remotion.config.ts（Rspack・Tailwind）は使わず、webpack + esbuild（この PC の Smart App Control で動く）
- 縁取りは文字の後ろに別の層として描く（文字そのものに stroke を付けると線の内側が細る）
- `remotion/` は別の tsconfig（JSX・react の型を remotion の node_modules から）。`npm run typecheck` で両方を確認する
- 比較案：`--variant=<name>` で `review/subtitle-design/<name>/style.json` を preset に重ねて描き、default の同じ場面と左右に並べた `compare-<name>/`（場面ごと・`all.png`）を作る。正式設定（`input/subtitle-style.json`）は変えない
- 改行の方針 `layout.lineBreak`：`"chars"`（既定。字幕案の改行＝1行 maxCharsPerLine 文字）／`"fit-width"`（1行が基本。字幕全体を1行にして最大幅 `position.maxWidthRatio` に収まれば必ず1行、収まらない時だけ2行。3行以上は不可でエラー）
  - 幅は文字数ではなく、描画と同じ headless Chrome で実際の文字幅を測る（`measureTextEm`、縁取りの幅も含める）
  - 1行にする時、改行の位置で話し言葉に読点があった所は全角スペースを入れる（行の中の読点と同じ扱い）
  - 2行になる字幕は、承認済みの改行位置で両行が収まればそのまま使い、収まらなければ幅に合わせて改行し直す
  - 承認済みの字幕の文言・タイミングは変えない（表示の改行だけ）。結果は `<出力先>/layout.json`（字幕ごとの行・1行時の幅・2行の理由）
- `--out=<folder>`：任意の字幕（例：新しく1行になった字幕）を `review/subtitle-design/<folder>/` に出す。sheet.png は2列で ID・時刻付き

### 14.2 確認動画（焼き込みの短い区間）

`npm run subtitle-clip -- --project=<id> [--from=秒 --to=秒]` → `review/subtitle-clip-<開始>-<終了>.mp4`

- 承認済みの字幕（`src/burn.ts` の `approvedBurnCues`）を、案件の設定（`input/subtitle-style.json`）でレイアウトして焼き込む。未承認なら止まる。最後の字幕の終わりは動画の長さで切る
- 字幕ごとに Remotion（`SubtitleOverlay`）で透明 PNG を1枚描き、ffmpeg の overlay を字幕の時間だけ有効にして cut.mp4 に重ねる（H.264 CRF 18＋AAC）。Remotion の動画書き出し（同梱 ffmpeg）は使わない
- 区間の指定が無ければ、1行と2行の字幕が両方入る 10〜15 秒（字幕の途中で始まらない・終わらない）を選ぶ
- output/final.mp4 は作らない

### 14.3 最終書き出し（output/final.mp4）

`npm run render -- --project=<id> [--force]` → `output/final.mp4`・`output/final.report.json`

- 前提：元動画が登録時のまま（sha256）、cut.mp4 が今の承認から作られている（timemap）、字幕が承認済み
- 字幕は 14.2 と同じ方法（字幕ごとの透明 PNG を ffmpeg で重ねる）で全編に焼き込む。cut.mp4 をシークせずに読み、`-fps_mode passthrough` でフレームの時刻をそのまま保つ
- 音量：cut.mp4 を測ってから loudnorm（測定値を渡す2パス）で -14 LUFS・true peak -1.5 dBTP に合わせる。一定のゲインで true peak が上限を超える時（例：-29.3 LUFS・-6.86 dBTP → +15.3 dB 必要）は loudnorm が自動で dynamic（ピークを抑えながら合わせる）になる。AAC 192kbps・48kHz
- フレームの時刻：エンコーダーの時刻の単位を入力に合わせる（`-enc_time_base:v demux`）。合わせないと 1/60 秒に丸められ、cut.mp4 の不均一な時刻（iPhone 由来）で同じ時刻のフレームができる
- 一度 `final.partial.mp4` に書き、検証がすべて通った時だけ `final.mp4` にする。検証：1920×1080・回転なし、フレーム数と長さが cut.mp4 と同じ、映像と音声の開始時刻、ラウドネス（±0.5 LU）と true peak（≤ -1.0 dBTP、ebur128）、音声を timemap 経由で元の音声と相互相関（10か所・±10ms）、映像を cut.mp4 と比較（字幕より上の部分）、全字幕が画面に出ているか（各字幕の中央で下部が cut.mp4 と違う）、全フレームのデコード、元動画の sha256

## 15. 編集スタイルの学習（2026-10-17、S1・S2 実装）

ユーザーの編集判断を動画ごとに記録し、何本分かを比べて「ユーザー専用の編集スタイル」として蓄積する。Claude 自体の再学習ではない。**観察 → 比較 → ルール案 → ユーザーの承認 → 使う**の順で、承認していないルールは使わない。

### 全体（予定）

| 段階 | 内容 | 状態 |
|---|---|---|
| S1 | talk-subtitle で作った案件から、1本分の判断を `style-data/observations/<id>.json` に記録（`npm run style -- observe`） | **実装済み** |
| S2 | 元動画＋完成動画（どの編集ソフトでもよい）＋任意の SRT から、カットの範囲を逆に求める（reconstruct）→ 同じ形の観察 | **実装済み**（カットの復元のみ。SRT は登録だけ） |
| S3 | SRT がある時は字幕の傾向・修正も観察 | 未実装 |
| S4 | 観察を比べてルール案（確信度つき）、確認画面、承認 → `_shared/style/profile.json`、候補の初期値への反映と一致率の記録 | 未実装 |

- **talk-subtitle は横長動画専用**。学習の対象は、横長の元動画＋ユーザーが編集した横長の完成動画＋（任意で）SRT。scope は `landscape` だけ
- 縦・正方形の動画は拒否する（元動画・完成動画のどちらかが横長でなければ `reference analyze` が登録の前に、`style observe` も、エラーで止まる）
- **ルールの状態**：`observed`（1〜2本。捨てずに蓄積）→ `proposed`（3本以上・一致率 0.8 以上。初期値）→ `confirmed`（**ユーザーが承認したものだけ**）→ `retired`
- 新しい動画で反対の傾向が出ても自動で消さない。「矛盾あり」「例外候補」「scope の違い」として再評価して見せる

### 置き場所

- コード：`src/style/`（`observation.ts` 型・`observe.ts` 観察・`subtitleDiff.ts` 字幕修正の分類・`reconstruct.ts` カットの復元・`audioMatch.ts` 音声の照合・`report.ts` 表示）、`src/reference.ts`、`scripts/style.ts`・`scripts/reference.ts`
- データ：`style-data/`（**Git 管理外**。実案件の発話・人名・投稿本文を含むため）。学習に使うのは `style-data/observations/` だけ。検証用の結果は `style-data/trials/` に分ける。検証用の案件は `project.json` の `learning: { exclude: true, reason }` で observe が止まる。承認済みルール（数値と条件だけ）は S4 で `_shared/style/profile.json`（Git 管理）

### S1：観察（`npm run style -- observe --project=<id> [--no-examples] [--dry-run]`）

案件のファイルは読むだけで、何も書き換えない。候補の作り方・設定・承認も変えない。

各イベントは `features`（文脈。数値と分類だけで発話の文字は入れない）・`outcome`（判断・結果）・`example`（実際の文字。`--no-examples` で省く）に分ける。

| type | 元のデータ | 記録すること |
|---|---|---|
| `cut-candidate` | cut-candidates.json＋decisions.json | 種類・提案（cut／review）・確信度・言い直しの型・位置、判断、提案どおりか、範囲の調整 |
| `pause` | transcript.json＋timemap.json | 完成動画に残った前後2語の間：元の長さ・削った秒数・間の語数・境目（文末／読点／文の区切り／句の途中）→ 残した長さ、`kept`／`trimmed`／`joined`、ツールの余白で決まったか（`provenance`） |
| `filler` | transcript.json＋timemap.json＋字幕 | ツールのフィラー一覧（strong／weak）の全出現：語・強さ・位置・読点が続くか・候補だったか → カットしたか、字幕に出したか |
| `cue` | subtitles.draft.json＋subtitles.json＋layout.json | 完成字幕の文字数・行数（fit-width のときは今の字幕に合う layout.json の行）・表示時間・字／秒・要確認の種類・状態 |
| `subtitle-edit` | subtitles.json | 修正の種類（改行・句読点・固有名詞・投稿の表記・フィラー削除・削除・追加・置換）、文字数の増減 |
| `term` | term-candidates.json＋decisions.json | 候補の種類・辞書の種別・初期値 → 判断、表記を指定したか |
| `quote` | quote-alignment.json | 照合の結果・残した割合 → 投稿の表記を採用したか・要確認・一部カット |

あわせて、全体の数字（残した割合・カット回数／分・字／秒・削った時間の種類別・境目ごとの残した間の中央値など）、承認の履歴、辞書の構成、記録できないこと（`gaps`）を持つ。古い承認（候補の作り直し後）や今の承認と合わない timemap からは記録しない。

**最初の確認（横長動画1本、talk-subtitle で編集した案件）**：488件（カット候補 140・間 133・フィラー 36・字幕 106・字幕の修正 10・固有名詞 45・読み上げ 18）。

S2 で、両方の案件に `cut-range`（削った区間1つずつ：秒数・中の語数・間だけか声を含むか・位置・前後の残した区間の長さ）を追加した。

### S2：別のソフトで編集した動画からカットを復元する（reference 案件）

```
npm run new -- --id=<id> --kind=reference         project.json に kind: "reference"、input/reference/ を作る
  input/reference/source.<拡張子>                  元動画（コピーを置く。読み取りのみ）
  input/reference/final.<拡張子>                   完成動画（読み取りのみ）
  input/reference/subtitles.srt                    任意（S2 では登録だけ。S3 で使う）
npm run reference -- analyze --project=<id>        sha256 を project.json の reference に記録・ffprobe・両方の 16kHz 音声（audio/source-16k.wav・final-16k.wav）
npm run reference -- transcribe --project=<id>     両方を文字起こし（intermediate/transcript.json・final.transcript.json）
npm run reference -- reconstruct --project=<id>    → intermediate/reconstruction.json（--list で削った区間と中の文字）
npm run reference -- all --project=<id>             上の3つ＋observe
```

- reference 案件では `npm run analyze` などの production 用の工程は止まる（`registerSource` が案内を出す）。元動画は `project.json` の `source` にも記録するので、文字起こしと S1 の observe はそのまま使える
- 復元の方法（`src/style/reconstruct.ts`）
  1. 文字：両方の文字起こしを1文字ずつ LCS で対応させ、おおまかな位置（元の時刻 − 完成の時刻）を出す。長い動画（表が 4,000万マスを超える時）は、両方に1回だけ出る 8文字の並びを目印にして、目印の間ごとに LCS をとる。同じ文を何度も撮っている時は、元動画の後ろの方に対応させる（後のテイクを残すことが多いため。最終的には音声で確かめる）
  2. 音声：完成動画を 1秒の窓（0.5秒ずつ）に分け、話し声のある窓を元動画の中で探す。正規化相互相関（2kHz で粗く → 16kHz でサンプル単位）。候補は「前の窓と同じ位置」→「文字の対応」→「元動画全体（FFT、1kHz）」の順。採用は相関 0.7 以上（全体検索は 0.6）
  3. 同じ位置（差 4ms 以内）の窓をまとめて「残した区間」にする。区間の境目（カット位置）は、5ms ごとの波形の誤差が片方の位置からもう片方の位置に切り替わる所。間の中ではどちらでも同じに聞こえるので、その幅を `boundaryUncertainty` に残す
  4. どの区間とも合わない話し声（1秒の窓では拾えない短い残した部分）は、前後の区間の間の元動画を 0.4秒の窓で探し直す（相関 0.8 以上）
  5. 再生速度：4秒以上の区間の両端で位置を測り直し、ずれ（速度を変えると位置がずれていく）から倍率を出す。±0.2% 以内なら「変更なし」
  6. 完成動画の間は、完成動画の音声で測る（部屋の雑音 +6dB 未満が 0.1秒以上）。つなぎ目をまたぐかどうかも記録する。Whisper の語の時刻は間を測るには粗い
- `reconstruction.json` は timemap.json と同じ `segments`（srcStart／srcEnd／outStart／outEnd／frames）・`removed`（＋`seconds`・`speechSeconds`：中の声の秒数）を持ち、`srcToOut` などがそのまま使える。ほかに `offset`・`ncc`・`gain`・`unmatched`・`pauses`・`speed`・`quality`（話し声の何%を再現できたか）・`stats`（カット回数・1分あたり・削除時間・残した割合）
- observe は reference 案件では reconstruction.json を timemap の代わりに使う（`origin: "reference"`、間の provenance はすべて user-choice）。削った区間が「間だけ」か「声を含む」かは、元動画の音声で決める（Whisper の語の時刻は間にはみ出すため）
- 映像は使わない（完成動画は切り抜き・拡大・重ねた画像があり、元の映像と直接は比べられない）。音声を差し替えた・BGM を入れた完成動画では、相関が下がって復元できない所が増える

**横長動画での検証結果（2026-10-17）**：カット位置の正解（timemap.json）が分かっている横長動画（1920×1080・元 593.0秒 → 完成 335.5秒。字幕の焼き込み・-14 LUFS）を reference として復元し、正解と比べた。検証用の案件は学習データに入れない（`learning.exclude`）。
- 話し声の 98.8% を元の位置で再現（相関の平均 0.973）、速度は変更なし（31区間）、音量差 +15.4dB でも対応は取れた。残した時間の誤差は 0.003秒（正解 335.485秒）、削除時間の誤差は 0.009秒（正解 257.547秒）
- つなぎ目 120 のうち 108 を見つけた。位置がはっきりしたカットは誤差の中央値 1.7ms、間の中のカットは 80 のうち 78 が報告した幅（`boundaryUncertainty`）の中
- 見つからなかった 12 は、無音だけの短い区間（ツールの間の余白 0.2秒など）の間のつなぎ目。無音はどこを使っても同じ波形なので音声では区別できない（完成動画に残った間の長さは完成動画の音声で測るので影響しない）。そのため **カット回数は「聞いて分かるつなぎ目」の数で、無音どうしのつなぎ目は数に入らない**
- 文字起こし 10分（両方で 928秒分、CPU）、復元 15秒。長い動画用の分割（目印 166か所）でも同じ結果

