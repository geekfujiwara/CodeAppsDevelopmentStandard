# インタラクティブ環境セットアップ手順

プロジェクト新規開始時に **PAC CLI** と **Dataverse API** を使って `.env` を対話的に構成する。
手動でセッション詳細を開く必要がなく、エージェントがユーザーに選択肢を提示して進める。

> 前提: PAC CLI がインストール済み（`npm install -g @microsoft/power-apps-cli` or Power Platform Tools 拡張機能）。

## 標準フロー（PAC プロファイル → 環境選択 → デバイスコード認証）

このスキルの推奨セットアップは次の 4 ステップで、`scripts/setup_environment.py` が自動化する。

1. **PAC プロファイルから環境を取得** — `pac auth list` のプロファイルを `pac org who` で解決し、環境候補（URL / 環境 ID）を一覧化する。
2. **どの環境にするか AskUserQuestion** — エージェントが一覧をユーザーに提示し、利用環境を選ばせる。
3. **デバイスコード認証** — 選択環境で `.env` を構成し、`auth_helper.py` のデバイスコード認証をトリガーする。エージェントは表示されたコードと URL をユーザーに伝え、ブラウザでサインインしてもらう。
4. **auth_helper に認証を保存** — 認証成功時に `AuthenticationRecord`（`~/.power-platform-cli/auth_record.json`、ホームディレクトリ配下でマシン全体共有）と MSAL 永続キャッシュへ保存され、以降は**このマシン上のどのプロジェクトでも** Python スクリプトはデバイスコード入力なしで認証される。

```powershell
# 1〜2: 環境候補を一覧表示（この出力を AskUserQuestion で提示する）
python .github/skills/standard/scripts/setup_environment.py --list

# 3〜4: 選択した環境で .env を構成し、デバイスコード認証 → 認証レコード保存
python .github/skills/standard/scripts/setup_environment.py --profile "<ProfileName>" `
  --solution "<SolutionName>" --prefix "<prefix>" --display "<表示名>"

# 既存 .env でデバイスコード認証だけ実行したいとき
python .github/skills/standard/scripts/setup_environment.py --auth-only
```

> 以降の Step 1〜8 は、この自動フローの各段階の詳細・手動フォールバックである。

## Step 1: .github スキルのダウンロード

```powershell
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github --force
cp .github/skills/standard/references/gitignore-template .gitignore
```

> ブラウザ操作（ポータルのフォーム入力等）は **VS Code 統合ブラウザツール**を使う。
> Playwright MCP のインストール・`.vscode/mcp.json` への登録は行わない
> （→ [ブラウザ自動化方針](browser-automation.md)）。

## Step 2: PAC 認証プロファイルの確認

既存の認証プロファイルを確認する。

```powershell
pac auth list
```

- プロファイルが **ある** → 既存プロファイルを使うか確認（AskUserQuestion）
- プロファイルが **ない** → `pac auth create` で新規作成を案内

```powershell
# 新規作成の場合
pac auth create --name {ProfileName}
```

### PAC profile が作成できない場合（セッション詳細から手動取得）

PAC CLI が未インストール、または `pac auth create` が実行できない環境では、**Power Apps ポータルのセッション詳細** から必要な値を直接取得する。

1. [make.powerapps.com](https://make.powerapps.com) を開く
2. 右上の **⚙（設定）** → **セッション詳細** をクリック
3. 以下の値を `.env` に設定する

| セッション詳細の項目 | .env キー |
|---|---|
| Instance URL | `DATAVERSE_URL` |
| Tenant ID | `TENANT_ID` |
| Environment ID | `ENV_ID` |

> この場合 `PAC_AUTH_PROFILE` は空欄のままで可。Python 認証は `auth_helper.py` のデバイスコードフローで行われる。

セッション詳細から値を取得したら **Step 4（.env 作成）** に進む。

## Step 3: 環境一覧の取得と選択

```powershell
# プロファイルを横断して環境候補（URL / 環境 ID）を解決し、番号付きで一覧表示する
python .github/skills/standard/scripts/setup_environment.py --list
```

出力からデプロイ先環境の候補を表形式で提示し、**AskUserQuestion でユーザーに選択させる**。

提示フォーマット例:

```
番号 | プロファイル        | 環境名       | 環境 ID                              | URL
1    | Development         | Dev          | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | https://{org-dev}.crm.dynamics.com
2    | Production (active) | Prod         | yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy | https://{org-prod}.crm.dynamics.com
```

> ユーザーが番号で選べるようにする。`--list` は手動の `pac env list` でも代替できる。

## Step 4: .env の作成

選択した環境から値を抽出し `.env` を生成する。`setup_environment.py --profile` が
`pac org who --json`（URL / 環境 ID）とユーザードメインの OIDC ディスカバリ（テナント GUID）から
自動で `.env` を upsert する。

```powershell
python .github/skills/standard/scripts/setup_environment.py --profile "<ProfileName>" `
  --solution "<SolutionName>" --prefix "<prefix>" --display "<表示名>"
```

手動で行う場合は `.env.example` をコピーして埋める。

```powershell
cp .github/skills/standard/references/.env.example .env
```

自動設定される値:

