# Ghost Companion（お化け AI 対話コンパニオン）

**ふわっと、そばに。** — 100bas の対話専用アプリです。

スマホ／PC のブラウザで、かわいいお化けとおしゃべりしたり、端末カメラで「みまもり」したりできます。

## このリポジトリの境界

| ソフトウェア | 役割 | ここ？ |
|---|---|---|
| **対話コンパニオン（本リポ）** | 表情・会話・見守り | はい |
| **操作ソフト（別リポ）** | ワイヤー／モーター／実機制御 | **いいえ** |

キャラは **お化け1体のみ**です（Petassist の六匹パーティではありません。犬などの動物スプライトから改変していません）。

## 開発

```bash
cp .env.example .env.local   # 任意: OPENAI_API_KEY で LLM 会話
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開いてください（スマホは同一 LAN のマシン IP でも可）。

`OPENAI_API_KEY` が無い場合は、やさしいルールベースの返信になります。

## アセット

- `public/ghost/normal.png` — 通常表情
- `public/ghost/failed.png` — 失敗表情

## 由来

UI スタックと companion／表情切替の考え方は [Petassist](https://github.com/Yu220284/petassist) をほぼフルコピーしたうえで、お化け単体の対話体験に組み替えています。
