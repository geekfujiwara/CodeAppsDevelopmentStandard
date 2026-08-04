# Agent 365 CLI（`a365`）運用ガイド

`a365` は Agent 365 のエージェント ID ブループリントを作成・構成するための CLI。
Windows での実行にクセがあるため、以下を守る。

## 1. クライアントアプリ登録が先に要る

**「Agent 365 CLI」は Microsoft のファーストパーティ アプリではない。**
公開の固定 appId は存在せず、**テナントごとにその表示名でアプリ登録を自前で作る**必要がある
（CLI は表示名でアプリを解決する）。

作成するアプリ登録の要件:

- シングルテナント / パブリック クライアント フォールバックを有効
- リダイレクト URI: `http://localhost:8400/`、`http://localhost`、
  `ms-appx-web://Microsoft.AAD.BrokerPlugin/<appId>`
- オプションの要求に `wids` を追加

> **注意**: 作成後に Entra ポータルで「管理者の同意を与える」を押すと、
> CLI が必要とする beta 権限が消えることがある。CLI 側の同意フローに任せる。

参考: Microsoft Learn「custom client app registration」（Agent 365 開発者向けドキュメント）

## 2. ライセンス

Agent 365 のライセンス SKU が割り当てられている必要がある。
CLI にハードコードされた SKU ID が実際に割り当て可能な SKU と異なることがあるため、
`Get-MgSubscribedSku` 等で自テナントの `skuId` を確認して割り当てる。
割り当て時は `usageLocation` が必須。

## 3. 認証キャッシュは standard の auth_helper を使う

通常の Azure / Graph / Foundry 認証は `standard/scripts/auth_helper.py` が保存した
AuthenticationRecord + MSAL 永続キャッシュを共有する。agent365 用に `az login` や
`a365` の個別ログインで新しい認証キャッシュを作る運用にはしない。

`.a365-auth.json` / `auth-token.json` / `*token-cache*` が生成された場合もローカル専用で、
コミット・貼り付けは禁止。

## 4. 出力をパイプしない

`a365` のブループリント設定時に例外的に対話プロンプトが出る場合は WAM（ネイティブ ダイアログ）を使う。

- **`| Out-String` や `| Tee-Object` でパイプすると対話プロンプトが飲み込まれ、固まったように見える。**
- ログが必要なときだけパイプし、プロンプト待ちが疑われたらパイプ無しで再実行する。
- CLI に `--device-code` オプションは無い。デバイスコードは WAM / ブラウザ失敗時の自動フォールバックのみ。

## 5. 埋め込みターミナルでは WAM ダイアログが出せない

VS Code の統合ターミナルからは WAM のダイアログを表示できない。可視ウィンドウで起動する。

```powershell
$b64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('a365 setup blueprint -n <name> --no-endpoint'))
Start-Process powershell -ArgumentList '-NoExit','-EncodedCommand',$b64
```

`-Command` を `-ArgumentList` で渡すと引用符が壊れるため、**必ず `-EncodedCommand`** を使う。

## 6. ブラウザのプロファイル問題

CLI はブラウザを `ProcessStartInfo` + `UseShellExecute=true`（= OS 既定ハンドラー）で開く。
**プロファイルを指定するオプションも環境変数も無い。**
Edge は外部リンクを「最後にアクティブだったプロファイルのウィンドウ」に流すため、
`a365` 実行の**直前に**対象アカウントのプロファイルでウィンドウを開いておく。

```powershell
Start-Process msedge.exe -ArgumentList '--profile-directory="Profile N"','https://portal.azure.com'
```

恒久策は `edge://settings/profiles/multiProfileSettings` の「自動プロファイル切り替え」。

## 7. 冪等性と再実行

- 初回の `a365 setup blueprint` はディレクトリ伝播の遅延で
  inheritable permissions が 404 になり失敗しがち。
  **同じコマンドをもう一度流せば冪等に修復される**（追加スコープの付与も同様）。
- `a365 setup permissions mcp|bot` は **`--agent-name <name>` が必須**（無いと即エラー終了）。

## 8. シークレットの取り扱い

- 実行のたびに**新しいクライアント シークレットが平文でコンソール出力される**。
- ログファイルに残すと平文で残るため、実行後に削除する。
  `.gitignore` に `a365-*.log` と `a365.generated.config.json` を必ず入れる。

## 9. 生成される設定ファイル

`a365.generated.config.json` の主なキー（値は環境固有 = 秘匿）:

| キー | 内容 |
|---|---|
| `agentBlueprintId` | `.env` の `A365_AGENT_BLUEPRINT_ID` に設定する GUID |
| `agentBlueprintServicePrincipalObjectId` | ブループリントのサービス プリンシパル |
| `agentBlueprintClientSecretProtected` | シークレット保護状態 |
| `resourceConsents[]` | 付与済み API 同意（`resourceName` / `scopes` / `consentGranted` 等） |
| `completed` / `lastUpdated` / `cliVersion` | セットアップ状態 |

このファイルは**コミットしない**。必要な値は `.env` 経由で参照する。
