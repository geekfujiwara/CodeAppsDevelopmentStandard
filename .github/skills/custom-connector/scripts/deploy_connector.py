"""OpenAPI 定義からカスタム コネクタ（OAuth: Entra ID、または認証なし）を作成または更新し、コネクタ固有のリダイレクト URI を登録する。

- `apiDefinition.swagger.json` と `apiProperties.json` の `{{NAME}}` を `--var NAME=VALUE` と OAuth 設定ファイルの値で置き換える
- クライアント シークレットは一時ディレクトリのファイルにだけ差し込み、表示しない
- 作成後に Dataverse の connectors から connectorinternalid（shared_...）を読み、
  Entra アプリへ `https://global.consent.azure-apim.net/redirect/<shared_ を除いた ID>` を追加する
- on-behalf-of を有効にする定義では、同じリソースで OBO を有効にした別コネクタが無いことを事前に確認し、
  更新後はランタイム側（PowerApps RP）に OBO フラグが反映されたことを読み戻す

認証なしのコネクタ（apiProperties の connectionParameters が空。公開サイト・公開 API）は --secret-file を省く。
そのときは、作成前に「GET だけ・https だけ・ホストがテンプレート変数のまま残っていない」ことを確かめる
（任意の宛先へ書き込めるコネクタを作らない）。

作成前に、pac がコネクタ名に使う info.title が英数字・ハイフン・アンダースコアだけかを確かめる
（日本語の題名だと pac が「Connector name must be alphanumeric…」で止まる。表示名の日本語は description に書く）。

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
import time
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
PLACEHOLDER = re.compile(r"\{\{([A-Z][A-Z0-9_]*)\}\}")
CREATED = re.compile(r"Connector created with ID ([0-9a-fA-F-]{36})")
VAR = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")
# pac connector create はコネクタ名を info.title から作る（英数字・-・_ のみ、英数字で始まる）
TITLE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


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


def validate_definition(definition: dict, properties: dict) -> bool:
    """作成前の検証。認証なしのコネクタなら True を返す。

    - info.title は pac がコネクタ名に使うので英数字・-・_ だけ（日本語は description へ）
    - 認証なしのコネクタは https・GET だけ（公開ページの読み取り専用。書き込みの操作や http を持たせない）
    """
    title = str((definition.get("info") or {}).get("title", ""))
    if not TITLE.match(title):
        raise SystemExit(
            f"info.title「{title}」は pac がコネクタ名に使うため、英数字・ハイフン・アンダースコアだけにしてください"
            "（例: Contoso-Listing。日本語の説明は info.description に書く）"
        )
    # Code Apps の SDK は JSON 以外の応答（text/html 等）でも、状態コードの応答情報（schema が無くても type "void" で生成される）が
    # あると本文を JSON.parse し、画面では必ず InvalidResponse で失敗する（troubleshooting #15）。応答は "default" だけで宣言する
    for path, item in (definition.get("paths") or {}).items():
        for method, op in item.items():
            if method.lower() == "parameters" or not isinstance(op, dict):
                continue
            types = op.get("produces") or definition.get("produces") or []
            if not types or any(re.search(r"json|^image/|octet-stream|^multipart/", t) for t in types):
                continue
            coded = [s for s in (op.get("responses") or {}) if s != "default"]
            if coded:
                raise SystemExit(
                    f"{method.upper()} {path} は {types} を返すので、応答 {coded} を \"default\" だけにしてください"
                    "（状態コードで宣言すると Code Apps の SDK が本文を JSON として読み、画面で必ず失敗する）"
                )
    body = properties.get("properties", properties)
    if body.get("connectionParameters"):
        return False
    if definition.get("schemes") != ["https"]:
        raise SystemExit("認証なしのコネクタは schemes を [\"https\"] だけにしてください")
    host = str(definition.get("host", ""))
    if not host or "/" in host or host.startswith("http"):
        raise SystemExit(f"host にはホスト名だけを指定してください: {host!r}")
    methods = {m.lower() for item in (definition.get("paths") or {}).values() for m in item if m.lower() != "parameters"}
    if not methods or methods != {"get"}:
        raise SystemExit(f"認証なしのコネクタは GET の操作だけにしてください: {sorted(methods)}")
    return True


def inject_secret(properties: dict, credential: dict) -> dict:
    try:
        settings = properties["properties"]["connectionParameters"]["token"]["oAuthSettings"]
    except (KeyError, TypeError) as exc:
        raise SystemExit("apiProperties.json に connectionParameters.token.oAuthSettings がありません") from exc
    if settings.get("identityProvider") != "aad":
        raise SystemExit("このスクリプトは identityProvider=aad（Entra ID）のコネクタ専用です")
    settings["clientSecret"] = credential["clientSecret"]
    return properties


def obo_settings(properties: dict) -> tuple[bool, str | None]:
    """apiProperties（properties 直下でも外側でも可）から (OBO 有効か, リソース アプリ ID) を返す。"""
    body = properties.get("properties", properties)
    for param in (body.get("connectionParameters") or {}).values():
        settings = (param or {}).get("oAuthSettings") or {}
        if not settings:
            continue
        supported = (settings.get("properties") or {}).get("IsOnbehalfofLoginSupported") is True
        custom = settings.get("customParameters") or {}
        enabled = str((custom.get("enableOnbehalfOfLogin") or {}).get("value", "")).lower() == "true"
        resource = (custom.get("resourceUri") or {}).get("value") or (settings.get("properties") or {}).get("AzureActiveDirectoryResourceId")
        return supported and enabled, resource
    return False, None


def find_obo_conflicts(rows: list[dict], resource: str, own_connector_id: str | None) -> list[str]:
    """同じリソースで OBO を有効にしている別コネクタの表示名を返す。

    同一環境で同じリソース アプリに OBO を有効にできるコネクタは 1 つだけで、2 つ目の更新は
    Dataverse には保存されるがランタイム（PowerApps RP）へ同期されず、エラーも返らない。
    """
    conflicts = []
    for row in rows:
        if own_connector_id and row.get("connectorid", "").lower() == own_connector_id.lower():
            continue
        try:
            params = json.loads(row.get("connectionparameters") or "{}")
        except json.JSONDecodeError:
            continue
        enabled, other = obo_settings({"connectionParameters": params})
        if enabled and other and other.lower() == resource.lower():
            conflicts.append(f"{row.get('displayname')}（connectorid={row.get('connectorid')}）")
    return conflicts


def _obo_conflicts(resource: str, own_connector_id: str | None) -> list[str]:
    sys.path.insert(0, str(SKILLS / "standard" / "scripts"))
    from auth_helper import api_get  # noqa: PLC0415

    rows = api_get(f"connectors?$select=connectorid,displayname,connectionparameters&$filter=contains(connectionparameters,'{resource}')").get("value", [])
    return find_obo_conflicts(rows, resource, own_connector_id)


def _verify_runtime_sync(environment: str, internal_id: str, expected_obo: bool, timeout: int = 90) -> None:
    """Dataverse に保存された定義がランタイム側（PowerApps RP）に届いたかを OBO フラグで読み戻す。"""
    spec = importlib.util.spec_from_file_location("create_connection", Path(__file__).with_name("create_connection.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    deadline = time.time() + timeout
    while True:
        actual = module.supports_obo(module.connector_properties(environment, internal_id))
        if actual == expected_obo:
            print(f"[sync] ランタイム側に反映済み（on-behalf-of={'有効' if actual else '無効'}）")
            return
        if time.time() >= deadline:
            raise SystemExit(
                f"[sync] {timeout} 秒待ってもランタイム側の on-behalf-of が {actual} のままです（期待値 {expected_obo}）。"
                " 同じリソースで OBO を有効にした別コネクタが無いか確認する（references/troubleshooting.md）"
            )
        time.sleep(10)


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
    parser.add_argument("--secret-file", type=Path, help="configure_connector_oauth.py の出力（認証なしのコネクタでは省く）")
    parser.add_argument("--environment", default=os.getenv("ENV_ID"))
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--solution", default=os.getenv("SOLUTION_NAME"), help="作成時に追加するソリューションの一意名")
    parser.add_argument("--var", action="append", default=[], help="テンプレートの値 NAME=VALUE（複数可）")
    parser.add_argument("--connector-id", help="Dataverse の connectorid（GUID）。指定すると更新")
    parser.add_argument("--skip-redirect", action="store_true", help="リダイレクト URI の登録を省く")
    args = parser.parse_args()

    if not args.environment or not args.tenant_id:
        raise SystemExit("--environment と --tenant-id（または .env の ENV_ID / TENANT_ID）が必要です")
    credential = json.loads(args.secret_file.read_text(encoding="utf-8")) if args.secret_file else None
    values = {
        **({"API_APP_ID": credential["clientId"], "API_SCOPE": credential.get("scope") or f"api://{credential['clientId']}/.default"} if credential else {}),
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
        definition_text = render((args.connector_dir / "apiDefinition.swagger.json").read_text(encoding="utf-8-sig"), values)
        json.loads(definition_text)
        definition.write_text(definition_text, encoding="utf-8")
        properties = json.loads(render((args.connector_dir / "apiProperties.json").read_text(encoding="utf-8-sig"), values))
        no_auth = validate_definition(json.loads(definition_text), properties)
        if not no_auth:
            if not credential:
                raise SystemExit("OAuth のコネクタには --secret-file（configure_connector_oauth.py の出力）が必要です")
            properties = inject_secret(properties, credential)
        elif credential:
            raise SystemExit("認証なしのコネクタに --secret-file は使いません（シークレットを渡さない）")
        properties_file = root / "apiProperties.json"
        properties_file.write_text(json.dumps(properties, ensure_ascii=False, indent=2), encoding="utf-8")
        expected_obo, resource = obo_settings(properties)
        if expected_obo and resource:
            conflicts = _obo_conflicts(resource, args.connector_id)
            if conflicts:
                raise SystemExit(
                    "同じリソースで on-behalf-of を有効にしたコネクタが既にあります。更新はランタイムに同期されません:\n  "
                    + "\n  ".join(conflicts)
                    + "\n不要なら削除し、必要ならそちらを使う（references/troubleshooting.md）"
                )

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
    _verify_runtime_sync(args.environment, internal_id, expected_obo)

    if not args.skip_redirect and credential:
        audience = credential.get("resourceUri") or f"api://{credential['clientId']}"
        uri = redirect_uri_for(internal_id)
        changed = _add_redirect(audience, uri)
        print(f"[redirect] {'追加' if changed else '登録済み'}: {uri}")
    print(f"\nconnector: {internal_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
