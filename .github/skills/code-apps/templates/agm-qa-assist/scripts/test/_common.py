"""検証スクリプト共通: .env の読み込みと、接続参照からコネクタ・接続を引く。

接続参照の論理名は .env から読む（コードに環境の値を書かない）:
  CONNECTION_REFERENCE_LOGICAL_NAME  … Dataverse
  AGM_SPEECH_CONNREF                 … トークン発行のカスタム コネクタ
  AGM_SHAREPOINT_CONNREF             … SharePoint
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))


def load_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f".env に {name} がありません（references の .env.example を参照）")
    return value


def connection(connref_env: str) -> tuple[str, str]:
    """接続参照（論理名は .env の connref_env）から (接続 ID, コネクタの API 名) を返す。"""
    from auth_helper import api_get  # noqa: PLC0415

    name = env(connref_env)
    rows = api_get(f"connectionreferences?$select=connectionid,connectorid&$filter=connectionreferencelogicalname eq '{name}'")["value"]
    if not rows or not rows[0].get("connectionid"):
        raise SystemExit(f"接続参照 {name} が無いか、接続がまだ紐づいていません")
    return rows[0]["connectionid"], rows[0]["connectorid"].rstrip("/").split("/")[-1]


def runtime_url(api_name: str) -> str:
    """コネクタのランタイム URL（接続を直接呼ぶときの起点）"""
    spec = importlib.util.spec_from_file_location("cc", ROOT / ".github/skills/custom-connector/scripts/create_connection.py")
    cc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cc)  # type: ignore[union-attr]
    return cc.connector_properties(env("ENV_ID"), api_name)["runtimeUrls"][0].rstrip("/")


def app_origin() -> str:
    """Code Apps が配信されるオリジン（環境 ID の 16 進 30 桁 + "." + 末尾 2 桁）。CORS の確認に使う"""
    hex_id = env("ENV_ID").replace("-", "").lower()
    return f"https://{hex_id[:-2]}.{hex_id[-2:]}.environment.api.powerplatformusercontent.com"
