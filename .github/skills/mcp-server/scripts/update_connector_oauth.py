"""既存カスタムコネクタへ有効な OAuth credential と refresh scope を同期する。"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def apply_oauth_credentials(properties: dict, credential: dict) -> None:
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
    scopes = settings.get("scopes")
    if not isinstance(scopes, list) or not all(isinstance(scope, str) for scope in scopes):
        raise SystemExit("OAuth scopes は文字列配列である必要があります")
    if "offline_access" not in scopes:
        scopes.append("offline_access")


def run(command: list[str]) -> None:
    result = subprocess.run(command, check=False, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr.strip() or result.stdout.strip() or "pac connector コマンドが失敗しました")


def main() -> int:
    parser = argparse.ArgumentParser(description="既存コネクタの OAuth credential を安全に更新する")
    parser.add_argument("--environment", required=True)
    parser.add_argument("--connector-id", action="append", required=True)
    parser.add_argument("--secret-file", default=".secrets/connector-oauth.json")
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
            apply_oauth_credentials(properties, credential)
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