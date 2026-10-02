"""アプリの保存経路（録音 → SharePoint、発言・質問 → Dataverse）を、アプリと同じ要求で実サービスに対して確かめる。

- SharePoint: コネクタのランタイム経由で CreateFile（アプリの SharePointService.CreateFile と同じ操作）
  → Graph でファイルの大きさを読み戻す → 削除
- Dataverse: 総会を名前で探し、発言（総会への lookup）と質問（発言・想定問答への lookup）を作る → 読み戻す → 削除

使い方（プロジェクト ルート、.env に TENANT_ID / DATAVERSE_URL / ENV_ID / VITE_AGM_* を設定済み）:
  python scripts/test/verify_save_path.py --audio <wav/webm> [--keep]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
from auth_helper import api_delete, api_get, api_post, get_token  # noqa: E402

GRAPH_CLIENT = "14d82eec-204b-4c2f-b7e8-296a70dab67e"


def load_env() -> None:
    env = ROOT / ".env"
    for line in env.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def connection_helpers():
    spec = importlib.util.spec_from_file_location("cc", ROOT / ".github/skills/custom-connector/scripts/create_connection.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def sharepoint_connection(cc, env_id: str) -> str:
    sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
    from _common import connection as connection_of  # noqa: PLC0415

    return connection_of("AGM_SHAREPOINT_CONNREF")[0]


def verify_sharepoint(audio: Path, keep: bool) -> dict:
    import requests  # noqa: PLC0415

    cc = connection_helpers()
    env_id = os.environ["ENV_ID"]
    site = os.environ["VITE_AGM_SP_SITE_URL"]
    library = os.environ["VITE_AGM_SP_LIBRARY"]
    meeting = os.environ.get("VITE_AGM_MEETING_TITLE", "株主総会")
    safe = lambda v: "".join("_" if c in '\\/:*?"<>|#% ' else c for c in v)[:40]  # noqa: E731
    connection = sharepoint_connection(cc, env_id)
    runtime = cc.connector_properties(env_id, "shared_sharepointonline")["runtimeUrls"][0].rstrip("/")
    folder = f"/{library}/{safe(meeting)}/9999"
    name = f"verify-{datetime.now():%Y%m%d-%H%M%S}{audio.suffix}"
    body = audio.read_bytes()
    url = f"{runtime}/{connection}/datasets/{urllib.parse.quote(urllib.parse.quote(site, safe=''), safe='')}/files"
    t0 = time.perf_counter()
    res = requests.post(
        url,
        params={"folderPath": folder, "name": name, "queryParametersSingleEncoded": "true"},
        data=body,
        headers={"Authorization": f"Bearer {get_token('https://apihub.azure.com/.default')}", "Content-Type": "application/octet-stream"},
        timeout=120,
    )
    ms = round((time.perf_counter() - t0) * 1000)
    if res.status_code >= 400:
        raise SystemExit(f"CreateFile が {res.status_code}: {res.text[:300]}")
    meta = res.json()
    graph = {"Authorization": f"Bearer {get_token('https://graph.microsoft.com/.default', client_id=GRAPH_CLIENT)}"}
    host, path = site.split("/sites/", 1)
    site_id = requests.get(f"https://graph.microsoft.com/v1.0/sites/{host.split('//')[1]}:/sites/{path}", headers=graph, timeout=60).json()["id"]
    drives = requests.get(f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives?$select=id,name,webUrl", headers=graph, timeout=60).json()["value"]
    drive = next(d for d in drives if d["webUrl"].rstrip("/").endswith(f"/{library}"))
    item = requests.get(f"https://graph.microsoft.com/v1.0/drives/{drive['id']}/root:/{safe(meeting)}/9999/{name}?$select=id,size,webUrl", headers=graph, timeout=60).json()
    result = {"status": res.status_code, "ms": ms, "path": meta.get("Path"), "uploadedBytes": len(body), "storedBytes": item.get("size"), "binaryIntact": item.get("size") == len(body)}
    if not keep and item.get("id"):
        requests.delete(f"https://graph.microsoft.com/v1.0/drives/{drive['id']}/items/{item['id']}", headers=graph, timeout=60)
        result["deleted"] = True
    return result


def verify_dataverse(keep: bool) -> dict:
    meeting_title = os.environ.get("VITE_AGM_MEETING_TITLE", "株主総会")
    meetings = api_get("${PUBLISHER_PREFIX}_agmmeetings?$select=${PUBLISHER_PREFIX}_agmmeetingid,${PUBLISHER_PREFIX}_name")["value"]
    meeting = next((m for m in meetings if m["${PUBLISHER_PREFIX}_name"] == meeting_title), None)
    if not meeting:
        raise SystemExit(f"総会レコード「{meeting_title}」がありません")
    qa = api_get("${PUBLISHER_PREFIX}_agmqas?$select=${PUBLISHER_PREFIX}_agmqaid&$filter=${PUBLISHER_PREFIX}_name eq 'QA-004'")["value"][0]
    now = datetime.now(timezone.utc).replace(microsecond=0)
    t0 = time.perf_counter()
    turn_id = api_post(
        "${PUBLISHER_PREFIX}_agmturns",
        {
            "${PUBLISHER_PREFIX}_name": "9999 検証",
            "${PUBLISHER_PREFIX}_shareholdernumber": "9999",
            "${PUBLISHER_PREFIX}_shareholdername": "検証",
            "${PUBLISHER_PREFIX}_startedat": now.isoformat().replace("+00:00", "Z"),
            "${PUBLISHER_PREFIX}_endedat": now.isoformat().replace("+00:00", "Z"),
            "${PUBLISHER_PREFIX}_durationsec": 12,
            "${PUBLISHER_PREFIX}_transcript": "それから自社株買いの20億円というのは配当の代わりなのか。",
            "${PUBLISHER_PREFIX}_audiourl": "",
            "${PUBLISHER_PREFIX}_audiofilename": "",
            "${PUBLISHER_PREFIX}_savestatus": "検証 / 録音なし",
            "${PUBLISHER_PREFIX}_meetingid@odata.bind": f"/${PUBLISHER_PREFIX}_agmmeetings({meeting['${PUBLISHER_PREFIX}_agmmeetingid']})",
        },
    )
    question_id = api_post(
        "${PUBLISHER_PREFIX}_agmquestions",
        {
            "${PUBLISHER_PREFIX}_name": "Q1 配当・株主還元",
            "${PUBLISHER_PREFIX}_seq": 1,
            "${PUBLISHER_PREFIX}_category": "配当・株主還元",
            "${PUBLISHER_PREFIX}_excerpt": "自社株買いの20億円というのは配当の代わりなのか",
            "${PUBLISHER_PREFIX}_qacode": "QA-004",
            "${PUBLISHER_PREFIX}_answerdraft": "自己株式取得は…",
            "${PUBLISHER_PREFIX}_citations": json.dumps([{"claim": "20億円", "sourceId": "IR-011"}], ensure_ascii=False),
            "${PUBLISHER_PREFIX}_score": 42.31,
            "${PUBLISHER_PREFIX}_adopted": False,
            "${PUBLISHER_PREFIX}_unverifiednumbers": "",
            "${PUBLISHER_PREFIX}_turnid@odata.bind": f"/${PUBLISHER_PREFIX}_agmturns({turn_id})",
            "${PUBLISHER_PREFIX}_qaid@odata.bind": f"/${PUBLISHER_PREFIX}_agmqas({qa['${PUBLISHER_PREFIX}_agmqaid']})",
        },
    )
    ms = round((time.perf_counter() - t0) * 1000)
    back = api_get(f"${PUBLISHER_PREFIX}_agmquestions({question_id})?$select=${PUBLISHER_PREFIX}_qacode,_${PUBLISHER_PREFIX}_turnid_value,_${PUBLISHER_PREFIX}_qaid_value")
    result = {"ms": ms, "turnLinked": back["_${PUBLISHER_PREFIX}_turnid_value"] == turn_id, "qaLinked": back["_${PUBLISHER_PREFIX}_qaid_value"] == qa["${PUBLISHER_PREFIX}_agmqaid"]}
    if not keep:
        api_delete(f"${PUBLISHER_PREFIX}_agmquestions({question_id})")
        api_delete(f"${PUBLISHER_PREFIX}_agmturns({turn_id})")
        result["deleted"] = True
    return result


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--keep", action="store_true", help="検証で作ったファイルとレコードを残す")
    args = parser.parse_args()
    load_env()
    print("[sharepoint]", json.dumps(verify_sharepoint(args.audio, args.keep), ensure_ascii=False))
    print("[dataverse]", json.dumps(verify_dataverse(args.keep), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
