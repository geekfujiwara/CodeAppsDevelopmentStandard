# Microsoft Foundry エージェント開発 (Web 組み込み / 知識グラウンディング / AI Gateway)

> **目的**: Microsoft Foundry Agent Service でエージェントを構築し、**Web サイトに組み込み**、
> **Work IQ / Foundry IQ / Fabric IQ** の知識でグラウンディングし、**AI Gateway** でガバナンスする際の
> リファレンスとベストプラクティス。テナントのセキュリティガバナンス（Entra 認証・VNet・RBAC）に準拠する。
>
> ⚠ 本領域は変化が速く、多くの機能が **preview**。API 名・可用性は必ず公式ドキュメント（Microsoft Learn）で裏取りする。
> 主要出典: [Foundry Agent Service 概要](https://learn.microsoft.com/azure/ai-foundry/agents/overview) /
> [ツールカタログ](https://learn.microsoft.com/azure/ai-foundry/agents/concepts/tool-catalog) /
> [AI gateway (API Management)](https://learn.microsoft.com/azure/api-management/genai-gateway-capabilities)

---

## 1. Foundry Agent Service の全体像

エージェント = **モデル + 指示(instructions) + ツール(tools)**。Foundry Agent Service はマネージド基盤。

| 構成要素 | 内容 |
|---|---|
| **Responses API** | すべてのエージェント種別の単一入口。モデル + プラットフォームツール(file search / code interpreter / web search / memory / MCP 等)へアクセス |
| **Prompt agents** | ポータル/SDK/REST で定義。**フルマネージド**（コンピュート・コンテナ管理不要） |
| **Hosted agents** | 自作コード(Agent Framework / LangGraph / OpenAI Agents SDK 等)をコンテナ/zip で持ち込み。マネージドエンドポイント・自動スケール・**専用 Entra ID**・可観測性 |
| **Toolbox** | 複数ツールを1つの **MCP 互換エンドポイント**に束ね、バージョン管理して再利用 |
| **Publishing** | 安定エンドポイント化・バージョン管理。**Microsoft 365 Copilot / Teams**・**Entra Agent Registry**・**A2A プロトコル(preview)** で配布 |

**エンタープライズ機能**: 各エージェントに **専用 Entra ID**、**Private networking(VNet)**（Prompt agents / Hosted agents は BYO VNet サンドボックス）、**RBAC**（`Foundry User`/`Foundry Owner` 等）、**コンテンツ安全**（XPIA 対策ガードレール）、**可観測性**（トレース + Application Insights）。BYO リソース（Storage / Azure AI Search / Cosmos DB を会話状態に利用可）。

---

## 2. Web サイト組み込み型エージェント

Foundry のパブリッシュ先は主に M365 Copilot / Teams。**任意の Web サイトへ組み込む**場合は、
**バックエンドから Responses API / エージェントエンドポイントを呼び、ブラウザへストリーム**するのが基本パターン
（このスキルの [secure-website.md](secure-website.md) と同じ「API プロキシ」思想）。

```
[ブラウザ(チャットUI)] ──HTTPS──> [自前バックエンド(Functions/App Service)]
                                     ├ 認証: エンドユーザー(Entra/独自) を検証
                                     ├ Foundry 呼び出し: Managed Identity で Responses API を呼ぶ
                                     │   (DefaultAzureCredential / エージェントの Entra ID)
                                     └ ストリーミング応答をブラウザへ中継(SSE 等)
```

**ベストプラクティス**
- **モデル/エージェントのキーをブラウザに出さない**。呼び出しは必ずバックエンド経由（キーは env / Key Vault）。
- ユーザーごとのデータアクセスは **On-Behalf-Of (OBO) パススルー**でエンドユーザー ID を伝播（下記 §3）。
- ストリーミングは SSE 等でトークン逐次配信。会話状態は BYO Cosmos DB 等に保持。
- テナントが公衆アクセスを制限する場合は [secure-website.md](secure-website.md) の Private Endpoint + VNet 統合構成に載せる。

---

## 3. 知識グラウンディング (Work IQ / Foundry IQ / Fabric IQ)

エージェントを組織データで**グラウンディング**する Foundry の知識層。いずれも **Entra 認証 + 最小権限**が原則。

| 知識ソース | 位置づけ | 実装(確認済みの範囲) |
|---|---|---|
| **Fabric IQ** (Microsoft Fabric データエージェント / preview) | Fabric(OneLake/Power BI セマンティックモデル/Lakehouse/Warehouse/KQL)を会話で分析 | ツール `fabric_dataagent_preview`。プロジェクト接続(workspace_id/artifact_id)を作成し接続 ID を渡す。**OBO(ユーザー ID パススルー)**。SP 認証は非対応。要 `Foundry User` + Fabric データエージェント READ + 各データソース権限(Power BI は `Build`)。同一テナント必須。 |
| **Work IQ** (Foundry 専用ツール) | Microsoft 365 の業務データ(メール/ファイル/チャット等)でグラウンディング | Foundry のツールカタログから構成。**OBO** でエンドユーザーの M365 権限に従う。詳細・可用性は公式ツールカタログを参照(preview のため変動)。 |
| **Foundry IQ** | 統合ナレッジ/エージェント型検索(agentic retrieval)の知識層 | 知識ベースを一元管理しエージェントに接続。基盤は Azure AI Search 等。具体 API は公式ドキュメントで確認(急速に更新)。 |
| (基礎) **Azure AI Search / File Search** | 自前ドキュメントのベクター検索 | ビルトインツール。`file_search`(vector_store_ids)/ Azure AI Search インデックス接続。 |

> **重要(裏取り方針)**: Work IQ / Foundry IQ は本ドキュメント作成時点で preview/更新途上。
> **ツール名・パラメータ・可用性は必ず [ツールカタログ](https://learn.microsoft.com/azure/ai-foundry/agents/concepts/tool-catalog) と各ツール how-to で確認**し、推測で API を書かない。

### Fabric データエージェント接続の要点(確認済み)
- Fabric 側でデータエージェントを**発行**→ Foundry の Management center > Connected resources で **Microsoft Fabric** 接続を作成(workspace_id / artifact_id)。
- ツールは `MicrosoftFabricPreviewTool` / REST `fabric_dataagent_preview`。`tool_choice=required` で強制呼び出し可。
- **OBO**: クエリはサインインユーザーの ID で実行。各ユーザーに Fabric データエージェント + 元データの権限が必要。

---

## 4. AI Gateway (Azure API Management) でのガバナンス

複数アプリ/エージェントが LLM を使う規模になったら **AI Gateway** で一元ガバナンスする。

| 目的 | 機能(ポリシー) |
|---|---|
| トークン制御 | **token rate limiting / quota**（`llm-token-limit`。TPM/期間別クォータ、prompt トークン事前計算） |
| コスト/性能 | **semantic caching**（`llm-semantic-cache-*`、Azure Managed Redis で類似プロンプト再利用） |
| セキュリティ | **Managed Identity でバックエンド認証**（キー不要）、OAuth 認可、**content safety**（`llm-content-safety`） |
| 冗長性 | backend **load balancer**（round-robin/weighted/priority/session-aware）+ **circuit breaker**（`Retry-After` 準拠） |
| 可観測性 | **`llm-emit-token-metric`**（消費者別トークン計測、App Insights）、プロンプト/完了ログ、内蔵ダッシュボード |
| 統合 | **unified model API(preview)**（複数プロバイダを単一 OpenAI 互換エンドポイント化）、MCP サーバー/A2A 管理 |

**AI gateway in Microsoft Foundry (preview)**: Foundry 環境から AI トラフィックを直接ガバナンス。
- **Models**: Foundry UI からモデル配備のトークンクォータ/レート制限を設定。
- **Agents**: どこ(Azure/他クラウド/オンプレ)で動くエージェントも Foundry コントロールプレーンに登録し一元管理・テレメトリ・ポリシー適用。
- **Tools**: 任意環境の MCP ツールを登録しガバナンス/発見。
- 参考: [Enable AI gateway in Foundry](https://learn.microsoft.com/azure/ai-foundry/configuration/enable-ai-api-management-gateway-portal) / [Govern tools with AI gateway](https://learn.microsoft.com/azure/ai-foundry/agents/how-to/tools/governance)

---

## 5. セキュア開発ベストプラクティス(網羅要素)

| 領域 | 実践 |
|---|---|
| **アイデンティティ** | エージェントに専用 Entra ID。ツール/データは **Managed Identity + RBAC**。ユーザーデータは **OBO パススルー**。キー認証は避け Entra を既定に。 |
| **ネットワーク** | Private networking(VNet)。バックエンド/知識ソースが公衆アクセス禁止なら [secure-website.md](secure-website.md) の Private Endpoint 構成に載せる。 |
| **シークレット** | コードに置かない。env / **Key Vault 参照**。`AGENT_TOKEN` 等のベアラートークンはコミット禁止。 |
| **コンテンツ安全** | ガードレール/コンテンツフィルタで **プロンプトインジェクション(XPIA)** を緩和。AI Gateway の content safety ポリシー併用。 |
| **ガバナンス** | AI Gateway で **トークンクォータ/レート制限/課金ログ**。Foundry control plane にエージェント/ツールを登録。 |
| **可観測性** | エージェントトレース + Application Insights。全モデル呼び出し/ツール実行を記録。 |
| **ライフサイクル** | Create → Test(playground) → Trace → Evaluate → Optimize → **Publish(バージョン管理/安定エンドポイント)** → Monitor。 |
| **最小権限データ** | Fabric/Work は各ユーザーの元データ権限に従う(OBO)。過剰権限を付与しない。 |

---

## 6. 実装の起点(コード)

Responses API を Managed Identity で呼ぶ最小例(Python, prompt agent):
```python
from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import PromptAgentDefinition, WebSearchTool

PROJECT_ENDPOINT = "https://<resource>.ai.azure.com/api/projects/<project>"  # 実値は env から
project = AIProjectClient(endpoint=PROJECT_ENDPOINT, credential=DefaultAzureCredential())
openai = project.get_openai_client()

agent = project.agents.create_version(
    agent_name="site-assistant",
    definition=PromptAgentDefinition(
        model="gpt-4.1-mini",
        instructions="You are a helpful website assistant.",
        tools=[WebSearchTool()],   # 必要に応じ Fabric/AI Search 等を追加
    ),
)
resp = openai.responses.create(
    input="…user question…",
    extra_body={"agent_reference": {"name": agent.name, "type": "agent_reference"}},
)
print(resp.output_text)   # Web バックエンドではストリームをブラウザへ中継
```

> Hosted agent（自作コードをコンテナ化）にする場合も、同じ Agent Framework コードを Responses API 経由で呼べる。
> 詳細・最新 API は [Get started (code)](https://learn.microsoft.com/azure/ai-foundry/agents/quickstarts/get-started-code) を参照。

---

## 7. 参考リンク(公式)
- [Foundry Agent Service 概要](https://learn.microsoft.com/azure/ai-foundry/agents/overview)
- [エージェントツールカタログ](https://learn.microsoft.com/azure/ai-foundry/agents/concepts/tool-catalog)
- [Microsoft Fabric データエージェントツール](https://learn.microsoft.com/azure/ai-foundry/agents/how-to/tools/fabric)
- [AI gateway (API Management)](https://learn.microsoft.com/azure/api-management/genai-gateway-capabilities)
- [Agent identity](https://learn.microsoft.com/azure/ai-foundry/agents/concepts/agent-identity) / [Virtual networks](https://learn.microsoft.com/azure/ai-foundry/agents/how-to/virtual-networks)
