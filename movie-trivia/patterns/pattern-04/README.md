# pattern-04：テック比較（製品カード＋比較表＋大きな数字）

2026-11-23 作成。セット03 なぎちょAI の「AI 製品の比較」のために Claude が設計した型（ユーザー指示「pattern-01・02 にこだわらず、新しいパターンを作っていく」）。

- 人物写真が主役の pattern-02 では、製品・サービスの比較の画が成り立たない（人物を出さないため札が空く・表を画像にすると文字が小さくなる）
- 描画は pattern-02 と同じ `src/news.tsx`（全面の映像と大きな字幕）。人物の札の代わりに、製品カード・右上の製品ナビ・数字カード・比較表を **Remotion で直接描く**（文字は 34px 以上。資料や表を縮小した画像は貼らない）
- 人物の実名・写真は使わない（企業名と製品名だけ）。そのため pattern-02 の `real-names-photos` の承認は要らない（config.json の `production.approvals` は空）

## 台本（script.json）

```json
"pattern": "pattern-04",
"voice": { "speaker": 11, "speakerName": "玄野武宏", "speedScale": 1.25 },
"products": [
  { "id": "claude", "maker": "Anthropic", "name": "Claude Fable 5.2", "short": "Fable 5.2", "tag": "難しい技術の仕事向け", "color": "#E8825A" }
]
```

| 画面指定（`visual`） | 画面 |
|---|---|
| `{ "footage": "<キー>" }` | 映像を全面に（少し暗く）。中央のカードと左上の札は消える |
| `{ "product": "<products の id>" }` | 左上に製品カード（会社名・製品名・一言。左端に製品の色） |
| `{ "focus": "<id>" }` | 右上のナビで、その製品を明るくする（`""` で全部暗く）。ナビは次の focus まで出たまま |
| `{ "spec": { "label": "API 料金（入力）", "value": "$8", "unit": "/100万トークン", "note": "出力は $40", "product": "<id>" } }` | 中央に大きな数字1つ（映像はさらに暗く） |
| `{ "compare": { "title": "料金の比較", "columns": ["<id>", …], "rows": [{ "label": "入力", "cells": ["$8", …] }], "note": "各社の公式発表（11月23日確認）", "highlight": 1 } }` | 中央に比較表（列は製品、行は3〜4行まで。`highlight` で1列を明るく） |
| `{ "headline": { "title": "…", "sub": "…" } }`・`{ "clear": true }` | pattern-02 と同じ |

- 中央のカード（spec・compare）は、次のカード・`clear`・映像だけの文まで出たまま。カードを続けず、間に映像だけの文を挟む
- 比較表は章の最後かまとめで1〜2回まで。1行の文字は短く（セルは 8 字前後）
- 字幕は台本の `"subtitle": { "rowsPerPage": 1, "maxRowChars": 18 }` で基本1行

## サムネイル

`thumbnails[]` に `"layout": "versus"`。`products`（並べる id）・`ribbon`（左上の帯）・`lines[0]`（右上の補足、任意）・`accent`（黄色の大きな結論）・`question`（白の問い）・`photo`（背景にうっすら敷く映像）。

## 品質

品質ゲートは long-v2（他の pattern と同じ）。数字・ベンチマークは各社の自社発表と言い、確認日を入れる。事実・予測・意見（おすすめ）を分ける。
