# content-ops の制作依頼を読む（production consumer）

content-ops（運用）が campaign に作った**制作依頼（production request）**を、short-movie が読んで制作する手順。
契約の正本は `../../content-ops/docs/production-handoff.md`（`contractVersion: content-ops.production-request/1`）。

```
content-ops：campaigns/<campaign>/production/video-<key>.json（読み取り専用。video 側は書き換えない）
  ↓ show / import（ready・期限内のときだけ。依頼はコピーせず、場所と requestId だけを <id>/input/production.json に書く）
short-movie：<id>/input/script.json（kind・factIds・attribution つき）＋ <id>/input/visuals.json（画像の種類）
  ↓ validate（video 側の事前確認 → 画像の種類 → content-ops の production validate-script）
  ↓ gate（sm.mjs の narration・render・encode の前に自動で通る）
  ↓ VOICEVOX → 字幕 → Remotion → MP4（今までどおり sm.mjs）
  ↓ result → <id>/output/production-result.json → content-ops で production record-result
```

## コマンド（short-movie で実行。package.json・node_modules は作らない）

| コマンド | 内容 |
|---|---|
| `node scripts/production.mjs show --campaign=<id> [--key=main] [--json]` | 依頼の中身（仕様・事実・構成）と、本制作に進めるか（読むだけ） |
| `node scripts/production.mjs import --campaign=<id> [--key=main] --project=<id>` | status が ready で readyExpiresAt 内のときだけ、動画フォルダに紐付ける（`node scripts/sm.mjs new --project=<id> --template=news-short-top` の後） |
| `node scripts/production.mjs prepare-script --project=<id> [--force]` | allowedFacts と creative だけから台本の下書きと画像の登録の雛形を作る |
| `node scripts/production.mjs validate --project=<id>` | 台本の検証。fail なら VOICEVOX・字幕・レンダリングに進めない |
| `node scripts/production.mjs gate --project=<id>` | ready・期限内・検証を通過・検証の後に台本と依頼が変わっていないか（sm.mjs が自動で呼ぶ。`narration --dry-run` は止めない） |
| `node scripts/production.mjs result --project=<id> --render-status=started\|rendered\|failed\|published` | content-ops へ返す結果 JSON |

依頼の場所：`CONTENT_OPS_ROOT`（既定 `../../content-ops`）の `campaigns/`（`CONTENT_OPS_CAMPAIGNS_DIR` で変えられる）。

## 読む契約（依頼のフィールド）

`contractVersion`（`content-ops.production-request/1` 以外は読まない）・`status`・`factCheck.readyExpiresAt`・`factCheck.lastRefresh`・`productionType`（news-short）・`targetProject`（short-movie）・`targetTemplate`（news-short-top）・`video`（1080×1920・30fps・durationTargetSec・voice・subtitleStyle）・`scriptRules`（allowedFacts・prohibitedClaims・attributionRequired・unknownFacts・safetyRules・noPersonNames・allowedNumbers）・`creative`（angle・hook・structure・titleCandidates・visualRules）・`handoff.readOnlySource`。

- 依頼は**制作のたびに読む**（コピーして直さない）。依頼が作り直されたら（requestId が変わる）import からやり直す
- **status が ready で readyExpiresAt を過ぎていないときだけ本制作に進む**。prepared・blocked・期限切れは止める（content-ops で `production check --refresh` を通してもらう）
- 構成は `creative.structure` が正本

## 台本（script.json）の形

short-movie の今の形に、文ごとの3つを足す（template の cards.mjs・Short.tsx は読まないので、今の制作はそのまま動く）。

```json
{ "kind": "fact", "factIds": ["statement-relationship"], "attribution": ["捜査関係者"],
  "cards": [{ "text": "捜査関係者への取材によると、", "image": "04.png" }, { "text": "男は…と供述しているということです。" }] }
```

- `kind`：hook / fact / unknown / transition / closing。**fact の文は factIds が必須**（allowedFacts の id）
- `attribution`：この文に入れた出典の言い回し。`attributionRequired` の事実（捜査関係者への取材・1媒体だけ・警察の見立て）を使う文は必須で、本文にも入れる
- unknownFacts は kind=unknown の文にだけ書く（「分かっていません」と言う）。事実の文に書かない
- 台本は allowedFacts だけから作る。外部の知識・推測を足さない。下書き（prepare-script）は機械的なので、読みやすく直してから validate を通す

禁止（content-ops の prohibitedClaims と同じ）：犯人の断定・殺害の断定・起訴済み・有罪・動機の断定・ストーカーなどのレッテル・被害者の実名・勤務先・写真・強盗された物の推測・現場の地点の推測。人名は出さない（被害者・容疑者とも）。

## 検証（validate）と進めてよい条件

1. video 側の事前確認：kind・factIds・attribution の形、出典の言い回し、unknownFacts を事実の文に書いていないか
2. 画像の種類（下の方針）
3. content-ops の `production validate-script`（正本。`--save` なしで呼ぶので content-ops のファイルは書き換えない）

- **fail**：VOICEVOX・字幕・レンダリングをしない
- **warning**：必須の事実が台本にない warning だけは進める（安全に関わらない）。出典の明示漏れの warning は安全に関わるので止める
- **pass**：進める
- 検証の結果は `<id>/input/production-validation.json`（台本の sha256 つき）。台本を直したら validate をやり直す（gate が止める）

## 画像・映像の方針（事件ニュース）

台本の札が使う画像はすべて `<id>/input/visuals.json` に**種類（category）**つきで登録し、許された種類だけを使う（`scripts/lib/production/visuals.mjs`）。画像の中身は機械では確かめられないので、最後は目で確かめる。

