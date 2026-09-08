"""既存カスタムコネクタへ有効な OAuth credential と refresh scope を同期する。"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def apply_oauth_credentials(
    properties: dict,
    credential: dict,
    resource_uri: str | None = None,
    scope: str | None = None,
) -> None:
    try:
        settings = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]
    except (KeyError, TypeError) as exc:
        raise SystemExit("apiProperties.json に OAuth 設定がありません") from exc

    client_id = credential.get("clientId")
    client_secret = credential.get("clientSecret")
    if not isinstance(client_id, str) or not client_id.strip():
        raise SystemExit("credential の clientId がありません")
    if not isinstance(client_secret, str) or not client_secret.strip():
        raise SystemExit("credential の clientSecret value がありません")

    settings["clientId"] = client_id
    settings["clientSecret"] = client_secret
    current_properties = settings.get("properties")
    current_resource_uri = (
        current_properties.get("AzureActiveDirectoryResourceId")
        if isinstance(current_properties, dict)
        else None
    )
    current_scopes = settings.get("scopes")
    current_scope = (
        next((item for item in current_scopes if item != "offline_access"), None)
        if isinstance(current_scopes, list)
        else None
    )
    effective_resource_uri = resource_uri or credential.get("resourceUri") or current_resource_uri
    effective_scope = scope or credential.get("scope") or current_scope
    if not isinstance(effective_scope, str) or not effective_scope.strip():
        raise SystemExit("OAuth scope がありません")
    if isinstance(effective_resource_uri, str) and effective_resource_uri.strip():
        settings["properties"] = {"AzureActiveDirectoryResourceId": effective_resource_uri}
    settings["scopes"] = [effective_scope, "offline_access"]


def run(command: list[str]) -> None:
    result = subprocess.run(command, check=False, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr.strip() or result.stdout.strip() or "pac connector コマンドが失敗しました")


def main() -> int:
    parser = argparse.ArgumentParser(description="既存コネクタの OAuth credential を安全に更新する")
    parser.add_argument("--environment", required=True)
    parser.add_argument("--connector-id", action="append", required=True)
    parser.add_argument("--secret-file", default=".secrets/connector-oauth.json")
    parser.add_argument("--resource-uri", help="OAuth resource URI。AADSTS90009 回避には API app ID の GUID を指定")
    parser.add_argument("--scope", help="OAuth delegated scope。例: <API app ID>/MCP.Access")
    args = parser.parse_args()

    secret_file = Path(args.secret_file)
    if not secret_file.is_file():
        raise SystemExit(f"OAuth credential ファイルがありません: {secret_file}")
    credential = json.loads(secret_file.read_text(encoding="utf-8"))

    pac = shutil.which("pac")
    if not pac:
        raise SystemExit("pac コマンドが見つかりません")

    with tempfile.TemporaryDirectory(prefix="mcp-connector-oauth-") as temporary:
        root = Path(temporary)
        for connector_id in args.connector_id:
            connector_dir = root / connector_id
            run([
                pac, "connector", "download", "--environment", args.environment,
                "--connector-id", connector_id, "--outputDirectory", str(connector_dir),
            ])
            properties_file = next(connector_dir.rglob("apiProperties.json"), None)
            definition_file = next(connector_dir.rglob("apiDefinition.json"), None)
            if not properties_file or not definition_file:
                raise SystemExit(f"コネクタ定義を取得できません: {connector_id}")

            properties = json.loads(properties_file.read_text(encoding="utf-8-sig"))
            apply_oauth_credentials(properties, credential, args.resource_uri, args.scope)
            properties_file.write_text(json.dumps(properties, ensure_ascii=False, indent=2), encoding="utf-8")
            run([
                pac, "connector", "update", "--environment", args.environment,
                "--connector-id", connector_id, "--api-definition-file", str(definition_file),
                "--api-properties-file", str(properties_file),
            ])
            print(f"[updated] connector={connector_id} / clientSecret value は表示しません")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())