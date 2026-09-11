// agent プロジェクト/AgentBrain.cs・appsettings.json を基にした構成の写しです。
// エージェント側の実装や設定を変えたときは、このファイルも合わせて直してください。

export type AgentResource = {
  name: string
  purpose: string
  configKeys: string[]
  tools?: string[]
  notes?: string[]
}

export type AgentResourceGroup = {
  title: string
  description: string
  resources: AgentResource[]
}

export const AGENT_RESOURCE_GROUPS: AgentResourceGroup[] = [
  {
    title: "推論エンジン",
    description: "応答生成とツール呼び出しの選択を行う中核モデル。",
    resources: [
      {
        name: "Azure OpenAI（Chat モデル）",
        purpose: "会話への応答生成、ツール呼び出しの要否判断、Web 検索（Grounding with Bing）の実行。",
        configKeys: ["AzureOpenAI:Deployment", "Agent:MaxToolIterations（既定 24）"],
        notes: ["1 ターンあたりのツール実行ループ回数を Agent:MaxToolIterations で制限する。"],
      },
    ],
  },
  {
    title: "MCP サーバー接続",
    description: "業務データ・社内情報へアクセスするための Model Context Protocol サーバー。エージェントの委任トークンで接続する。",
    resources: [
      {
        name: "Dataverse MCP",
        purpose: "CRM / HR 等の業務データの照会、許可された範囲での作成・更新。",
        configKeys: ["Dataverse:Url"],
        tools: [
          "create_table", "update_table", "delete_table",
          "delete_record", "upsert_skill", "delete_skill",
          "init_file_upload", "commit_file_upload", "file_download",
        ],
        notes: ["上記ツールは危険操作としてブロックリストに入っており、エージェントからは呼び出せない。"],
      },
      {
        name: "Work IQ MCP",
        purpose: "エージェント自身のメール・予定表、人物・空き時間の照会。",
        configKeys: ["WorkIQ:Endpoint", "WorkIQ:Scope（既定 api://workiq.svc.cloud.microsoft/.default）"],
        tools: ["delete_entity"],
        notes: ["delete_entity はブロックされ、削除操作は公開されない。"],
      },
      {
        name: "Web IQ MCP（アプリ単独認証）",
        purpose: "アプリのアクセスキーまたは Entra アプリ単独トークンで動作する検索系 MCP。未設定時はオフラインのまま。",
        configKeys: [
          "WebIQ:ApiKey もしくは WebIQ:Scope（いずれか設定時のみ有効）",
          "WebIQ:Endpoint（既定 https://api.microsoft.ai/v3/mcp）",
        ],
        notes: ["エージェント本人ではなくアプリ自身の資格情報で認証する（AppOnly）。"],
      },
    ],
  },
  {
    title: "Microsoft Graph 連携ツール（委任トークン）",
    description: "エージェント自身の agentic user トークンで Microsoft Graph を呼び出すローカルツール群。",
    resources: [
      {
        name: "Teams チャット",
        purpose: "既存チャットの検索・作成、エージェント名義でのメッセージ送信、履歴の読み取り。",
        configKeys: ["TeamsChat:Enabled（既定 true）"],
      },
      {
        name: "Office ドキュメント / ファイル共有",
        purpose: "pptx / xlsx / docx の生成と OneDrive 保存、共有リンク発行、依頼元本人への共有可否確認。",
        configKeys: ["Documents:Enabled（既定 true）", "Documents:Folder"],
        notes: ["ファイル共有は依頼元のメールアドレスと本人確認を突き合わせるため、userEmail を必要とする。"],
      },
      {
        name: "メール",
        purpose: "受信メールへの HTML 返信。",
        configKeys: ["Mail:Enabled（既定 true）"],
      },
      {
        name: "サンドボックス",
        purpose: "Azure Container Apps 動的セッションでの Python 実行、ファイル取り込み・受け渡し。",
        configKeys: ["Sandbox:Enabled（既定 true）", "Sandbox:Endpoint", "Sandbox:ApiVersion", "Sandbox:TimeoutSeconds"],
      },
    ],
  },
  {
    title: "その他のローカルツール",
    description: "Microsoft Graph トークンを必要としない、エージェント内で完結する機能。",
    resources: [
      {
        name: "Web 検索",
        purpose: "Azure OpenAI Responses API 内蔵の Web 検索（Grounding with Bing）。",
        configKeys: ["WebSearch:Enabled（既定 true）"],
      },
      {
        name: "定期実行",
        purpose: "頻度・時刻・配信方法を登録し、対話なしで時刻どおりに実行・配信する。",
        configKeys: ["Schedule:Enabled（既定 true）"],
      },
      {
        name: "用件の預かり",
        purpose: "依頼内容を預かり、後続の会話や処理で参照する。",
        configKeys: ["Errands:Enabled（既定 true）"],
      },
      {
        name: "スキル（作業手順書）",
        purpose: "標準スキルとカスタムスキルの一覧提示・本文読み出し・追加更新。",
        configKeys: ["Skills:Enabled（既定 true）"],
      },
      {
        name: "使用状況",
        purpose: "モデル呼び出しのトークン数・コストを記録し、管理者向けに集計する。",
        configKeys: ["Usage:Enabled", "Usage:Currency", "Usage:JpyRate", "Usage:Admins", "Usage:Pricing"],
      },
      {
        name: "進捗報告",
        purpose: "入力中表示の維持、自動の状況通知、エージェント自身の経過報告の送信。",
        configKeys: [
          "Agent:Progress:Enabled",
          "Agent:Progress:FirstNoteSeconds",
          "Agent:Progress:IntervalSeconds",
          "Agent:Progress:TypingSeconds",
        ],
      },
    ],
  },
  {
    title: "認証・組織設定",
    description: "エージェント自身のアイデンティティと、社内 / 社外の判定に使う設定。",
    resources: [
      {
        name: "組織ドメイン判定",
        purpose: "相手のメールドメインで社内 / 社外を判定し、敬称・文体・絵文字の可否を切り替える。",
        configKeys: ["Organization:InternalDomains"],
      },
      {
        name: "受信トークン検証",
        purpose: "Teams / Web API 受信時の JWT 署名・発行者・対象・期限を検証する。",
        configKeys: ["TokenValidation:Enabled", "TokenValidation:Audiences", "TokenValidation:TenantId"],
      },
      {
        name: "サービス接続（Agents SDK）",
        purpose: "Agents SDK ホストが利用するクライアント資格情報接続。",
        configKeys: ["Connections:ServiceConnection", "ConnectionsMap"],
      },
    ],
  },
]

export const AGENT_PROFILE = {
  displayName: "このエージェント",
  systemPromptFile: "agent プロジェクト/prompts/system.md",
  defaultSystemPrompt:
    "あなたは小人の妖精のこのエージェントです。親しみやすく温かい日本語で、社内の仕事を前のめりに手伝ってください。",
  defaultGreeting: "こんにちは、秘書のこのエージェントです。今日も一生懸命お手伝いしますね。",
  notes: [
    "実運用のシステムプロンプトは prompts/system.md から読み込まれ、コードを変えずに調整できる。",
    "ファイルが見つからない場合のみ、上記の既定文言（Agent:SystemPrompt 設定または DefaultSystemPrompt 定数）にフォールバックする。",
  ],
}
