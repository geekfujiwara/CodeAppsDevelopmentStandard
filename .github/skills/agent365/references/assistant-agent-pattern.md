# 秘書・同僚エージェントの標準品質

Agent 365 の agentUser を、単に質問へ答える bot ではなく、仕事を前へ進める同僚として作る標準パターン。
どの役割を任せ、どの機能ブロックを入れるかは
[digital-colleague-design.md](digital-colleague-design.md) で先に決める。ここはその**品質基準**。
正常系の導入順は [SKILL.md](../SKILL.md) Step 8 / 13、症状別の対処は
[troubleshooting.md](troubleshooting.md) #21〜23 を参照する。

## 責務の分離

| 層 | 責務 |
|---|---|
| システム プロンプト | 役割、口調、承認の解釈、検索を始める条件、結果の伝え方 |
| MCP クライアント | ツール実行、`isError` 判定、`structuredContent` の取り込み、破壊的ツールの拒否 |
| Dataverse / Microsoft 365 | 行・列・操作の認可。機微情報を守る最終境界 |
| バックグラウンド ワーカー | メール監視や Teams プレゼンスなど、会話ターン外の継続動作 |

プロンプトだけで認可を代用しない。反対に、接続先が許可した情報を「HR」などの分類名だけで
検索前から拒否しない。モデルは**実際の認可結果に従う案内役**とする。

## 承認後は同じターンで実行する

会話履歴に候補・対象・内容が揃っているときの「お願い」「OK」「それで進めて」は承認である。
次のターンで説明や候補を繰り返さず、対応する作成・更新・送信ツールを呼ぶ。

プロンプトには次の 3 点を明記する。

1. 短い承認語は直前の提案を参照する。
2. 書き込みツールの結果を受け取る前に、権限不足を推測して断らない。
3. ツールが明示したエラーだけを失敗として伝え、確定済みの氏名・日時・宛先は保持する。

予定調整では、候補提示時に件名・所要時間・オンライン会議有無も示す。承認後はその値を再利用する。
複数候補への単なる「お願い」は先頭候補で進める、と事前にプロンプトで定義しておくと曖昧さが残らない。

## Dataverse は権限準拠で前のめりに検索する

「最近の面談」「HR の情報」のようにデータ ソースが推定できる依頼では、最初に Dataverse を検索する。

1. `search` / `search_data` で関連テーブル・レコードを探す。
2. 論理名や列が不明なら `describe` する。
3. 必要な件数だけ `read_query` し、日付・相手・種別・要点をまとめる。
4. 接続先が返さなかった列や 403 のレコードは開示しない。

「人事だから不可」と先に決めない一方、検索範囲を広げるために強いロールを安易に付けない。
Dataverse の業務ロール、行共有、列セキュリティを正として扱う。

## 温かい人格は動作規則として書く

「フレンドリーに」だけでは応答が安定しない。次を具体的に定義する。

- 敬語だが堅すぎない社内チャットの距離感
- 「見てきますね」「お任せください」「できました」など、行動に結びつく短い一言
- 聞き返しは手戻りが大きい 1 点だけ。軽い項目は既定値で進める
- 断る場合も、確認できたことと次にできることを 1 つ添える
- キャラクター設定は口調と働き方へ反映し、毎回自己紹介したり過剰に演じたりしない

[templates/assistant-system-prompt.template.md](templates/assistant-system-prompt.template.md) を初期値にし、
業務固有の既定値とツール名だけを追加する。

## Teams プレゼンス

### なぜ heartbeat が必要か

agentUser は通常のユーザー オブジェクトとして表示されるが、Teams クライアントへ対話サインインしない。
そのため App Service が常時稼働していても、presence session が無ければ Offline（×）になる。

Microsoft Graph `POST /users/{id}/presence/setPresence` はアプリの presence session を作れる。
application permission は `Presence.ReadWrite.All`。このロールは Agent 365 ブループリントではなく、
Graph を呼ぶ App Service の UAMI に付与する。ブループリント principal のプラットフォーム管理ロールを
変更してはいけない。

### 標準値

| 項目 | 値 | 理由 |
|---|---|---|
| availability / activity | `Available` / `Available` | 稼働中の秘書として表示 |
| expirationDuration | `PT4H` | Graph の最大セッション寿命 |
| 更新間隔 | 2 時間 | 一時的な更新失敗に余裕を持たせる |
| 初回更新 | App Service 起動直後 | 再デプロイ後に早く復帰 |

App Service が停止すれば最長 4 時間で Offline に戻る。永続的な preferred presence を設定しないため、
実際には止まっているエージェントを Available のまま見せ続けない。

### 実装

1. `scripts/configure_agent_presence.py` で UAMI の app role と agentUser を確認・設定する。
2. [templates/PresenceWorker.template.cs](templates/PresenceWorker.template.cs) をアプリへコピーする。
3. `TokenCredential` を DI へ singleton 登録し、Azure OpenAI と worker で同じ UAMI を使う。
4. `builder.Services.AddHostedService<PresenceWorker>();` を追加してデプロイする。
5. App Service ログの `Teams presence refreshed for agentic user` を確認する。

`Program.cs` の登録例:

```csharp
using Azure.Core;
using Azure.Identity;

builder.Services.AddHttpClient();
builder.Services.AddSingleton<TokenCredential>(_ =>
	new DefaultAzureCredential(new DefaultAzureCredentialOptions
	{
		ManagedIdentityClientId = builder.Configuration["Presence:SessionId"],
	}));
builder.Services.AddHostedService<PresenceWorker>();
```

Azure OpenAI でも同じ UAMI を使う場合は、この `TokenCredential` を `AzureOpenAIClient` の生成時にも
DI から取得する。別の managed identity を使う場合は credential を名前付きで分ける。

コピー先プロジェクトに既定の名前空間がある場合は、`PresenceWorker.cs` にその `namespace` 宣言だけを加える。

ユーザー ID、UPN、UAMI client ID はコードへ埋め込まない。`.env` からスクリプトへ渡し、App Service の
`Agentic__UserId` / `Presence__SessionId` に保存する。これらは秘密鍵ではないがテナント固有識別子なので、
公開テンプレートではプレースホルダーにする。

`setUserPreferredPresence` は presence session が存在するときだけ有効であり、これだけを呼んでも
Offline は解消しない。標準実装は `setPresence` を使う。

## リリース前の会話テスト

| シナリオ | 期待結果 |
|---|---|
| 候補提示 → 「お願い」 | 同じターンで作成ツールを呼び、作成結果を報告 |
| 「最近の HR 面談を見て」 | Dataverse を検索し、許可された範囲を要約 |
| 名前だけの相手を指定 | ディレクトリ検索を先に行い、一意なら進行 |
| ツールが 403 | 推測で補わず、失敗した操作と代替を 1 つ案内 |
| App Service 再起動 | 起動ログに presence refresh 成功 |

作成系の試験は専用テスト ユーザー・テスト レコードで行い、本番会議や本番 HR レコードを検証目的で
作成・変更しない。