"""Speech トークン発行コネクタを作成または更新する（クライアント シークレットは一時ディレクトリでだけ差し込む）。

使い方:
    python .github/skills/realtime-speech/scripts/deploy_token_connector.py \
        --connector-dir <broker-project>/connector \
        --environment <ENV_ID> --function-host <app>.azurewebsites.net --tenant-id <TENANT_ID> \
        --secret-file .secrets/<name>.json --solution <SOLUTION_NAME> [--connector-id <id>]

`--secret-file` は mcp-server の configure_connector_oauth.py が出力した JSON（clientId / clientSecret / scope）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

PLACEHOLDER = re.compile(r"\{\{([A-Z_]+)\}\}")


def render(text: str, values: dict[str, str]) -> str:
    rendered = PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), text)
    missing = sorted(set(PLACEHOLDER.findall(rendered)))
    if missing:
        raise SystemExit(f"未置換のプレースホルダーがあります: {', '.join(missing)}")
    return rendered


def run(command: list[str]) -> str:
    result = subprocess.run(command, check=False, text=True, capture_output=True, encoding="utf-8", errors="replace")
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode:
        raise SystemExit(output.strip() or "pac connector コマンドが失敗しました")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Speech トークン発行コネクタを作成または更新する")
    parser.add_argument("--connector-dir", required=True, type=Path, help="apiDefinition.swagger.json と apiProperties.json があるフォルダー")
    parser.add_argument("--environment", default=os.getenv("ENV_ID"), help="Power Platform 環境 ID")
    parser.add_argument("--function-host", required=True, help="例: <app>.azurewebsites.net")
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--secret-file", default=".secrets/speech-token-connector-oauth.json")
    parser.add_argument("--title", default="Speech Token Broker", help="コネクタの表示名")
    parser.add_argument("--publisher", default="Speech Token Broker")
    parser.add_argument("--solution", default=os.getenv("SOLUTION_NAME"), help="作成時に追加するソリューションの一意名")
    parser.add_argument("--connector-id", help="指定すると更新、省略すると新規作成")
    args = parser.parse_args()

    if not args.environment or not args.tenant_id:
        raise SystemExit("--environment と --tenant-id（または .env の ENV_ID / TENANT_ID）が必要です")
    if args.function_host.startswith("http") or "/" in args.function_host:
        raise SystemExit("--function-host にはホスト名だけを指定してください（例: <app>.azurewebsites.net）")

    credential = json.loads(Path(args.secret_file).read_text(encoding="utf-8"))
    app_id = credential["clientId"]
    values = {
        "FUNCTION_HOST": args.function_host,
        "API_APP_ID": app_id,
        "API_SCOPE": credential.get("scope") or f"api://{app_id}/Speech.Token",
        "TENANT_ID": args.tenant_id,
        "CONNECTOR_TITLE": args.title,
        "PUBLISHER": args.publisher,
    }

    pac = shutil.which("pac")
    if not pac:
        raise SystemExit("pac コマンドが見つかりません")

    with tempfile.TemporaryDirectory(prefix="speech-connector-") as temporary:
        root = Path(temporary)
        definition = root / "apiDefinition.swagger.json"
        definition.write_text(render((args.connector_dir / "apiDefinition.swagger.json").read_text(encoding="utf-8"), values), encoding="utf-8")
        properties = json.loads(render((args.connector_dir / "apiProperties.json").read_text(encoding="utf-8"), values))
        properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]["clientSecret"] = credential["clientSecret"]
        properties_file = root / "apiProperties.json"
        properties_file.write_text(json.dumps(properties, ensure_ascii=False, indent=2), encoding="utf-8")

        command = [pac, "connector"]
        if args.connector_id:
            command += ["update", "--connector-id", args.connector_id]
        else:
            command += ["create"]
            if args.solution:
                command += ["--solution-unique-name", args.solution]
        command += ["--environment", args.environment, "--api-definition-file", str(definition), "--api-properties-file", str(properties_file)]
        print(run(command).strip())
    print("[done] clientSecret の値は表示しません")
    print("次: Dataverse の connectors テーブルで connectorinternalid を確認し、add_connector_redirect_uri.py でコネクタ固有の")
    print("    リダイレクト URI（https://global.consent.azure-apim.net/redirect/<connectorinternalid から shared_ を除いた値>）を追加する")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
