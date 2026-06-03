# GPQ よろず相談ボット

GPQメンバ全員向けの Teams チャット窓口型 AI エージェントシステム。  
初心者から上級者まで、AI 活用の相談に対して即答・伴走モードで回答し、必要時に DX チームへエスカレーションする。

## アーキテクチャ

```
ユーザー(Teams) → Copilot Studio AI Agent → Power Automate → Dataverse
                   対話オーケストレーション     エスカレーション通知  状態管理・データ基盤
```

## セットアップ手順

### 前提条件

- Power Platform 環境（Dataverse 有効）
- Python 3.10+
- `pip install azure-identity requests python-dotenv`

### 1. 環境設定

```bash
cp .env.example .env
# .env を編集: DATAVERSE_URL, TENANT_ID, PUBLISHER_PREFIX を設定
```

### 2. Phase 1: Dataverse テーブル構築

```bash
cd scripts
python setup_dataverse.py
```

ソリューション作成 → テーブル作成（yorozu_inquiry）→ ローカライズ → デモデータ投入

### 3. Phase 2: Copilot Studio エージェント

1. [Copilot Studio](https://copilotstudio.microsoft.com/) でエージェントを手動作成
   - 名前: `GPQ AI よろず相談パートナー`
   - ソリューション: `よろず相談ボット`
   - 言語: 日本語
2. ブラウザ URL を `.env` に貼り付け: `BOT_ID=https://copilotstudio.../bots/xxxxx/overview`
3. デプロイスクリプト実行:

```bash
python scripts/deploy_agent.py
```

4. 手動でナレッジ追加: Copilot Studio UI → ナレッジ → Dataverse テーブル追加

### 4. Phase 3: Power Automate フロー

```bash
python scripts/deploy_escalation_flow.py
```

エスカレーション時に DX チームへ自動通知メールを送信。

## テーブル構成

### yorozu_inquiry（よろず相談）

| 列 | 型 | 説明 |
|---|---|---|
| name | String | 相談件名 |
| department | Picklist | 部門（物流/購買/品質/その他） |
| email | String | メールアドレス |
| question | Memo | 質問内容 |
| answer | Memo | 回答内容 |
| satisfaction | Integer | 満足度（1-5） |
| category | Picklist | 分類（情報取得/作業支援/設計相談/トラブル対応） |
| supportneeded | Boolean | DXサポート要否 |
| status | Picklist | ステータス（受付済み/対応中/完了/未完了/エスカレーション済み） |
| promptlevel | Picklist | プロンプトレベル（L1-L4） |
| aieffectiveness | Picklist | AI有効性 |
| intentmatch | Picklist | 意図一致 |
| responsemode | Picklist | 回答モード（即答/伴走） |
| resolutionstatus | Picklist | 解決状況 |

## スクリプト一覧

| スクリプト | 役割 |
|---|---|
| `scripts/setup_dataverse.py` | Dataverse テーブル構築 |
| `scripts/deploy_agent.py` | Copilot Studio エージェント設定 |
| `scripts/deploy_escalation_flow.py` | エスカレーション通知フロー |
