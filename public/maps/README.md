# 日本地図 SVG アセット

都道府県別にグループ化された SVG フォーマットの日本地図。

## ファイル一覧

| ファイル | 説明 | 用途 |
|---------|------|------|
| `map-full.svg` | フルサイズの日本地図（実際の地形に近いパス） | デスクトップ向けダッシュボード・詳細表示 |
| `map-mobile.svg` | モバイルデバイス用にアレンジした地図 | モバイル対応レイアウト |
| `map-circle.svg` | 都道府県を円（circle）で表現したデフォルメ地図 | コンパクト表示・データ可視化 |
| `map-polygon.svg` | 都道府県を矩形（polygon/path）で表現したデフォルメ地図 | シンプルなエリア色分け |

## SVG 仕様

- **クラス構成**: `.geolonia-svg-map > .svg-map > .prefectures > .prefecture`
- **都道府県クラス**: 都道府県名（ローマ字）+ 八地方区分名が `class` 属性にセット
  - 例: `class="osaka kinki prefecture"`
- **都道府県コード**: `data-code` 属性に JIS コード格納
  - 例: `data-code="27"`（大阪府）
- **viewBox**: `0 0 1000 1000`

## ライセンス

原典は Wikipedia の「日本地図.svg」をベースとしており、ライセンスは GFDL。
