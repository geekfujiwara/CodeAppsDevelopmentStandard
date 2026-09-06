"""Power Platform パイプラインをパイプライン ホスト環境の Dataverse API で構成する。

管理センターやパイプライン アプリの UI を使わずに、開発 → テスト → 本番の段階（ステージ）を
ブループリントの定義どおりに作成する。既に同名のレコードがあれば作らずに再利用する（冪等）。

使い方:
    python setup_pipeline.py --host-url <PIPELINE_HOST_URL>                 # dry-run
    python setup_pipeline.py --host-url <PIPELINE_HOST_URL> --apply
    python setup_pipeline.py --host-url ... --pipeline "AI CoE 内製開発パイプライン" --apply
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import get_token  # noqa: E402
from environment_naming import DEFAULT_BLUEPRINT, load_blueprint  # noqa: E402

_TIMEOUT = 120

DEVELOPMENT_ENVIRONMENT = 200000000
TARGET_ENVIRONMENT = 200000001


def _headers(host_url: str) -> dict:
    return {
        "Authorization": f"Bearer {get_token(scope=f'{host_url}/.default')}",
        "Content-Type": "application/json; charset=utf-8",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
    }


def _request(method: str, url: str, headers: dict, body: dict | None = None) -> requests.Response:
    for attempt in range(4):
        try:
            return requests.request(method, url, headers=headers, json=body, timeout=_TIMEOUT)
        except requests.exceptions.RequestException:
            if attempt == 3:
                raise
            time.sleep(3)
    raise RuntimeError("unreachable")


def _api(host_url: str) -> str:
    return f"{host_url}/api/data/v9.2"


def _find(host_url: str, headers: dict, entity_set: str, key: str, filter_query: str) -> str | None:
    url = f"{_api(host_url)}/{entity_set}?$select={key}&$filter={filter_query}"
    response = _request("GET", url, headers)
    response.raise_for_status()
    values = response.json().get("value", [])
    return values[0][key] if values else None


def _create(host_url: str, headers: dict, entity_set: str, body: dict) -> str:
    response = _request("POST", f"{_api(host_url)}/{entity_set}", {**headers, "Prefer": "return=representation"}, body)
    if not response.ok:
        raise RuntimeError(f"{entity_set} の作成に失敗しました: HTTP {response.status_code} {response.text[:300]}")
    return response.json()[entity_set.rstrip("s") + "id"]


def ensure_environment(host_url: str, headers: dict, name: str, environment_id: str, is_development: bool, apply: bool) -> str | None:
    existing = _find(
        host_url,
        headers,
        "deploymentenvironments",
        "deploymentenvironmentid",
        f"environmentid eq '{environment_id}'",
    )
    if existing:
        print(f"  環境レコード '{name}' は既にあります。")
        return existing
    print(f"  {'' if apply else '[dry-run] '}環境レコード '{name}' を登録（{environment_id}）")
    if not apply:
        return None
    return _create(
        host_url,
        headers,
        "deploymentenvironments",
        {
            "name": name,
            "environmentid": environment_id,
            "environmenttype": DEVELOPMENT_ENVIRONMENT if is_development else TARGET_ENVIRONMENT,
        },
    )


def ensure_pipeline(host_url: str, headers: dict, name: str, description: str, apply: bool) -> str | None:
    existing = _find(host_url, headers, "deploymentpipelines", "deploymentpipelineid", f"name eq '{name}'")
    if existing:
        print(f"  パイプライン '{name}' は既にあります。")
        return existing
    print(f"  {'' if apply else '[dry-run] '}パイプライン '{name}' を作成")
    if not apply:
        return None
    return _create(host_url, headers, "deploymentpipelines", {"name": name, "description": description})


def ensure_stage(
    host_url: str,
    headers: dict,
    name: str,
    pipeline_id: str | None,
    target_id: str | None,
    previous_id: str | None,
    apply: bool,
) -> str | None:
    if pipeline_id:
        existing = _find(
            host_url,
            headers,
            "deploymentstages",
            "deploymentstageid",
            f"name eq '{name}' and _deploymentpipelineid_value eq {pipeline_id}",
        )
        if existing:
            print(f"  ステージ '{name}' は既にあります。")
            return existing
    print(f"  {'' if apply else '[dry-run] '}ステージ '{name}' を作成")
    if not apply or not pipeline_id or not target_id:
        return None
    body = {
        "name": name,
        "deploymentpipelineid@odata.bind": f"/deploymentpipelines({pipeline_id})",
        "targetdeploymentenvironmentid@odata.bind": f"/deploymentenvironments({target_id})",
    }
    if previous_id:
        body["previousdeploymentstageid@odata.bind"] = f"/deploymentstages({previous_id})"
    return _create(host_url, headers, "deploymentstages", body)


def main() -> int:
    parser = argparse.ArgumentParser(description="Power Platform パイプラインを構成する")
    parser.add_argument("--host-url", required=True, help="パイプライン ホスト環境の URL")
    parser.add_argument("--blueprint", default=str(DEFAULT_BLUEPRINT), help="ブループリントのパス")
    parser.add_argument("--pipeline", help="この名前のパイプラインだけを構成する")
    parser.add_argument("--apply", action="store_true", help="実際に作成する（既定は dry-run）")
    args = parser.parse_args()

    host_url = args.host_url.rstrip("/")
    headers = _headers(host_url)
    blueprint = load_blueprint(Path(args.blueprint))
    pipelines = blueprint.get("pipelines") or []
    if not pipelines:
        print("ブループリントに pipelines が定義されていません。")
        return 0

    for pipeline in pipelines:
        if args.pipeline and pipeline.get("name") != args.pipeline:
            continue
        print(f"[{pipeline['name']}]")
        pipeline_id = ensure_pipeline(host_url, headers, pipeline["name"], pipeline.get("purpose", ""), args.apply)

        development = pipeline.get("developmentEnvironments") or []
        for environment in development:
            ensure_environment(host_url, headers, environment["name"], environment["environmentId"], True, args.apply)

        previous_id = None
        for stage in pipeline.get("stages") or []:
            target_id = ensure_environment(
                host_url, headers, stage["environmentName"], stage["environmentId"], False, args.apply
            )
            previous_id = ensure_stage(host_url, headers, stage["name"], pipeline_id, target_id, previous_id, args.apply)
        print()

    if not args.apply:
        print("[dry-run] 適用するには --apply を付けてください。")
    else:
        print("パイプラインの構成が完了しました。開発環境の「パイプライン」から発行先を確認してください。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
