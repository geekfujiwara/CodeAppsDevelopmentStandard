# Native Mobile Code Apps トラブルシューティング

## Private Preview を本番向けに要求された

本番利用は禁止。`mobile-preview-approval.json` の `productionAllowed` は常に `false` とし、
レスポンシブ Web Code App または GA 済みの代替を提示する。

## `npx power-apps` が実行できない

公式 mobile template は `@microsoft/power-apps-cli` を依存に含まない。SDK の推移的依存も前提にしない。

```powershell
npx --yes --package @microsoft/power-apps-cli@1.0.0 power-apps init --help
```

## Wrap sign-in が失敗する

- Wrap で作成した Application (client) ID か確認する
- `auth.config.json` の tenant ID が選択環境と同じか確認する
- redirect URI／API permission を独自追加していないか確認する
- client secret や token を設定ファイルに入れない

## camera／location module が見つからない

生成済み `package.json` を確認する。allowlist に無ければ停止し、個別 install で回避しない。
module があるのに実機で unavailable の場合は、Power Apps Developer app／Wrap runtime の対応 OS と permission を確認する。

## Metro は起動するが画面が崩れる

`SafeAreaProvider`、`SafeAreaView`、`KeyboardAvoidingView`、font scaling を確認する。
ブラウザ preview だけで完了せず実機で確認する。

## offline package があるのに同期しない

package の存在は runtime 対応の証明ではない。[offline.md](offline.md) の境界に従い、profile authoring と
runtime store／sync queue を分離する。未検証 runtime を独自 cache で代替したことにしない。

## upstream 更新で smoke test が壊れた

`check_upstream.py` で HEAD を確認し、依存を個別更新せず新 commit の template 全体で検証する。
scaffold、install、`init -t MobileApp`、type-check、Metro、iOS／Android Developer app、build／push が
すべて成功した後に [upstream-template.json](upstream-template.json) を更新する。

既存 project で再承認を得た後は、実装を上書きせず marker だけを再発行する。

```powershell
python .github/skills/mobile-apps/scripts/scaffold_mobile_app.py `
	--target ./existing-mobile-app `
	--preview-approved `
	--refresh-approval
```

**恒久対策済み**: `scaffold_mobile_app.py` は承認 marker と pinned commit を使い、
`validate_mobile_project.py` は Preview／依存／auth／native／offline の境界を毎回検証する。
