"""Teams のアシスタント（daily-report-intake スキル）と同じ形で日報・写真・進捗報告を 1 件登録し、読み戻して確かめる。

エージェントの Dataverse ツール（create_record）が送るのと同じ JSON で登録する。写真は photo_payload.py で
縮小・メタデータ除去した base64 を、画像列 ${PUBLISHER_PREFIX}_photo に JSON のまま入れる。登録した提出は、アプリの「承認待ち」に表示される。

    python scripts/verify_report_intake.py --project-no P-2026-004 [--photo <画像ファイル>] [--cleanup]

--photo を省略すると、確認用の画像（撮影日時・位置情報つき JPEG）を作って使う。
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
sys.path.insert(0, str(ROOT / "agent" / "cockpit-assistant" / "skills" / "daily-report-intake"))

from auth_helper import DATAVERSE_URL, api_delete, api_get, api_post, get_session  # noqa: E402
from photo_payload import build_payload  # noqa: E402

SUBMITTED, DRAFT = 100000001, 100000000


def sample_photo() -> bytes:
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (3200, 2400), (96, 112, 128))
    draw = ImageDraw.Draw(image)
    for i in range(0, 3200, 160):
        draw.rectangle([i, 1500, i + 120, 2400], fill=(150, 150, 150))
    draw.rectangle([200, 200, 1400, 700], fill=(30, 60, 40))
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0x9003] = datetime.now().strftime("%Y:%m:%d %H:%M:%S")
    exif.get_ifd(0x8825)[2] = (34.0, 37.0, 0.0)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif, quality=92)
    return buffer.getvalue()


def created_id(table_set: str, key_column: str, key: str, id_column: str) -> str:
    rows = api_get(f"{table_set}?$select={id_column}&$filter={key_column} eq '{key}'")["value"]
    if len(rows) != 1:
        raise SystemExit(f"{table_set} の登録を特定できません（{len(rows)} 件）")
    return rows[0][id_column]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-no", default="P-2026-004")
    parser.add_argument("--task-zone", default="slab")
    parser.add_argument("--photo")
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()

    project = api_get(f"${PUBLISHER_PREFIX}_projects?$select=${PUBLISHER_PREFIX}_projectid,${PUBLISHER_PREFIX}_name&$filter=${PUBLISHER_PREFIX}_projectno eq '{args.project_no}'")["value"][0]
    task = api_get(f"${PUBLISHER_PREFIX}_tasks?$select=${PUBLISHER_PREFIX}_taskid,${PUBLISHER_PREFIX}_name,${PUBLISHER_PREFIX}_progress&$filter=_${PUBLISHER_PREFIX}_project_value eq {project['${PUBLISHER_PREFIX}_projectid']} and ${PUBLISHER_PREFIX}_zone eq '{args.task_zone}'")["value"][0]
    stamp = datetime.now().strftime("%H%M%S")
    name = f"{date.today().year}/{date.today().month}/{date.today().day} {project['${PUBLISHER_PREFIX}_name']}（受け入れ確認 {stamp}）"

    # 1. 日報（下書き・提出済）
    api_post("${PUBLISHER_PREFIX}_dailyreports", {
        "${PUBLISHER_PREFIX}_name": name, "${PUBLISHER_PREFIX}_project@odata.bind": f"/${PUBLISHER_PREFIX}_projects({project['${PUBLISHER_PREFIX}_projectid']})",
        "${PUBLISHER_PREFIX}_reportdate": date.today().isoformat(), "${PUBLISHER_PREFIX}_weather": 100000000, "${PUBLISHER_PREFIX}_workers": 24,
        "${PUBLISHER_PREFIX}_workdetail": "3 階床スラブ打設 120m³（受け入れ確認用）", "${PUBLISHER_PREFIX}_nextplan": "4 階デッキ敷込み", "${PUBLISHER_PREFIX}_remarks": "",
        "${PUBLISHER_PREFIX}_aidrafted": True, "${PUBLISHER_PREFIX}_status": DRAFT, "${PUBLISHER_PREFIX}_reviewstatus": SUBMITTED,
    })
    report_id = created_id("${PUBLISHER_PREFIX}_dailyreports", "${PUBLISHER_PREFIX}_name", name, "${PUBLISHER_PREFIX}_dailyreportid")

    # 2. 写真（画像列に base64 を JSON で入れる）
    original = Path(args.photo).read_bytes() if args.photo else sample_photo()
    payload = build_payload(original)
    photo_name = f"{name} 写真 1"
    api_post("${PUBLISHER_PREFIX}_reportphotos", {
        "${PUBLISHER_PREFIX}_name": photo_name, "${PUBLISHER_PREFIX}_dailyreport@odata.bind": f"/${PUBLISHER_PREFIX}_dailyreports({report_id})",
        "${PUBLISHER_PREFIX}_task@odata.bind": f"/${PUBLISHER_PREFIX}_tasks({task['${PUBLISHER_PREFIX}_taskid']})", "${PUBLISHER_PREFIX}_caption": f"{task['${PUBLISHER_PREFIX}_name']} 3 階 打設状況",
        "${PUBLISHER_PREFIX}_takenon": payload["takenOn"] or datetime.now().isoformat(), "${PUBLISHER_PREFIX}_photo": payload["base64"],
    })
    photo_id = created_id("${PUBLISHER_PREFIX}_reportphotos", "${PUBLISHER_PREFIX}_name", photo_name, "${PUBLISHER_PREFIX}_reportphotoid")

    # 3. 進捗報告（下書き）
    entry_name = f"{task['${PUBLISHER_PREFIX}_name']} {date.today().isoformat()} {stamp}"
    reported = min(100, task["${PUBLISHER_PREFIX}_progress"] + 25)
    api_post("${PUBLISHER_PREFIX}_progressentries", {
        "${PUBLISHER_PREFIX}_name": entry_name, "${PUBLISHER_PREFIX}_dailyreport@odata.bind": f"/${PUBLISHER_PREFIX}_dailyreports({report_id})",
        "${PUBLISHER_PREFIX}_task@odata.bind": f"/${PUBLISHER_PREFIX}_tasks({task['${PUBLISHER_PREFIX}_taskid']})", "${PUBLISHER_PREFIX}_project@odata.bind": f"/${PUBLISHER_PREFIX}_projects({project['${PUBLISHER_PREFIX}_projectid']})",
        "${PUBLISHER_PREFIX}_previousprogress": task["${PUBLISHER_PREFIX}_progress"], "${PUBLISHER_PREFIX}_reportedprogress": reported,
        "${PUBLISHER_PREFIX}_completedunit": "IfcSlab_Level_3", "${PUBLISHER_PREFIX}_note": "3 階打設完了（受け入れ確認）", "${PUBLISHER_PREFIX}_reviewstatus": SUBMITTED,
    })
    entry_id = created_id("${PUBLISHER_PREFIX}_progressentries", "${PUBLISHER_PREFIX}_name", entry_name, "${PUBLISHER_PREFIX}_progressentryid")

    # 読み戻し: 写真はフルサイズで、送った JPEG と一致すること
    full = get_session().get(f"{DATAVERSE_URL}/api/data/v9.2/${PUBLISHER_PREFIX}_reportphotos({photo_id})/${PUBLISHER_PREFIX}_photo/$value?size=full")
    sent = base64.b64decode(payload["base64"])
    thumb = api_get(f"${PUBLISHER_PREFIX}_reportphotos({photo_id})?$select=${PUBLISHER_PREFIX}_photo")["${PUBLISHER_PREFIX}_photo"] or ""
    task_after = api_get(f"${PUBLISHER_PREFIX}_tasks({task['${PUBLISHER_PREFIX}_taskid']})?$select=${PUBLISHER_PREFIX}_progress")["${PUBLISHER_PREFIX}_progress"]
    checks = {
        "写真（フルサイズ）が送った JPEG と一致": full.status_code in (200, 206) and full.content == sent,
        "一覧取得でサムネイルが返る": len(thumb) > 100,
        "位置情報を除去": payload["metadataRemoved"],
        "作業の正式な進捗は変わらない（承認待ち）": task_after == task["${PUBLISHER_PREFIX}_progress"],
    }
    print(json.dumps({"report": report_id, "photo": photo_id, "entry": entry_id, "photoBytes": len(sent), "original": len(original),
                      "size": [payload["width"], payload["height"]], "reported": f"{task['${PUBLISHER_PREFIX}_progress']}% → {reported}%"}, ensure_ascii=False))
    for label, ok in checks.items():
        print(f"  {'✅' if ok else '❌'} {label}")
    if args.cleanup:
        for path in (f"${PUBLISHER_PREFIX}_progressentries({entry_id})", f"${PUBLISHER_PREFIX}_reportphotos({photo_id})", f"${PUBLISHER_PREFIX}_dailyreports({report_id})"):
            api_delete(path)
        print("確認用の登録を削除しました")
    return 0 if all(checks.values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
