# 顔面スイカ / FACE MERGE ARCADE

写真の顔だけを切り抜いて、スイカゲーム式に落として合体させるブラウザゲームです。
円形アイコンではなく、顔の輪郭に沿って切り抜いたヘッドを使っています。

## 遊ぶ

- 公開URL: **https://face-suika.surge.sh**
- PC / スマホのブラウザでそのまま遊べます。
- プレイヤー名を入れてスタート。スコアはグローバルランキングに登録されます。

### 操作

- スマホ: 指で場所を決めてタップ
- PC: マウスで狙ってクリック / ← → キーで移動、Space または Enter でドロップ
- 音: 右上のスピーカーボタン

## 進化の序列

| Lv | 顔 | 特徴 |
|---|---|---|
| 0 | ピンク | 最初の顔 |
| 1 | ドアップ | 近すぎる |
| 2 | 紫メガネ | 紫の反射 |
| 3 | ポテチ | くちびるポテチ |
| 4 | クマ | 顔、売り物 |
| 5 | 爆笑 | 限界スマイル |
| 6 | 虹色漢 | 深夜の虹 |
| 7 | siva | 常に小刻みに震える。登場時に台詞がエコーでランダム再生 |
| 8 | siva・暴 | 物理演算が暴走。周囲の顔面を巻き込んで周期的に爆発 |
| 9 | 坊主 | 2つ合体で大坊主へ |
| 10 | 大坊主 | 最終進化。降臨時はスローモーション＋閃光＋金の光線＋紙吹雪 |

- 坊主 × 2 → 大坊主（ド派手な降臨演出）
- 大坊主 × 2 → 大坊主が成仏し、+5,000点
- 連続合体でコンボ倍率（最大 ×5）

## スコア / ランキング

- 1ブラウザにつき1プレイヤーID。自己ベストをランキングに登録します。
- プレイヤー名は12文字まで。ゲームオーバー画面から変更できます。
- ランキングは [MantleDB](https://mantledb.sh/) の公開JSONエントリを使用。
  - 読み取りは公開、書き込みはクライアント内のキーで行うカジュアル向け構成です。
  - スコアはクライアント計算のため、チート耐性はありません。
- オフライン時はローカルに保留し、次回オンライン時に送信します。

## ローカル実行

ビルド不要の静的サイトです。

```powershell
cd face-suika
python -m http.server 5173
```

`http://127.0.0.1:5173/` を開いてください。

## 構成

```
face-suika/
  index.html
  styles.css
  js/
    config.js       顔・進化・ランキング設定
    game.js         Matter.js のゲーム本体
    audio.js        Web Audio（sivaボイス＋エコー、効果音、BGM）
    leaderboard.js  MantleDB ランキング
    main.js         UI / 画面遷移
  vendor/
    matter.min.js
  assets/
    faces/          顔の輪郭切り抜き WebP（512px / 透過）
    audio/          siva の台詞 4本
    favicon.png
    og.jpg
  tools/
    prepare_assets.py  rembg で顔を輪郭切り抜き
    export_cutouts.py  WebP書き出し
  deployment-credentials.json  ※公開サイトには含めない
```

## 顔素材の作り直し

元写真は `C:\Users\USER\Downloads\otakugame` にあります。
`rembg` の `u2net_human_seg` で人物を分離し、手動で顎・首のラインを調整して
髪・耳・顔の輪郭を残しています。

```powershell
python -m pip install rembg onnxruntime
python tools/prepare_assets.py
python tools/export_cutouts.py
```

`tools/prepare_assets.py` は `C:\Users\USER\Downloads\otakugame` を参照します。
別の場所に移動した場合は `SRC` を変更してください。

## クレジット

- 写真: 提供素材
- 音声: `siva` フォルダの台詞
- 物理: [Matter.js](https://brm.io/matter-js/)
- 顔切り抜き: [rembg](https://github.com/danielgatis/rembg)
- ホスティング: [Surge](https://surge.sh/)

非公式のファンメイドゲームです。
