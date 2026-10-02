"""Speech トークン発行コネクタを作成または更新する（クライアント シークレットは一時ディレクトリでだけ差し込む）。

使い方:
    python azure/speech-token-broker/scripts/deploy_connector.py \
        --environment <ENV_ID> --function-host <app>.azurewebsites.net \
        --secret-file .secrets/speech-broker-connector-oauth.json --solution ${SOLUTION_NAME} [--connector-id <id>]
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

CONNECTOR_DIR = Path(__file__).resolve().parents[1] / "connector"


def render(text: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    if "{{" in text:
        raise SystemExit("未置換のプレースホルダーが残っています")
    return text


def run(command: list[str]) -> str:
    result = subprocess.run(command, check=False, text=True, capture_output=True, encoding="utf-8", errors="replace")
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode:
        raise SystemExit(output.strip() or "pac connector コマンドが失敗しました")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Speech トークン発行コネクタを作成または更新する")
    parser.add_argument("--environment", required=True)
    parser.add_argument("--function-host", required=True, help="例: func-xxx.azurewebsites.net")
    parser.add_argument("--secret-file", default=".secrets/speech-broker-connector-oauth.json")
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--solution", help="作成時に追加するソリューションの一意名")
    parser.add_argument("--connector-id", help="指定すると更新、省略すると新規作成")
    args = parser.parse_args()

    credential = json.loads(Path(args.secret_file).read_text(encoding="utf-8"))
    app_id = credential["clientId"]
    values = {
        "FUNCTION_HOST": args.function_host,
        "API_APP_ID": app_id,
        "API_SCOPE": credential.get("scope") or f"api://{app_id}/Speech.Token",
        "TENANT_ID": args.tenant_id,
    }

    pac = shutil.which("pac")
    if not pac:
        raise SystemExit("pac コマンドが見つかりません")

    with tempfile.TemporaryDirectory(prefix="speech-connector-") as temporary:
        root = Path(temporary)
        definition = root / "apiDefinition.swagger.json"
        definition.write_text(render((CONNECTOR_DIR / "apiDefinition.swagger.json").read_text(encoding="utf-8"), values), encoding="utf-8")
        properties = json.loads(render((CONNECTOR_DIR / "apiProperties.json").read_text(encoding="utf-8"), values))
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
