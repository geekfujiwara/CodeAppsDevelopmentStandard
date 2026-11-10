# インタラクティブ環境セットアップ手順

プロジェクト新規開始時に **PAC CLI** と **Dataverse API** を使って `.env` を対話的に構成する。
手動でセッション詳細を開く必要がなく、エージェントがユーザーに選択肢を提示して進める。

**クイックスタートでは [quickstart.md](quickstart.md) Step 0〜3 を優先する。**
認証後に必ず質問して止まらず、依頼・既存 `.env`・資料・テンプレート・読み取り API から
環境・publisher・solution 等を特定する。通常の選択・名前付けは安全な規定値で決めて記録する。
承認範囲外・本番しかない・テナント不明など、本人の判断が不可欠な事項だけをまとめて確認し、
その回答を待つ間も無関係な実装・テストは継続する。
新しい開発構成の名前は既存命名規則から提案・決定し、既知の値を聞き直さない。

> 前提: PAC CLI がインストール済み（VS Code 拡張機能『Power Platform Tools』 or `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`）。
> PAC CLI は npm では配布されていない。`@microsoft/power-apps-cli` は別物（Code Apps 用の `power-apps` コマンド）なので混同しないこと。

## 標準フロー（PAC プロファイル → 環境選択 → インタラクティブ認証）

このスキルの推奨セットアップは次の 4 ステップで、`scripts/setup_environment.py` が自動化する。

1. **PAC プロファイルから環境を取得** — `pac auth list` のプロファイルを `pac org who` で解決し、環境候補（URL / 環境 ID）を一覧化する。
2. **対象環境を自動解決** — `.env` や依頼に対象があれば優先する。指定がなければ既存プロファイル・環境メタデータから開発用候補を選ぶ。開発環境と判断できず、複数の実質的に異なる候補から選択が必要な場合だけ確認する。
3. **設定保存 → キャッシュ優先認証** — `.env` を `--no-auth` で構成し、本人が承認したアカウント・Edgeプロファイル・追加認証の継続許可を保存してから、必要時だけブラウザー認証する。デバイスコード認証は使わない。
4. **auth_helper に認証を保存** — 認証成功時に `AuthenticationRecord`（`~/.power-platform-cli/auth_record_{TENANT_ID}.json`、ホームディレクトリ配下でマシン全体共有）と MSAL 永続キャッシュへ保存され、以降は**このマシン上のどのプロジェクトでも** Python スクリプトはキャッシュから認証される。

```powershell
# 1〜2: 環境候補を一覧表示（明示指定がない場合の判断材料）
python .github/skills/standard/scripts/setup_environment.py --list

# 3〜4: 認証前に環境設定と承認済みブラウザー設定を保存
python .github/skills/standard/scripts/setup_environment.py --profile "<ProfileName>" `
  --solution "<SolutionName>" --prefix "<prefix>" --display "<表示名>" --no-auth
python .github/skills/standard/scripts/auth_preferences.py `
  --account <approved-upn> --edge-profile "Profile N" --approve-interactive

# 既存 .env で認証キャッシュを確認（未作成ならブラウザー認証して保存）
python .github/skills/standard/scripts/setup_environment.py --auth-only
```

`auth_preferences.py` は設定保存専用でブラウザーを開かない。トークンは `.env` に保存しない。
以後は保存済み許可で追加認証から復旧し、CIではブラウザーを開かない。
PythonはWindowsの指定Edgeプロファイルを使用する。npm CLIは別キャッシュとOS既定ブラウザーを使い、
プロファイルを強制指定できないため、[Code Apps認証運用](../../code-apps/references/authentication-lifecycle.md)も確認する。

> 以降の Step 1〜8 は、この自動フローの各段階の詳細・手動フォールバックである。

## Step 1: .github スキルのダウンロード

新規のクイックスタートは [quickstart.md](quickstart.md) Step 0 の
`scripts/initialize_workspace.py` で `.github/agents` / `.github/skills` / `.gitignore` を安全に配置する。
既存の標準・社内ルール・`.gitignore` を `--force` や `cp` で上書きしない。
この配置だけで終了せず、明示された依頼から仕様整理・architecture・フル構成の開発デプロイ・実動作検証まで進む。

> ブラウザ操作（ポータルのフォーム入力等）は **VS Code 統合ブラウザツール**を使う。
> Playwright MCP のインストール・`.vscode/mcp.json` への登録は行わない
> （→ [ブラウザ自動化方針](browser-automation.md)）。

## Step 2: PAC 認証プロファイルの確認

既存の認証プロファイルを確認する。

```powershell
pac auth list
```

- プロファイルが **ある** → 既存 `.env` や対象環境と一致するものを使う。複数プロファイルの存在だけを理由に選択質問をしない
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

> この場合 `PAC_AUTH_PROFILE` は空欄のままで可。Python 認証は `auth_helper.py` のインタラクティブブラウザー認証で行われる。

セッション詳細から値を取得したら **Step 4（.env 作成）** に進む。

## Step 3: 環境一覧の取得と選択

```powershell
# プロファイルを横断して環境候補（URL / 環境 ID）を解決し、番号付きで一覧表示する
python .github/skills/standard/scripts/setup_environment.py --list
```

出力を使って、依頼・`.env`・既存アプリ・ソリューションと一致する開発環境を選ぶ。
候補が複数でも、開発区分と既存資産から一つに決められる場合は理由を記録して続行する。
本番しかない、テナントが異なる、または複数候補の選択でデータ・公開範囲が変わり自動判定できない場合だけ確認する。

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

## Step 5: Python 認証環境のセットアップ（未キャッシュの場合のみインタラクティブ認証）

