# HyperFrames について（2026 年 10 月時点の公開情報）

- HeyGen のオープンソース（Apache 2.0）。HTML + CSS + シーク可能なアニメーション（GSAP など）を MP4 にする
- 必要環境: Node.js 22 以上、FFmpeg。レンダリングはヘッドレス Chrome
- 導入方法は公式の GitHub / サイト（末尾の URL）を参照する
- CLI: `npx hyperframes lint` / `preview` / `render --output out.mp4`
- 構成の約束: ルート要素に `data-composition-id`、時間指定する要素に `class="clip"` と `data-start` / `data-duration`。
  GSAP タイムラインは `window.__timelines["root"]` に登録する。スクリプトで動画の再生・停止・シークをしない
- 元動画の切り出し開始位置は `data-media-start` で指定している。lint で属性名の指摘が出たら、
  hyperframes-core スキル（references/variables-and-media.md）の現行仕様に合わせて修正する
- 公式: https://github.com/heygen-com/hyperframes / https://hyperframes.heygen.com
