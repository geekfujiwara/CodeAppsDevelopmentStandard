---
name: Setup Development Environment
description: "ローカル開発環境から Power Platform クラウド環境までを一気通貫で準備・検証する"
argument-hint: "準備する Power Platform 開発環境"
agent: agent
---

ローカル開発環境の準備から、Power Platform のクラウド環境準備まで、一気通貫で実行してください。
途中で Power Platform 管理者権限が必要な工程に到達し、自分（実行者）がその権限を持っていないと判明した場合は、
その時点で処理を中断し、不足している権限と管理者への依頼内容を整理して報告し、終了してください。
無理に権限を回避・昇格しようとしないでください。

## フェーズ 1: ローカル開発環境の準備

1. Git / Node.js LTS / Python 3.12 を導入する。既定のターミナル（Windows の場合 PowerShell 5.1 で可、追加導入は不要）で動作すればよい。
2. `npm install -g degit` で degit をグローバル導入する。
3. Power Platform は PP CLI（pac）のみ導入する（VS Code 拡張は入れない）。
4. **必要なすべてのツールの PATH を通す**。実体パスを確認したうえで、未登録のものは**ユーザー環境変数 PATH に恒久的に追加**し、さらに現在のセッションの `$env:Path` にも反映して、ターミナルを開き直さずに続行できる状態にする。対象は以下（実際のインストール先に読み替える）。
   - Git: `%ProgramFiles%\Git\cmd`
   - Node.js / npm / npx: `%ProgramFiles%\nodejs`
   - npm グローバル（degit など。`npm config get prefix` で確認）: `%APPDATA%\npm`
   - Python 3.12 本体とスクリプト: `%LOCALAPPDATA%\Programs\Python\Python312` と `%LOCALAPPDATA%\Programs\Python\Python312\Scripts`
   - Power Platform CLI（pac）: MSI 版は `%LOCALAPPDATA%\Microsoft\PowerAppsCLI`、dotnet tool 版は `%USERPROFILE%\.dotnet\tools`
   - GitHub CLI（gh）: `%ProgramFiles%\GitHub CLI`
   - VS Code CLI（code）: `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin`
   - 追加時は既存の PATH を上書きせず**追記**し、重複エントリは作らないこと。特に Node.js インストール直後は `npx` が既存ターミナルで認識されないため、この反映を必ず行う。
5. `gh auth status` で GitHub CLI のログイン状態を確認する（未ログインなら `gh auth login` を案内）。
6. `npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents` と `npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills` を実行し、admin スキルを含むスキル一式とエージェント定義を取得する。
7. `python -m pip install -r .github/skills/standard/scripts/requirements.txt` を実行する。
8. クラウド側の準備に進めるよう、`.env` に設定する `TENANT_ID` / `ENV_ID` / `DATAVERSE_URL` の値をユーザーに確認する。
9. **認証方式はユーザーに確認せず、エージェントが順に検証してキャッシュできる方式を採用する。** まず `.env` に `AUTH_MODE=interactive` を設定し、ローカルブラウザでの**インタラクティブ認証**で `AuthenticationRecord`（認証キャッシュ）が作成できるかを検証する。失敗する、またはブラウザ操作ができない環境（ヘッドレスセッション等）では、`.env` から `AUTH_MODE=interactive` を削除（または `AUTH_MODE=device_code` に変更）し、既定の **DEVICE CODE 認証** で再試行する。どちらの方式でキャッシュに成功したかを結果として報告する。この検証は、フェーズ 2 で最初に認証が行われる前に完了させること。

検証コマンド:

- git --version / node --version / npm --version / npx --version / degit --version
- python --version（または py --version）
- pac help（ヘッダの Version を確認）
- gh --version / gh auth status
- where.exe git / where.exe node / where.exe npx / where.exe degit / where.exe python / where.exe pac / where.exe gh（すべて PATH 経由で解決できること）
- 新規に開いたターミナルでも上記が同じ結果になること（恒久的な PATH 登録の確認）