| .env キー | 取得元 |
|---|---|
| `DATAVERSE_URL` | `pac org who` の OrgUrl |
| `ENV_ID` | `pac org who` の EnvironmentId |
| `TENANT_ID` | ユーザードメインの OIDC ディスカバリ（`token_endpoint` の GUID） |
| `PAC_AUTH_PROFILE` | 選択したプロファイル名 |

## Step 5: Python 認証環境のセットアップ（デバイスコード認証）

```powershell
cd .github/skills/standard/scripts
pip install -r requirements.txt
```

`.env` に `DATAVERSE_URL` と `TENANT_ID` が設定済みなので、auth_helper.py が利用可能になる。

### Python の Dataverse 認証はデバイスコード認証（初回のみ）

`setup_environment.py --profile`（または `--auth-only`）はデバイスコード認証をトリガーする。
**エージェントは表示されたコードと URL をユーザーに伝え**、ブラウザでサインインしてもらう。

```
========================================
  デバイスコード認証
  1. ブラウザで https://login.microsoft.com/device を開く
  2. コード XXXXXXXXX を入力
========================================
```

サインインが成功すると `auth_helper.py` が 2 層キャッシュへ認証を保存する:

1. **AuthenticationRecord**（`.auth_record.json`）— アカウント情報
2. **MSAL 永続トークンキャッシュ** — リフレッシュトークン（OS 資格情報ストア）

これにより 2 回目以降はサイレントリフレッシュとなり、**デバイスコード入力は不要**になる。

> **PAC プロファイルでの Python トークン取得について**: 一部の PAC CLI バージョンには
> `pac auth token` サブコマンドが無く、PAC プロファイルから Dataverse トークンを直接取得できない。
> `auth_helper.py` は PAC トークン取得を試み、失敗時は自動でデバイスコードフローへフォールバックする。
> そのため **Python 側の正式な認証経路はデバイスコード認証（キャッシュ済み）** とみなす。
> `PAC_AUTH_PROFILE` は環境メタデータ（URL / 環境 ID）の取得元として `.env` に保持する。

## Step 6: 既存パブリッシャーの確認と選択

Dataverse API で既存のパブリッシャー（読み取り専用除外）を取得する。

```python
import sys
sys.path.insert(0, "../../standard/scripts")
from auth_helper import api_get

r = api_get("publishers?$select=uniquename,friendlyname,customizationprefix&$filter=isreadonly eq false")
for p in r["value"]:
    print(p.get("customizationprefix"), "|", p.get("uniquename"), "|", p.get("friendlyname"))
```

取得結果を表形式で提示し、**AskUserQuestion** で選ばせる。

提示フォーマット例:

```
番号 | プレフィックス | 一意名          | 表示名
1    | geek          | geekpublisher   | Geek Publisher
2    | contoso       | contoso         | Contoso Ltd
3    | （新規作成）
```

- 既存を選択 → `PUBLISHER_PREFIX` を `.env` に設定
- 新規作成 → プレフィックスと表示名を AskUserQuestion で入力させる

## Step 7: 既存ソリューションの確認と選択

```python
r = api_get(
    "solutions?$select=uniquename,friendlyname,version"
    "&$filter=ismanaged eq false and isvisible eq true"
    "&$orderby=createdon desc"
)
for s in r["value"]:
    print(s.get("uniquename"), "|", s.get("friendlyname"), "|", s.get("version"))
```

取得結果を提示し、**AskUserQuestion** で選ばせる。

提示フォーマット例:

```
番号 | 一意名            | 表示名                    | バージョン
1    | StudentSupport    | 学生サポートエージェント    | 1.0.0.0
2    | ITServiceManager  | IT サービスマネージャー     | 1.2.0.0
3    | （新規作成）
```

- 既存を選択 → `SOLUTION_NAME` と `SOLUTION_DISPLAY_NAME` を `.env` に設定
- 新規作成 → ソリューション名と表示名を AskUserQuestion で入力させ、
  Dataverse テーブル構築スキル側でソリューション作成を実行

## Step 8: .env 最終確認

すべての値が揃った `.env` をユーザーに提示して確認する。

```env
# Power Platform 環境設定（必須）
DATAVERSE_URL=https://{org}.crm.dynamics.com/
TENANT_ID={tenant-id}
ENV_ID={env-id}

# ソリューション設定
SOLUTION_NAME={SolutionName}
SOLUTION_DISPLAY_NAME={ソリューション表示名}
PUBLISHER_PREFIX={prefix}

# PAC CLI 認証プロファイル
PAC_AUTH_PROFILE={ProfileName}
```

確認後、設計フェーズ（architecture スキル）へ進む。

## まとめ: 全体フロー

```
Step 1: .github ダウンロード
  ↓
Step 2: pac auth list → 認証プロファイル確認
  ↓
Step 3: setup_environment.py --list → 環境選択（AskUserQuestion）
  ↓
Step 4: setup_environment.py --profile → .env 生成（URL/環境 ID/テナント自動設定）
  ↓
Step 5: pip install → デバイスコード認証（コードを伝達 → サインイン → auth_helper が認証保存）
  ↓
Step 6: パブリッシャー一覧 → 選択（AskUserQuestion）
  ↓
Step 7: ソリューション一覧 → 選択（AskUserQuestion）
  ↓
Step 8: .env 最終確認 → 設計フェーズへ
```
