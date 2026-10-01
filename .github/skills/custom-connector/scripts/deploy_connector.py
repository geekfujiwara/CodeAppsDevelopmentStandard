"""OpenAPI 定義からカスタム コネクタ（OAuth: Entra ID）を作成または更新し、コネクタ固有のリダイレクト URI を登録する。

- `apiDefinition.swagger.json` と `apiProperties.json` の `{{NAME}}` を `--var NAME=VALUE` と OAuth 設定ファイルの値で置き換える
- クライアント シークレットは一時ディレクトリのファイルにだけ差し込み、表示しない
- 作成後に Dataverse の connectors から connectorinternalid（shared_...）を読み、
  Entra アプリへ `https://global.consent.azure-apim.net/redirect/<shared_ を除いた ID>` を追加する

OAuth 設定ファイルは mcp-server の configure_connector_oauth.py が出力する JSON
（clientId / clientSecret / scope / resourceUri）。テンプレートで使える値:
  API_APP_ID（clientId）、API_SCOPE（scope）、TENANT_ID（--tenant-id）と --var で渡した値

使い方:
  python deploy_connector.py --connector-dir <dir> --secret-file .secrets/<name>.json --tenant-id <tenant> \
      --environment <env-id> --solution <solution> --var FUNCTION_HOST=<app>.azurewebsites.net --var CONNECTOR_TITLE="..." [--connector-id <guid>]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
PLACEHOLDER = re.compile(r"\{\{([A-Z][A-Z0-9_]*)\}\}")
CREATED = re.compile(r"Connector created with ID ([0-9a-fA-F-]{36})")
VAR = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def render(text: str, values: dict[str, str]) -> str:
    rendered = PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), text)
    missing = sorted(set(PLACEHOLDER.findall(rendered)))
    if missing:
        raise SystemExit(f"未置換のプレースホルダーがあります: {', '.join(missing)}（--var で渡す）")
    return rendered


def parse_vars(items: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in items:
        m = VAR.match(item)
        if not m:
            raise SystemExit(f"--var は NAME=VALUE（NAME は大文字スネークケース）: {item}")
        values[m.group(1)] = m.group(2)
    return values


def redirect_uri_for(connector_internal_id: str) -> str:
    if not connector_internal_id.startswith("shared_"):
        raise SystemExit(f"connectorinternalid の形式が想定と異なります: {connector_internal_id}")
    return f"https://global.consent.azure-apim.net/redirect/{connector_internal_id.removeprefix('shared_')}"


def inject_secret(properties: dict, credential: dict) -> dict:
    try:
        settings = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]
    except (KeyError, TypeError) as exc:
        raise SystemExit("apiProperties.json に connectionParameters.token.oAuthSettings がありません") from exc
    if settings.get("identityProvider") != "aad":
        raise SystemExit("このスクリプトは identityProvider=aad（Entra ID）のコネクタ専用です")
    settings["clientSecret"] = credential["clientSecret"]
    return properties


def _run(command: list[str]) -> str:
    res = subprocess.run(command, check=False, text=True, capture_output=True, encoding="utf-8", errors="replace")
    output = (res.stdout or "") + (res.stderr or "")
    if res.returncode:
        raise SystemExit(output.strip() or "pac connector コマンドが失敗しました")
    return output


def _connector_row(connector_id: str) -> dict:
    sys.path.insert(0, str(SKILLS / "standard" / "scripts"))
    from auth_helper import api_get  # noqa: PLC0415

    return api_get(f"connectors({connector_id})?$select=name,displayname,connectorinternalid")


def _add_redirect(audience: str, uri: str) -> bool:
    spec = importlib.util.spec_from_file_location("add_redirect", SKILLS / "mcp-server" / "scripts" / "add_connector_redirect_uri.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    module.validate_redirect_uri(uri)
    return module.add_redirect_uri(audience, uri)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser(description="カスタム コネクタを作成または更新する")
    parser.add_argument("--connector-dir", required=True, type=Path)
    parser.add_argument("--secret-file", required=True, type=Path, help="configure_connector_oauth.py の出力")
    parser.add_argument("--environment", default=os.getenv("ENV_ID"))
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--solution", default=os.getenv("SOLUTION_NAME"), help="作成時に追加するソリューションの一意名")
    parser.add_argument("--var", action="append", default=[], help="テンプレートの値 NAME=VALUE（複数可）")
    parser.add_argument("--connector-id", help="Dataverse の connectorid（GUID）。指定すると更新")
    parser.add_argument("--skip-redirect", action="store_true", help="リダイレクト URI の登録を省く")
    args = parser.parse_args()

    if not args.environment or not args.tenant_id:
        raise SystemExit("--environment と --tenant-id（または .env の ENV_ID / TENANT_ID）が必要です")
    credential = json.loads(args.secret_file.read_text(encoding="utf-8"))
    values = {
        "API_APP_ID": credential["clientId"],
        "API_SCOPE": credential.get("scope") or f"api://{credential['clientId']}/.default",
        "TENANT_ID": args.tenant_id,
        **parse_vars(args.var),
    }
    for name in ("FUNCTION_HOST", "API_HOST"):
        if name in values and ("/" in values[name] or values[name].startswith("http")):
            raise SystemExit(f"{name} にはホスト名だけを指定してください（例: <app>.azurewebsites.net）")

    pac = shutil.which("pac")
    if not pac:
        raise SystemExit("pac コマンドが見つかりません")

    with tempfile.TemporaryDirectory(prefix="custom-connector-") as temporary:
        root = Path(temporary)
        definition = root / "apiDefinition.swagger.json"
        definition_text = render((args.connector_dir / "apiDefinition.swagger.json").read_text(encoding="utf-8"), values)
        json.loads(definition_text)
        definition.write_text(definition_text, encoding="utf-8")
        properties = inject_secret(json.loads(render((args.connector_dir / "apiProperties.json").read_text(encoding="utf-8"), values)), credential)
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
        output = _run(command)

    connector_id = args.connector_id or (CREATED.search(output).group(1) if CREATED.search(output) else None)
    if not connector_id:
        raise SystemExit(f"コネクタ ID を出力から読めませんでした:\n{output.strip()}")
    row = _connector_row(connector_id)
    internal_id = row["connectorinternalid"]
    print(f"[connector] {'更新' if args.connector_id else '作成'}: {row.get('displayname')} / connectorid={connector_id} / {internal_id}（clientSecret は表示しません）")

    if not args.skip_redirect:
        audience = credential.get("resourceUri") or f"api://{credential['clientId']}"
        uri = redirect_uri_for(internal_id)
        changed = _add_redirect(audience, uri)
        print(f"[redirect] {'追加' if changed else '登録済み'}: {uri}")
    print(f"\nconnector: {internal_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