## フェーズ 2: Power Platform 管理者権限の確認（ここで即座に判断する）

1. `.github/skills/admin/SKILL.md` と `.github/skills/admin/references/admin-roles.md` を読み込み、これ以降の操作に必要な最小ロール（Power Platform Administrator 等）を把握する。
2. `python .github/skills/admin/scripts/check_environment.py --environment-id $env:ENV_ID` を実行し、「管理 API アクセス」（管理者ロール相当か）の判定を確認する。（フェーズ 1 の手順 9 で採用が確定した認証方式で初回のみ認証が行われる。以降はキャッシュからサイレントに認証され、再実行時は非対話で完走する。）
3. 管理者権限がない、または判定が NG の場合は、**ここで作業を中断**し、次を報告して終了する。無理に自分の端末や権限で回避しようとしないこと。
   - 何が不足しているか（必要ロール名）
   - 管理者に依頼すべき内容（環境作成・セキュリティ ロール割り当て・Copilot Credits 割り当て・ACP 設定など）

## フェーズ 3: 開発環境の確認（管理者権限がある場合のみ。これから開発に使う 1 環境だけが対象）

`.github/skills/admin/SKILL.md` を読み込む。
**対象は今回開発に使う 1 つの環境に限定する。テナント全体の環境戦略の棚卸し・環境グループの作成・命名規則に沿った環境の一括作成（`scan_environment_strategy.py` / `apply_environment_strategy.py` / `environment_naming.py` / `create_environments.py`）や、Copilot Credits の配分・ACP の適用・CSP の設定などの構成変更は行わない。これらはユーザーが明示的に依頼した場合にのみ実施する。**

1. 今回開発に使う環境を確認する: 既存の Dataverse 環境から選ぶか、専用の Developer/Sandbox 環境を新規作成するかをユーザーに確認する（新規作成する場合は README の「専用環境を作成する」の手順を管理者へ案内）。決定したら `.env` の `ENV_ID` / `DATAVERSE_URL` / `TENANT_ID` を設定する。
2. `check_environment.py --environment-id $env:ENV_ID` を実行し、その環境で開発するにあたり最低限解消すべき問題点（既定環境ではないか・マネージド環境・Dataverse / Code Apps / MCP の有効化・セキュリティ ロール・管理 API アクセス・適用される DLP）を確認する。
3. `python .github/skills/admin/scripts/check_development_environment.py --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID` を実行する。標準利用対象の Dataverse (`shared_commondataserviceforapps`) と新 Copilot Studio Workflow の Agent ノード (`shared_agentnode`) を、環境チェック・クラシック DLP・環境とグループの ACP のすべてで確認する。追加コネクタは `--connector shared_xxx` で列挙する。このコマンドは読み取り専用で、許可追加はしない。
4. `NG` や取得エラーがあれば停止し、解消方法を報告する。ACP で `shared_agentnode` が未許可なら、継承元と影響範囲を確認し、既存の許可設定を保持した1件追加の dry-run を提示する。明示承認後だけ適用し、再チェックする。グループから ACP が削除されても環境側に残る場合があるため、グループへの無条件な新設や全許可化はしない。
5. すべて成功したら構成上の事前チェック完了を報告する。新 Workflow の利用時は、公開前の Review と外部データ・ツールなしの最小実行も確認する。管理画面の Applied やチェック成功だけで実行可能とは断定しない。実行時の DLP/ACP エラーはエラーコードと Last refresh を記録し、追加の権限緩和はしない。

## 完了報告

- フェーズ 1〜3 それぞれの成否を報告する。
- フェーズ 3 で問題（NG）がなければ、続けて README の「クイックスタート」に進んでよい旨を案内する。
- フェーズ 2 で権限不足により中断した場合は、フェーズ 1（ローカル）が完了済みであることと、フェーズ 3 を再開するために必要な条件（誰にどの権限を依頼すべきか）を案内する。
