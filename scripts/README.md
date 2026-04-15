# scripts/ — デプロイスクリプト

## 共通テンプレート（そのまま再利用可能）

| ファイル | 用途 |
|---------|------|
| `auth_helper.py` | MSAL 認証ヘルパー（Dataverse / Flow / PowerApps API） |
| `requirements.txt` | Python 依存関係 |

## サンプル実装（プロジェクトに合わせて書き換え）

以下のスクリプトは **インシデント管理** をサンプル題材としたリファレンス実装です。
テーブル名・エージェント名・フロー名等をプロジェクトに合わせて書き換えてください。

### Dataverse 構築
| ファイル | 用途 | 書き換え対象 |
|---------|------|-------------|
| `setup_dataverse.py` | テーブル一括構築 | テーブル定義・列・Lookup・デモデータ |
| `add_to_solution.py` | ソリューション包含検証 | テーブル名リスト |

### Copilot Studio エージェント
| ファイル | 用途 | 書き換え対象 |
|---------|------|-------------|
| `deploy_agent.py` | エージェント設定 | BOT_NAME・Instructions・推奨プロンプト |
| `cleanup_bot.py` | トピック削除 | — |

### Power Automate フロー
| ファイル | 用途 | 書き換え対象 |
|---------|------|-------------|
| `deploy_flow.py` | ステータス変更通知 | テーブル名・通知メール本文 |
| `deploy_flow_sp_teams.py` | SharePoint → Teams 通知 | サイト URL・チャネル ID |
| `deploy_flow_create_notify.py` | レコード作成通知 | テーブル名・通知内容 |

### 共通パターン

すべてのスクリプトは `.env` から環境変数を読み込みます:

```env
DATAVERSE_URL=https://{org}.crm7.dynamics.com/
TENANT_ID={your-tenant-id}
SOLUTION_NAME={YourSolutionName}
PUBLISHER_PREFIX={prefix}
```

`SOLUTION_NAME` のデフォルト値が `IncidentManagement` になっているスクリプトがありますが、
**必ず `.env` で正しい値を設定してください**。デフォルト値はサンプル用です。
