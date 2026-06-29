# インタラクティブ環境セットアップ手順

プロジェクト新規開始時に **PAC CLI** と **Dataverse API** を使って `.env` を対話的に構成する。
手動でセッション詳細を開く必要がなく、エージェントがユーザーに選択肢を提示して進める。

> 前提: PAC CLI がインストール済み（`npm install -g @microsoft/power-apps-cli` or Power Platform Tools 拡張機能）。

## Step 1: .github スキルのダウンロード

```powershell
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github --force
cp .github/skills/standard/references/gitignore-template .gitignore
```

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
pac env list
```

出力からデプロイ先環境の候補を表形式で提示し、**AskUserQuestion でユーザーに選択させる**。

提示フォーマット例:

```
番号 | 環境名                | 環境 ID                              | URL
1    | Development           | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | https://{org-dev}.crm.dynamics.com
2    | Production            | yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy | https://{org-prod}.crm.dynamics.com
```

> ユーザーが番号で選べるようにする。

## Step 4: .env の作成

選択した環境から以下の値を抽出し、`.env.example` をベースに `.env` を生成する。

```powershell
cp .github/skills/standard/references/.env.example .env
```

PAC の出力から自動設定する値:

| .env キー | 取得元 |
|---|---|
| `DATAVERSE_URL` | pac env list の Environment URL |
| `ENV_ID` | pac env list の Environment ID |
| `TENANT_ID` | pac auth list の Tenant ID（または pac env who で取得） |
| `PAC_AUTH_PROFILE` | pac auth list のプロファイル名 |

## Step 5: Python 認証環境のセットアップ

```powershell
cd .github/skills/standard/scripts
pip install -r requirements.txt
```

`.env` に `DATAVERSE_URL` と `TENANT_ID` が設定済みなので、auth_helper.py が利用可能になる。

### PAC プロファイルを Python API 実行にも応用する

Step 2 で `pac auth create` が完了し `.env` に `PAC_AUTH_PROFILE` が設定されている場合、
`auth_helper.py` は **デバイスコード認証の代わりに PAC CLI プロファイルを自動的に使用する**。

動作フロー:
1. `get_token()` 呼び出し時に `PAC_AUTH_PROFILE` の有無を確認
2. 設定されている場合: `pac auth select --name {profile}` → `pac auth token --resource {url}` を実行
3. 取得したトークンをインメモリキャッシュに格納（JWT の exp から有効期限を自動取得）
4. PAC CLI が見つからない・失敗した場合は DeviceCode フローへ自動フォールバック

`PAC_AUTH_PROFILE` を設定することで、Step 6 以降の Dataverse API 呼び出しがすべて
PAC プロファイル経由で認証される（初回のデバイスコード入力が不要になる）。

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
Step 3: pac env list → 環境選択（AskUserQuestion）
  ↓
Step 4: .env 生成（環境値を自動設定）
  ↓
Step 5: Python 環境セットアップ（pip install）
  ↓
Step 6: パブリッシャー一覧 → 選択（AskUserQuestion）
  ↓
Step 7: ソリューション一覧 → 選択（AskUserQuestion）
  ↓
Step 8: .env 最終確認 → 設計フェーズへ
```