- 使ってよい：概略地図（`map-overview`。**事件現場の地点を示さない**：`showsIncidentLocation: false`）・一般的な東京の街並み（`city-street`）・夜の都市（`night-city`）・警察車両／警察署の一般的なイメージ（`police-generic`）・テキストカード（`text-card`）・日付カード（`date-card`）・時系列カード（`timeline-card`）・抽象的なニュース背景（`abstract-news-bg`）・章タイトル（`chapter-title`）
- 使わない：被害者を想起させる女性の人物写真・容疑者を想起させる男性の人物写真・刃物のクローズアップ・血・刺傷の表現・遺体・犯行の再現・実際の被害者／容疑者の写真・特定できる事件現場の写真
- 画像は news-short-top の決まり（上部の字幕帯 60〜300px を空ける）で作る

## 公開前の品質チェック（QUALITY_GATE）

完成MP4を作っただけでは公開に進めない。`node scripts/production.mjs quality-check --project=<id> [--review=<所見.json>]`（`scripts/lib/production/quality.mjs`）。

- 採点（各100点）：hookQuality（冒頭3秒・10秒）・visualPacing（同じ画面の時間）・visualVariety（画の種類・レイアウト）・**onScreenTextLoad（画面に読ませる文字の量。長文カードは大きく減点）**・subtitleReadability・narrationPacing（尺・速さ・伝聞の言い回し）・audioQuality・informationDensity・retentionRisk → overallQuality（重み付き）
- **fail**：overallQuality < 70、または重要4項目（hook・visualPacing・onScreenTextLoad・retentionRisk）のどれかが 50 未満、または他の項目が 40 未満
- 機械で測れないこと（AI 生成感・素人っぽさ・声の単調さ）は `--review` の所見（notes）として記録に残す
- 記録：`<id>/input/quality-check.json`（試行ごと）。content-ops で `production record-quality --quality=<このファイル>` に渡す。fail の間は content-ops が YouTube の upload 計画と published を止める
- **自動修正ループ**：fail → 指摘（findings）と修正案（fixes）から台本・字幕・画面の構成を直す → validate → narration → render → encode → quality-check。**最大3回**。3回目も fail なら `human-review`（人の確認。公開しない）
- `input/visuals.json` の各画像に `onScreenText`（画面に出す文字の一覧。文字なしは []）が必須。1要素12字・1画面2要素・計20字を超えると validate が止める

### 映像の強さ（visualStrength、quality-v2、2026-11-20）

画面が変わる「回数」ではなく、**その映像自体を見たいと思えるか**。tank-20261119 は quality-v1 で 99・pass だったが、人の評価は「前よりかなり良い。映像が弱い。」（図・模式図中心で、同じ型の静止画だけ）。quality-v2 の参考点は 62・fail（visualStrength 24）。

- 採点（0〜100、重要項目）：実写の画面時間の割合（35）・この出来事そのものの映像／公式素材（15）・動く映像（10）・冒頭の画が実物か（10）・画の種類（10）・目視の判断（20：Shorts のフィードで止まって見たくなるか・視覚的な驚き・音声なしでも何の話か分かるか）。減点：模式図・カードが安っぽい（目視）・同じデザインの図／カードが3画面以上続く・抽象画像が30%超
- 上限：図・カード・抽象画像が画面時間の半分以上なら 55 点、実写がなければ 35 点
- **overallQuality は 50 + visualStrength / 2 を超えない**（90点台には visualStrength 80 以上が要る）。visualVariety も、同じデザインの画面が4回以上続けば減点（回数だけで高得点にしない）
- `input/visuals.json` の各画像に任意で `realness`（event＝この出来事そのものの映像・公式素材／real-object＝実在の物・場所・車両・製品／generic-real＝一般的な街並みなど／drawn＝図・地図・カード／abstract＝抽象・作り物）と `motion`。なければ category から決める（photo・footage は real-object）
- 目視の判断は `--review` の `visual: { thumbStopping, visualSurprise, understandableWithoutAudio, diagramsLookCheap }`。ないと点を付けない
- `quality-check --reference [--out=<file>]`：採点のルールを変えた後に、過去の動画を参考採点する（記録しない・試行に数えない）。content-ops の `production record-quality --reference=` に渡す

**映像制作の原則**（制作依頼の `qualityRules.principles` にも入る）：テキストカードだけ・模式図だけで構成しない／可能なら実物・公式素材・場所・物・車両・製品を見せる（その出来事の素材と動く映像を最優先で探す）／図解でも画面全体を単純なカードにしない（実写に重ねる・質感のある図）／同じデザインの画面を連続させない／「次の画を見たい」と思わせる／冒頭1〜3秒には一番強い画を置く

## content-ops へ返す結果

`<id>/output/production-result.json`（Git 管理外）：`productionId`・`startedAt`・`completedAt`・`scriptPath`・`audioPath`・`subtitlePath`・`videoPath`・`durationSec`（timeline.json から）・`validationStatus`・`renderStatus`。content-ops 側で `npm run co -- production record-result --campaign=<id> --key=<key> --result=<このファイル>` に渡す（content-ops のファイルを video 側から直接書かない）。

## テスト

`node --test short-movie/scripts/test/production.test.mjs`（video で実行。依頼は一時ディレクトリの mock、検証は本物の content-ops CLI を読み取りだけで使う）。型チェック：`node ../../remotion/node_modules/typescript/bin/tsc -p scripts/tsconfig.json`（short-movie で実行）。
