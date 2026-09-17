"""Copilot SDK エージェントの雛形を生成する（非対話）。

SKILL.md Step 2 で使用する。BYOK + Managed Identity（キーレス）の最小構成を生成し、
エージェントの作業ディレクトリをソース リポジトリの外へ固定する規約を雛形に埋め込む。

生成物:
  <repo-root>/global.json
  <repo-root>/.gitignore
  <repo-root>/.env.example
  <repo-root>/README.md
  <repo-root>/src/<AgentName>Agent/<AgentName>Agent.csproj
  <repo-root>/src/<AgentName>Agent/Program.cs
  <repo-root>/src/<AgentName>Agent/appsettings.json
  <repo-root>/src/<AgentName>Agent/skills/README.md

使い方:
  python scaffold_copilot_sdk_agent.py --name <agent-name> --repo-root <repo-root> --dry-run
  python scaffold_copilot_sdk_agent.py --name <agent-name> --repo-root <repo-root>
  python scaffold_copilot_sdk_agent.py --name <agent-name> --repo-root <repo-root> --force

終了コード: 成功 0 / 入力不正・既存ファイル衝突 1。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

_UTF8_OUT = (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf")
MARK_OK = "\u2705" if _UTF8_OUT else "[OK]"
MARK_NG = "\u274c" if _UTF8_OUT else "[NG]"

# kebab-case のみ許可（NuGet / ディレクトリ / Entra 表示名の派生をすべてこの名前から作るため）
AGENT_NAME_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
DEFAULT_TFM = "net10.0"
DEFAULT_SDK_VERSION = "10.0.100"


def load_env(start: Path) -> None:
    for parent in [start, *start.parents]:
        envf = parent / ".env"
        if envf.is_file():
            for line in envf.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
            return


def pascal(name: str) -> str:
    return "".join(part.capitalize() for part in name.split("-"))


def render(agent: str, tfm: str, sdk_version: str, workspace_root: str) -> dict[str, str]:
    cls = pascal(agent)
    # 名前が "-agent" で終わる場合に "XxxAgentAgent" にならないようにする
    proj = cls if cls.endswith("Agent") else f"{cls}Agent"
    return {
        "global.json": json.dumps(
            {"sdk": {"version": sdk_version, "rollForward": "latestFeature"}}, indent=2) + "\n",
        ".gitignore": "\n".join([
            "bin/", "obj/", ".vs/", ".env", "*.user",
            "# エージェントの作業領域はリポジトリ外に置く（誤って追跡しないための保険）",
            ".copilot/", "",
        ]),
        ".env.example": "\n".join([
            f"# {proj} — 環境変数サンプル（実値は .env に置く。.gitignore 済み）",
            f"COPILOT_AGENT_NAME={agent}",
            "# ★ ソース リポジトリの外を指定する（組み込みファイル操作ツールの書き込み先）",
            f"COPILOT_WORKSPACE_ROOT={workspace_root}",
            "COPILOT_BASE_DIR=",
            "COPILOT_ROUTE=byok",
            "COPILOT_MODEL=<model-deployment-name>",
            "# リソース URL のみ（/openai/v1/ はコード側で付与する）",
            "FOUNDRY_RESOURCE_URL=https://<resource-name>.openai.azure.com",
            "AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential",
            "AZURE_CLIENT_ID=",
            "",
        ]),
        "README.md": "\n".join([
            f"# {proj}",
            "",
            "GitHub Copilot SDK ベースのエージェント。BYOK + Managed Identity（キーレス）構成。",
            "",
            "## 前提チェック",
            "",
            "```powershell",
            "python <skills>/copilot-sdk/scripts/check_copilot_sdk_env.py --route byok --repo-root .",
            "```",
            "",
            "## 実行",
            "",
            "```powershell",
            "cp .env.example .env   # 値を埋める",
            f"dotnet run --project src/{proj}",
            "```",
            "",
            "## 規約",
            "",
            "| 設定 | 値 |",
            "|---|---|",
            "| `WorkingDirectory` | `${COPILOT_WORKSPACE_ROOT}/${COPILOT_AGENT_NAME}`（**リポジトリ外**） |",
            "| `BaseDirectory` | `<WorkingDirectory>/.copilot` |",
            "| 組み込みシェル / 編集ツール | 既定で `ExcludedTools` により無効 |",
            "",
        ]),
        f"src/{proj}/{proj}.csproj": "\n".join([
            "<Project Sdk=\"Microsoft.NET.Sdk\">",
            "",
            "  <PropertyGroup>",
            "    <OutputType>Exe</OutputType>",
            f"    <TargetFramework>{tfm}</TargetFramework>",
            "    <Nullable>enable</Nullable>",
            "    <ImplicitUsings>enable</ImplicitUsings>",
            "    <!-- SDK の公開 API は実験的属性付きで出荷されている -->",
            "    <NoWarn>$(NoWarn);GHCP001</NoWarn>",
            "  </PropertyGroup>",
            "",
            "  <!-- copilot-runtime はビルド時に RID 1 つ分だけ取得される。未指定だとビルド機の",
            "       RID になり、Linux ホストへ発行しても実行ファイルが入らない。 -->",
            "  <PropertyGroup Condition=\"'$(Configuration)' == 'Release'\">",
            "    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>",
            "    <SelfContained>false</SelfContained>",
            "  </PropertyGroup>",
            "",
            "  <ItemGroup>",
            "    <PackageReference Include=\"GitHub.Copilot.SDK\" Version=\"*\" />",
            "    <PackageReference Include=\"Azure.Identity\" Version=\"*\" />",
            "  </ItemGroup>",
            "",
            "  <ItemGroup>",
            "    <None Update=\"appsettings.json\" CopyToOutputDirectory=\"PreserveNewest\" />",
            "    <None Update=\"skills\\**\" CopyToOutputDirectory=\"PreserveNewest\" />",
            "  </ItemGroup>",
            "",
            "</Project>",
            "",
        ]),
        f"src/{proj}/appsettings.json": json.dumps({
            "Agent": {
                "Name": agent,
                "Greeting": "",
                "ExcludedTools": ["bash", "edit", "write"],
            },
            "Provider": {
                "Type": "openai",
                "WireApi": "responses",
                "Scope": "https://ai.azure.com/.default",
            },
        }, indent=2, ensure_ascii=False) + "\n",
        f"src/{proj}/skills/README.md": "\n".join([
            "# skills",
            "",
            "エージェントに読ませる手順書（Markdown）を置く。`SkillDirectories` で参照される。",
            "毎ターン全文を注入せず、必要なものだけカスタム エージェントの `Skills` で先読みさせる。",
            "",
        ]),
        f"src/{proj}/Program.cs": PROGRAM_CS.replace("{{NAMESPACE}}", proj),
    }


PROGRAM_CS = '''using Azure.Core;
using Azure.Identity;
using GitHub.Copilot;
// PermissionDecision は RPC 側の名前空間にある。ProviderConfig は両方に存在するため修飾する。
using GitHub.Copilot.Rpc;

// エージェントの作業領域はソース リポジトリの外に置く（組み込みファイル操作ツールの書き込み先）。
string agentName = Env("COPILOT_AGENT_NAME");
string workingDirectory = Path.Combine(Env("COPILOT_WORKSPACE_ROOT"), agentName);
string baseDirectory = Environment.GetEnvironmentVariable("COPILOT_BASE_DIR") is { Length: > 0 } configured
    ? configured
    : Path.Combine(workingDirectory, ".copilot");
// ホストの永続ストレージ上では初回起動時にどちらも存在しない。
Directory.CreateDirectory(workingDirectory);
Directory.CreateDirectory(baseDirectory);

// AZURE_TOKEN_CREDENTIALS / AZURE_CLIENT_ID で資格情報を固定する（ホストでは ManagedIdentityCredential）。
DefaultAzureCredential credential = new();
string foundryUrl = Env("FOUNDRY_RESOURCE_URL").TrimEnd('/');

await using CopilotClient client = new(new CopilotClientOptions
{
    WorkingDirectory = workingDirectory,
    BaseDirectory = baseDirectory,
});
await client.StartAsync();

await using CopilotSession session = await client.CreateSessionAsync(new SessionConfig
{
    // BYOK ではモデル（Azure ではデプロイ名）の指定が必須。
    Model = Env("COPILOT_MODEL"),
    Provider = new GitHub.Copilot.ProviderConfig
    {
        Type = "openai",
        BaseUrl = $"{foundryUrl}/openai/v1/",
        BearerTokenProvider = async _ =>
        {
            AccessToken token = await credential.GetTokenAsync(
                new TokenRequestContext(["https://ai.azure.com/.default"]));
            return token.Token;
        },
        WireApi = "responses",
    },
    // 組み込みのシェル / 編集ツールはホスト上で実行されるため既定で無効化する。
    // 実際のツール名はランタイムのバージョンで変わりうるため、セッションのツール一覧で確認して調整する。
    ExcludedTools = ["bash", "edit", "write"],
    SystemMessage = new SystemMessageConfig
    {
        Mode = SystemMessageMode.Customize,
        Sections = new Dictionary<SystemMessageSection, SectionOverride>
        {
            [SystemMessageSection.CodeChangeRules] = new() { Action = SectionOverrideAction.Remove },
        },
        Content = "業務アシスタントとして、事実に基づいて簡潔に回答する。",
    },
    OnPermissionRequest = async (request, invocation) =>
    {
        // 管理側が承認を必須としている場合は自動承認しない。
        if (request.ManagedApprovalRequired is true)
        {
            return PermissionDecision.NoResult();
        }

        return PermissionDecision.ApproveOnce();
    },
});

AssistantMessageEvent? response = await session.SendAndWaitAsync(
    new MessageOptions { Prompt = "疎通確認です。1 行で挨拶してください。" });
Console.WriteLine(response?.Data.Content);

static string Env(string key) =>
    Environment.GetEnvironmentVariable(key) is { Length: > 0 } value
        ? value
        : throw new InvalidOperationException($"環境変数 {key} が未設定です。.env を確認してください。");
'''


def main() -> int:
    ap = argparse.ArgumentParser(description="Copilot SDK エージェントの雛形を生成する")
    ap.add_argument("--name", help="エージェント名（kebab-case。既定: .env COPILOT_AGENT_NAME）")
    ap.add_argument("--repo-root", required=True, help="生成先のリポジトリ ルート")
    ap.add_argument("--workspace-root", help="エージェント作業領域のルート（既定: .env COPILOT_WORKSPACE_ROOT）")
    ap.add_argument("--tfm", default=DEFAULT_TFM, help=f"ターゲット フレームワーク（既定: {DEFAULT_TFM}）")
    ap.add_argument("--sdk-version", default=DEFAULT_SDK_VERSION, help=f"global.json の SDK バージョン（既定: {DEFAULT_SDK_VERSION}）")
    ap.add_argument("--force", action="store_true", help="既存ファイルを上書きする")
    ap.add_argument("--dry-run", action="store_true", help="生成せず内容の一覧だけ表示する")
    args = ap.parse_args()

    repo_root = Path(args.repo_root).expanduser().resolve()
    load_env(Path.cwd())

    agent = args.name or os.environ.get("COPILOT_AGENT_NAME", "")
    if not AGENT_NAME_RE.match(agent):
        print(f"{MARK_NG} --name は kebab-case で指定してください（英小文字・数字・ハイフン）: {agent!r}")
        return 1

    workspace_root = args.workspace_root or os.environ.get("COPILOT_WORKSPACE_ROOT", "<path-to-agent-workspaces>")

    # 作業領域がリポジトリ配下だと、組み込みファイル操作ツールがソースを壊しうる（troubleshooting #3）。
    if workspace_root and not workspace_root.startswith("<"):
        ws = Path(workspace_root).expanduser().resolve()
        if ws == repo_root or repo_root in ws.parents:
            print(f"{MARK_NG} 作業領域がリポジトリ配下です: {ws}（リポジトリ: {repo_root}）")
            return 1

    files = render(agent, args.tfm, args.sdk_version, workspace_root)

    existing = [rel for rel in files if (repo_root / rel).exists()]
    if existing and not args.force:
        print(f"{MARK_NG} 既存ファイルがあります（--force で上書き）: {', '.join(existing)}")
        return 1

    for rel, content in files.items():
        dst = repo_root / rel
        if args.dry_run:
            print(f"   [dry-run] {dst}（{len(content.splitlines())} 行）")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(content, encoding="utf-8")
        print(f"   + {dst}")

    if args.dry_run:
        print(f"{MARK_OK} dry-run 完了（{len(files)} ファイル）")
        return 0

    print(f"{MARK_OK} 生成完了: {repo_root}")
    print("   次: .env.example を .env にコピーして値を埋め、check_copilot_sdk_env.py を実行する")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
