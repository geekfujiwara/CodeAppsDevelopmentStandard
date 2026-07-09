# Dataverse MCP サーバー登録（VS Code / GitHub Copilot）

VS Code の GitHub Copilot（エージェントモード）から Dataverse を直接操作するための MCP サーバー登録手順。
登録すると `search` / `read_query` / `describe` / `create_record` / `update_record` / `upsert_skill` などの Dataverse MCP ツールが使えるようになる。

> **用途例**: ビジネススキル（プレイブック）の登録（`upsert_skill`）、自然言語でのデータ照会（`read_query`）、Copilot Cowork 等の MCP クライアント連携の前段整備。

---

## 前提条件

1. **環境側で MCP クライアントが許可されていること**（環境管理者の操作）
   - Power Platform 管理センター or `allowedmcpclient` テーブルで、利用する MCP クライアントを有効化する。
   - 代表的な Allowed MCP Client:
     | クライアント | 用途 |
     |---|---|
     | **Microsoft GitHub Copilot** | VS Code / Copilot CLI から接続する場合に必須 |
     | **Microsoft Copilot Studio** | Copilot Studio エージェントから接続する場合 |
     | **Microsoft Cowork** | Microsoft 365 Copilot（Cowork）から接続する場合 |
   - 確認 URL 例: `https://{org}.crm.dynamics.com/main.aspx?forceUCI=1&pagetype=entityrecord&etn=allowedmcpclient`
   - **コマンドで確認（推奨）**: `python .github/skills/standard/scripts/check_mcp_client.py copilot`（Step 0 参照）
2. **マネージド環境**であること（ビジネススキル等プレビュー機能を使う場合）。
3. VS Code + GitHub Copilot 拡張がインストール済み。

---

## 登録手順（汎用）

### Step 0: クライアントの有効状態を最初に確認（必須）

MCP サーバーを起動する前に、利用するクライアントが環境で有効化されているかを API で確認する（未有効だと起動時に 403 / 認証拒否になる）。

```bash
# VS Code / Copilot CLI 用（Microsoft GitHub Copilot）
python .github/skills/standard/scripts/check_mcp_client.py copilot

# Cowork 用 / 全クライアント一覧
python .github/skills/standard/scripts/check_mcp_client.py cowork
python .github/skills/standard/scripts/check_mcp_client.py all
```

- `✅ 有効` なら Step 1 へ進む。
- `❌ 無効` ならスクリプトが有効化手順（管理センター）を案内する。前提条件1参照。

### 方法1: ワークスペースに `.vscode/mcp.json` を配置（推奨・再現性高い）

リポジトリ直下に以下を作成する。URL は `{DATAVERSE_URL}` に `/api/mcp` を付与（末尾スラッシュなし）。

```jsonc
// .vscode/mcp.json
{
  "servers": {
    "DataverseMcp": {
      "type": "http",
      "url": "https://{org}.crm.dynamics.com/api/mcp"
    }
  }
}
```

- `{org}` は `make.powerapps.com` → 設定（歯車）→ セッションの詳細 → インスタンス URL で確認できる。
- 一般提供エンドポイントは `/api/mcp`、プレビュー機能（最新ツール）は `/api/mcp_preview`。

作成後、`mcp.json` を開くと `servers` の上に表示される **Start** CodeLens をクリックして起動 → 初回はブラウザ認証（環境の管理ユーザーでサインイン）。

### 方法2: コマンドパレットから追加

1. `Ctrl+Shift+P` → **MCP: Add Server** → **HTTP** を選択
2. `https://{org}.crm.dynamics.com/api/mcp` を入力
3. サーバー名（既定 `DataverseMcp`）と保存先（Global / Workspace）を選択
4. `Ctrl+Alt+I` でチャットを開き **Agent モード**を選択

### 方法3: Copilot CLI（参考）

- グローバル: `~/.copilot/mcp-config.json`、プロジェクト: `.mcp/copilot/mcp.json`

