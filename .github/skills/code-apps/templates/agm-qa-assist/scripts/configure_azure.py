"""株主総会 Q&A アシストの Azure 側を、決まった形にそろえる（冪等。既定は計画だけ表示し、--apply で実行）。

Function App・ストレージ・ネットワークは azure-infra / mcp-server スキルの手順で先に作る（テナントの方針で形が変わるため）。
このスクリプトは、その上にこのアプリ固有の部分だけを足す:

  1. Azure AI Speech（SpeechServices・カスタム サブドメイン付き）
  2. Azure OpenAI（AIServices・ローカル認証は無効）とモデルのデプロイ
  3. Function App のマネージド ID に Foundry User（リソース グループの範囲）
  4. Function App のアプリ設定（Speech・生成・チケット）。TICKET_SECRET は無いときだけ作る
  5. Function App の CORS に Code Apps のオリジン（環境 ID から組み立てる）

値は .env から読む（references の .env.example を参照）:
  AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP / AZURE_LOCATION / SPEECH_RESOURCE_NAME / AOAI_RESOURCE_NAME /
  AOAI_DEPLOYMENT / AOAI_MODEL_VERSION / AOAI_SKU / AOAI_CAPACITY / FUNCTION_APP_NAME / API_AUDIENCE / API_SCOPE /
  TENANT_ID / ENV_ID

使い方:
  python scripts/configure_azure.py            # 計画を表示（何も変えない）
  python scripts/configure_azure.py --apply    # 実行
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE = "Foundry User"


def load_env() -> None:
    path = ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def need(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, "").strip() or (default or "")
    if not value:
        raise SystemExit(f".env に {name} がありません")
    return value


AZ = shutil.which("az") or shutil.which("az.cmd") or "az"


def az(*args: str, check: bool = True) -> object:
    """az を JSON で呼ぶ。存在確認の失敗（ResourceNotFound）は None を返す"""
    res = subprocess.run([AZ, *args, "-o", "json"], capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        if not check or "NotFound" in res.stderr or "could not be found" in res.stderr or "was not found" in res.stderr:
            return None
        raise SystemExit(f"az {' '.join(args[:4])} … に失敗しました: {res.stderr.strip()[:400]}")
    return json.loads(res.stdout) if res.stdout.strip() else {}


def app_origin(env_id: str) -> str:
    hex_id = env_id.replace("-", "").lower()
    return f"https://{hex_id[:-2]}.{hex_id[-2:]}.environment.api.powerplatformusercontent.com"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="計画を実行する（既定は表示だけ）")
    args = parser.parse_args()
    load_env()

    sub = need("AZURE_SUBSCRIPTION_ID")
    rg = need("AZURE_RESOURCE_GROUP")
    location = need("AZURE_LOCATION", "japaneast")
    speech = need("SPEECH_RESOURCE_NAME")
    aoai = need("AOAI_RESOURCE_NAME")
    deployment = need("AOAI_DEPLOYMENT", "gpt-5.4-mini")
    model_version = os.environ.get("AOAI_MODEL_VERSION", "").strip()
    sku = need("AOAI_SKU", "DataZoneStandard")
    capacity = need("AOAI_CAPACITY", "100")
    func = need("FUNCTION_APP_NAME")
    audience = need("API_AUDIENCE")
    scope = need("API_SCOPE", "Speech.Token")
    tenant = need("TENANT_ID")
    origin = app_origin(need("ENV_ID"))
    common = ["--subscription", sub]

    plan: list[tuple[str, list[str]]] = []

    # 1. Speech
    sp = az("cognitiveservices", "account", "show", "-g", rg, "-n", speech, *common, check=False)
    if not sp:
        plan.append((f"Speech {speech} を作成（{location}・S0・サブドメイン {speech}）", ["cognitiveservices", "account", "create", "-g", rg, "-n", speech, "--kind", "SpeechServices", "--sku", "S0", "-l", location, "--custom-domain", speech, "--yes", *common]))
    elif not sp.get("properties", {}).get("customSubDomainName"):  # type: ignore[union-attr]
        raise SystemExit(f"Speech {speech} にカスタム サブドメインがありません（Entra ID のトークンで使えない）。作り直してください")
    speech_endpoint = f"https://{speech}.cognitiveservices.azure.com/"
    speech_region = (sp or {}).get("location", location) if sp else location  # type: ignore[union-attr]

    # 2. Azure OpenAI とモデル
    ai = az("cognitiveservices", "account", "show", "-g", rg, "-n", aoai, *common, check=False)
    if not ai:
        plan.append((f"Azure OpenAI {aoai} を作成（AIServices・S0）", ["cognitiveservices", "account", "create", "-g", rg, "-n", aoai, "--kind", "AIServices", "--sku", "S0", "-l", location, "--custom-domain", aoai, "--yes", *common]))
        plan.append((f"{aoai} のキー認証を無効化", ["resource", "update", "-g", rg, "-n", aoai, "--resource-type", "Microsoft.CognitiveServices/accounts", "--set", "properties.disableLocalAuth=true", *common]))
    deployments = az("cognitiveservices", "account", "deployment", "list", "-g", rg, "-n", aoai, *common, check=False) or []
    if not any(d.get("name") == deployment for d in deployments):  # type: ignore[union-attr]
        if not model_version:
            raise SystemExit("AOAI_MODEL_VERSION を .env に入れてください（az cognitiveservices model list で確認）")
        plan.append((f"モデル {deployment}（{model_version}・{sku}・{capacity}）をデプロイ", ["cognitiveservices", "account", "deployment", "create", "-g", rg, "-n", aoai, "--deployment-name", deployment, "--model-name", deployment, "--model-version", model_version, "--model-format", "OpenAI", "--sku-name", sku, "--sku-capacity", capacity, *common]))

    # 3. Function App の MI と Foundry User
    fa = az("functionapp", "show", "-g", rg, "-n", func, *common, check=False)
    if not fa:
        raise SystemExit(f"Function App {func} がありません。azure-infra / mcp-server の手順で先に作ってください")
    principal = (fa.get("identity") or {}).get("principalId")  # type: ignore[union-attr]
    if not principal:
        raise SystemExit(f"{func} にシステム割り当てのマネージド ID がありません（az functionapp identity assign）")
    rg_scope = f"/subscriptions/{sub}/resourceGroups/{rg}"
    roles = az("role", "assignment", "list", "--assignee", principal, "--scope", rg_scope, *common) or []
    if not any(r.get("roleDefinitionName") == ROLE for r in roles):  # type: ignore[union-attr]
        plan.append((f"{func} の MI に {ROLE}（{rg} の範囲）", ["role", "assignment", "create", "--assignee-object-id", principal, "--assignee-principal-type", "ServicePrincipal", "--role", ROLE, "--scope", rg_scope, *common]))

    # 4. アプリ設定
    current = {s["name"]: s.get("value") for s in (az("functionapp", "config", "appsettings", "list", "-g", rg, "-n", func, *common) or [])}  # type: ignore[union-attr]
    wanted = {
        "ENTRA_TENANT_ID": tenant,
        "API_AUDIENCE": audience,
        "REQUIRED_SCOPE": scope,
        "SPEECH_ENDPOINT": speech_endpoint,
        "SPEECH_REGION": speech_region,
        "AOAI_ENDPOINT": f"https://{aoai}.cognitiveservices.azure.com",
        "AOAI_DEPLOYMENT": deployment,
        "AOAI_REASONING_EFFORT": "none",
    }
    changes = [f"{k}={v}" for k, v in wanted.items() if current.get(k) != v]
    if not current.get("TICKET_SECRET"):
        changes.append(f"TICKET_SECRET={secrets.token_urlsafe(48)}")
    if changes:
        shown = ", ".join(c.split("=")[0] for c in changes)
        plan.append((f"{func} のアプリ設定を更新: {shown}", ["functionapp", "config", "appsettings", "set", "-g", rg, "-n", func, "--settings", *changes, *common]))

    # 5. CORS
    cors = az("functionapp", "cors", "show", "-g", rg, "-n", func, *common) or {}
    if origin not in (cors.get("allowedOrigins") or []):  # type: ignore[union-attr]
        plan.append((f"{func} の CORS に {origin}", ["functionapp", "cors", "add", "-g", rg, "-n", func, "--allowed-origins", origin, *common]))

    if not plan:
        print("✅ 変更はありません（すべて揃っています）")
        return 0
    print(f"計画（{len(plan)} 件）:")
    for i, (label, _cmd) in enumerate(plan, 1):
        print(f"  {i}. {label}")
    if not args.apply:
        print("\n実行するには --apply を付けてください")
        return 0
    for label, cmd in plan:
        print(f"▶ {label}")
        az(*cmd)
    print("✅ 完了。Function をデプロイ（deploy_mcp_function.py）すると設定が反映されます")
    return 0


if __name__ == "__main__":
    sys.exit(main())
