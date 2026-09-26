# Foundry IQ リファレンス

## 位置づけ

Foundry IQ は **knowledge layer** であり、データストアではない。Azure AI Search の knowledge base に
複数の knowledge source（Search index / Blob / SharePoint / OneLake / Fabric Ontology / Web など）を束ね、
検索・query planning・回答合成・引用をエージェントへ提供する。

## 使う場面

- マニュアル・規程・FAQ を **引用付き**で回答させる。
- Fabric IQ Ontology の業務エンティティと文書を 1 つの knowledge base で組み合わせる。
- Foundry Agent / Copilot Studio から MCP（`knowledge_base_retrieve`）で呼ぶ。

## 構成要素と作成方法

| 要素 | 作成 | 補足 |
|---|---|---|
| AIServices + project + モデル | `deploy_platform.py`（ARM） | `disableLocalAuth: true`。モデルは chat と embedding |
| Azure AI Search（Basic） | 同上 | `authOptions.aadOrApiKey` でトークン認証を有効化、semantic ranker `free` |
| ロール | 同上 | Search MI → Cognitive Services User（account）、project MI と操作者 → Search Index Data Contributor（search）、操作者 → Search Service Contributor |
| index・文書 | `configure_semantics.py --target foundry-kb` | index API `2025-09-01` |
| knowledge source / base | 同上 | `2026-08-01-preview` |
| Fabric Ontology source | `--with-fabric-ontology` | `kind: fabricOntology`。reasoning は `low` 以上が必須 |

## retrieve の入力形状（実測）

| reasoning | 入力 | 備考 |
|---|---|---|
| `minimal` | `intents: [{type: "semantic", search}]` | LLM なし。抽出のみ |
| `low` / `medium` | `messages: [{role, content: [{type: "text", text}]}]` | query planning・回答合成 |

- `206 Partial Content` は一部 source の失敗。`activity[].error` を確認する。
- Fabric Ontology source は OBO。利用者トークンを `x-ms-query-source-authorization` で渡す（`https://search.azure.com/.default`）。

## MCP

```text
https://<search>.search.windows.net/knowledgebases/<kb>/mcp?api-version=2026-08-01-preview
```

- ツール: `knowledge_base_retrieve`。呼び出し主体に Search Index Data Reader が必要。
- 引数（実測 2026-09-25）: `query_variants`（文字列配列、要素は 1 つだけ・400 文字以内）。利用者の質問を言い換えずに渡す。
- MCP の結果は `result.content[].text` のみ（`activity` / `references` は含まれない）。引用の検証は REST retrieve で行う。

## コスト

- AI Search Basic は停止できない時間課金。不要になったらリソースグループごと削除する（利用者の明示依頼時のみ）。
- モデルはトークン従量。

## 参考（Microsoft Learn）

- [Knowledge base の retrieve / MCP](https://learn.microsoft.com/azure/search/agentic-retrieval-how-to-retrieve)
- [Fabric Ontology knowledge source](https://learn.microsoft.com/azure/search/agentic-knowledge-source-how-to-fabric-ontology)
- [Foundry IQ 概要](https://learn.microsoft.com/azure/foundry/agents/concepts/what-is-foundry-iq)
