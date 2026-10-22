# PDF用日本語フォント

- Noto Sans JP（Regular、wght=400）
- 取得元: https://github.com/google/fonts/tree/main/ofl/notosansjp
- ライセンス: 同梱の [OFL.txt](OFL.txt)（SIL Open Font License 1.1）
- 可変フォントから FontTools の `varLib.instancer` で400ウェイトの静的インスタンスを生成。
- PDFには全グリフを埋め込む（fontkitでのCJKサブセット化はレンダリング時の文字欠けを実測したため使わない）。フォントをCDNから実行時取得しない。

元の `NotoSansJP[wght].ttf` を取得後の生成コマンド:

```powershell
python -m fontTools.varLib.instancer "NotoSansJP[wght].ttf" wght=400 --output=NotoSansJP-Regular.ttf
```
