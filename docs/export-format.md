# エクスポート形式(schemaVersion 1)

プロフィール画面の「すべての絵日記をエクスポート」で取得できる ZIP ファイルの公開仕様です。憲章の原則 IV
に基づき、利用者がいつでも自分のデータを持ち出し、同じ形式から取り込めるようにします。

## ファイル構成

```text
diary-export-YYYYMMDD.zip
├── manifest.json
└── images/
    ├── 2026-11-01.webp
    └── 2026-11-02.webp
```

## manifest.json

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-07T09:00:00.000Z",
  "diaries": [
    {
      "date": "2026-11-01",
      "body": "きょうは こうえんで あそびました。",
      "weather": "sunny",
      "image": "images/2026-11-01.webp"
    }
  ]
}
```

| 項目 | 型 | 説明 |
|---|---|---|
| `schemaVersion` | 数値 | 形式のバージョン。現在は `1` |
| `exportedAt` | 文字列 | エクスポートした日時(ISO 8601、UTC) |
| `diaries` | 配列 | 絵日記。日付の古い順 |
| `diaries[].date` | 文字列 | 日付(`YYYY-MM-DD`) |
| `diaries[].body` | 文字列 | 文章(1〜400文字、書記素単位) |
| `diaries[].weather` | 文字列 | `sunny`(晴れ)、`cloudy`(くもり)、`rainy`(雨)、`snowy`(雪) |
| `diaries[].image` | 文字列 | ZIP 内の画像のパス(`images/<日付>.webp`) |

画像は WebP 形式で、位置情報などのメタデータは含みません。プロフィールやフォロー関係は含みません。

## インポート

- 画面上で ZIP を展開し、通常の作成と同じ検証を通して1件ずつ取り込みます。
- 同じ日付の絵日記が既にある場合は上書きせずスキップし、件数を表示します。
- `schemaVersion` が `1` 以外のファイルは取り込めません。
- 画像は取り込み時に再エンコードされるため、元のファイルとバイト単位では一致しません。