```powershell
cd .github/skills/standard/scripts
pip install -r requirements.txt
```

`.env` に `DATAVERSE_URL` と `TENANT_ID` が設定済みなので、auth_helper.py が利用可能になる。

### Python の Dataverse 認証はキャッシュ優先、必要時だけブラウザー

`setup_environment.py --profile ... --no-auth` と設定保存を先に実行し、
`--auth-only` で `auth_helper.get_token(allow_interactive=True)` を呼ぶ。
既存キャッシュからサイレント取得し、追加認証が必要な場合だけ承認済みブラウザー設定を使う。
通常の更新でも保存済み継続許可で復旧できるが、再認証不要を永久には保証しない。
認証成功時に `auth_helper.py` が 2 層キャッシュへ保存する:

1. **AuthenticationRecord**（`~/.power-platform-cli/auth_record_{TENANT_ID}.json`）— テナント・アカウント情報の JSON
2. **MSAL 永続トークンキャッシュ** — アクセストークン・リフレッシュトークン（OS 資格情報ストア）

JSON はリポジトリや `.env` に置かず、トークンは JSON に含めない。これにより同じ tenant/client ID では
別スクリプト・別プロジェクトからもキャッシュを再利用し、2 回目以降はサイレントリフレッシュできる。
デバイスコード認証は行わない。

> **PAC プロファイルでの Python トークン取得について**: 一部の PAC CLI バージョンには
> `pac auth token` サブコマンドが無く、PAC プロファイルから Dataverse トークンを直接取得できない。
> `auth_helper.py` は PAC トークン取得を試み、失敗時は `InteractiveBrowserCredential` を使う。
> そのため **Python 側の正式な認証経路はインタラクティブブラウザー認証（キャッシュ済み）** とみなす。
> `PAC_AUTH_PROFILE` は環境メタデータ（URL / 環境 ID）の取得元として `.env` に保持する。

## Step 6: 既存パブリッシャーの解決

Dataverse API で既存のパブリッシャー（読み取り専用除外）を取得する。

```python
import sys
sys.path.insert(0, "../../standard/scripts")
from auth_helper import api_get

r = api_get("publishers?$select=uniquename,friendlyname,customizationprefix&$filter=isreadonly eq false")
for p in r["value"]:
    print(p.get("customizationprefix"), "|", p.get("uniquename"), "|", p.get("friendlyname"))
```

既存プロジェクト・`.env`・ソリューションの prefix と一致するパブリッシャーを選ぶ。
候補が一つ、または既存資産から一つに絞れる場合は確認質問をせず `.env` に設定する。
一致候補がなく新規作成が必要なら、プロジェクト名と既存命名規則から prefix / 表示名を決める。
複数の実質的に異なる候補が残り、誤選択で別組織の資産を変更し得る場合のみ Step 8 の一括確認に含める。

提示フォーマット例:

```
番号 | プレフィックス | 一意名          | 表示名
1    | geek          | geekpublisher   | Geek Publisher
2    | contoso       | contoso         | Contoso Ltd
3    | （新規作成）
```

- 既存を選択 → `PUBLISHER_PREFIX` を `.env` に設定
- 新規作成 → 汎用の命名規則から値を生成する。本人しか決められない衝突がある場合だけ確認する

## Step 7: 既存ソリューションの解決

```python
r = api_get(
    "solutions?$select=uniquename,friendlyname,version"
    "&$filter=ismanaged eq false and isvisible eq true"
    "&$orderby=createdon desc"
)
for s in r["value"]:
    print(s.get("uniquename"), "|", s.get("friendlyname"), "|", s.get("version"))
```

`.env`・既存アプリ・関連テーブル・ソリューション履歴と一致するソリューションを優先する。
既存プロジェクトで候補が一つに決まるか、新規開発用を命名規則から安全に作成できる場合は質問せず進める。
本番資産しかない、または候補によって変更対象・外部影響が変わり読み取り情報では決められない場合だけ確認する。

提示フォーマット例:

```
番号 | 一意名            | 表示名                    | バージョン
1    | StudentSupport    | 学生サポートエージェント    | 1.0.0.0
2    | ITServiceManager  | IT サービスマネージャー     | 1.2.0.0
3    | （新規作成）
```

- 既存を選択 → `SOLUTION_NAME` と `SOLUTION_DISPLAY_NAME` を `.env` に設定
- 新規作成 → 名前・表示名を既存命名規則から決め、Dataverse テーブル構築スキル側で作成する

## Step 8: .env の安全な読み戻し

`.env` に値を保存したら、秘密を含めず接続先・ソリューション・publisher の名前だけを読み戻して検証する。
内容を毎回ユーザーに承認させない。実際の環境選択が曖昧で本番・別テナントへ影響し得る場合のみ、未解決の候補をまとめて確認する。

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

読み戻し成功後は設計フェーズ（architecture スキル）へ進む。

## まとめ: 全体フロー

```
Step 1: .github ダウンロード
  ↓
Step 2: pac auth list → 既存設定と対象環境に一致する認証プロファイルを再利用
  ↓
Step 3: setup_environment.py --list → 対象を自動解決、本人判断が必要な場合だけ確認
  ↓
Step 4: setup_environment.py --profile → .env 生成（URL/環境 ID/テナント自動設定）
  ↓
Step 5: pip install → インタラクティブブラウザー認証（サインイン → auth_helper が認証保存）
  ↓
Step 6: パブリッシャー一覧 → 既存資産・prefixから自動解決
  ↓
Step 7: ソリューション一覧 → 既存プロジェクトから自動解決、なければ命名規則から作成
  ↓
Step 8: .env 読み戻し → 設計フェーズへ
```