```jsonc
{
  "mcpServers": {
    "DataverseMcp": { "type": "http", "url": "https://{org}.crm.dynamics.com/api/mcp" }
  }
}
```

保存後に Copilot CLI を再起動。

---

## 起動・認証の確認

1. MCP サーバー起動後、Copilot チャット（Agent モード）で「**Dataverse のテーブル一覧を見せて**」等を実行
2. 初回はブラウザでのサインイン・同意が走る（デバイス/対話認証）
3. 認証は3層で管理される: ①開発者認証（初回キャッシュ）②テナント管理者同意（テナント1回）③環境許可リスト（環境1回）

> **403 / 認証失敗時**: 前提条件1の「Allowed MCP Client」に該当クライアント（VS Code なら *Microsoft GitHub Copilot*）が有効化されているかを最初に疑う（Step 0 の `check_mcp_client.py` で確認）。

---

## トラブルシュート

### Connect Timeout Error（`fetch failed: Connect Timeout`）— IPv6 不通

エラー例:
```
Error sending message to https://{org}.crm.dynamics.com/api/mcp:
TypeError: fetch failed: Connect Timeout Error
(attempted addresses: 13.87.216.130:443, 2603:1061:...:443, timeout: 10000ms)
```

**原因**: VS Code の MCP クライアント（Node の fetch）が IPv6 アドレスを先に試し、その経路が不通だと 10 秒でタイムアウトする。設定ミスではなくネットワーク要因。

**切り分け**:
```powershell
Test-NetConnection -ComputerName {org}.crm.dynamics.com -Port 443 |
  Select-Object RemoteAddress, TcpTestSucceeded
```
IPv4 のみ成功（`pac` CLI は動作）・IPv6 失敗なら本事象。

**対処（IPv4 を優先）** — 管理者 PowerShell:
```powershell
# 1. 現在の IPv4 を確認
Test-NetConnection -ComputerName {org}.crm.dynamics.com -Port 443 | Select-Object RemoteAddress
# 2. hosts に IPv4 を固定（上で得た IP に置換）
Add-Content -Path "$env:windir\System32\drivers\etc\hosts" -Value "`n13.87.216.130 {org}.crm.dynamics.com" -Encoding ascii
# 3. DNS キャッシュクリア
ipconfig /flushdns
```
その後 VS Code で `MCP: List Servers` → 対象サーバー → **Restart Server**。

> **注意**: Dataverse の IP は変動し得るため、hosts 固定は**恒久策ではない回避策**。MCP 利用後は追加した hosts 行を削除する。接続が再びタイムアウトしたら同コマンドで新 IPv4 を確認して差し替える。

---

## 主な MCP ツール

| ツール | 用途 |
|---|---|
| `search` | テーブルスキーマ・ビジネススキル・アプリをキーワード検索（メタデータ） |
| `search_data` | 構造化/非構造化データの検索 |
| `read_query` | Dataverse SQL（SELECT）でレコード取得 |
| `describe` | 検索結果（テーブル/レコード/スキーマ/スキル/アプリ）の詳細取得 |
| `create_record` / `update_record` / `delete_record` | レコード CRUD（削除は明示承認後） |
| `create_table` / `update_table` / `delete_table` | テーブル定義の操作 |
| `upsert_skill` / `delete_skill` | ビジネススキル（プレイブック）の作成・更新・削除 |
| `init_file_upload` / `commit_file_upload` / `file_download` | ファイル添付の SAS URL 発行 |

> テーブル名は **論理名（単数形）** で指定する（EntitySetName の複数形・表示名は不可）。

---

## 注意・課金

- 2025/12/15 以降、Copilot Studio 外の AI エージェントから Dataverse MCP ツールを使うと課金対象（Dynamics 365 Premium / M365 Copilot USL 保有時は Dynamics データアクセスは非課金）。
- `.vscode/mcp.json` に**シークレットを書かない**（URL のみ。認証はブラウザ/トークンストアで処理）。
