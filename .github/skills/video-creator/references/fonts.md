# 同梱フォント

| ファイル | 内容 |
|---|---|
| `NotoSansJP-VariableFont_wght.ttf` | Noto Sans JP（Version 2.004、可変ウェイト Thin〜Black）。Google Fonts 配布版 |
| `OFL.txt` | SIL Open Font License 1.1 の全文と著作権表示 |

## ライセンス
Noto Sans JP は SIL Open Font License 1.1 で提供されています。
- 商用利用・動画への使用・ソフトウェアへの同梱・再配布が可能
- 再配布時は `OFL.txt` を必ず同梱すること
- フォント単体での販売は不可。改変版に予約フォント名を使うことは不可
- 作成した動画（成果物）には OFL の制約は及ばない

## フォントの探索順
1. `--font` 引数、または環境変数 `VIDEO_EDITOR_FONT`（旧 `DEMO_VIDEO_FONT` も互換対応）
2. `assets/fonts/` の Noto Sans JP（同梱済み）
3. OS にインストール済みの Noto Sans JP / Noto Sans CJK
4. 代替: ヒラギノ角ゴ / 游ゴシック / メイリオ（OS 付属。再配布はできないため同梱しない）

自動ダウンロードは既定で無効。外部からの取得は利用者の承認なしに行わない。
