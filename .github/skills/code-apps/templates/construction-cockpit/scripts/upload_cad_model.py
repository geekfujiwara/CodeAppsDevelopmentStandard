"""CAD モデル（GLB / OBJ / STL / FBX）と部位の対応付けを工事に登録する。

アプリの「CAD モデルを取り込む」と同じ保存形式で、Dataverse に直接登録する（一括移行・CI・デモ用）。

    python scripts/upload_cad_model.py --project-no P-2026-004 \
        --file app/exports/cad/logistics-center-bim.glb \
        --mapping app/exports/cad/logistics-center-bim.mapping.json

- ${PUBLISHER_PREFIX}_project.${PUBLISHER_PREFIX}_modelfile（ファイル列）へ本体を PATCH（application/octet-stream）
- ${PUBLISHER_PREFIX}_project.${PUBLISHER_PREFIX}_modelmapping へ対応付け JSON、${PUBLISHER_PREFIX}_modelurl へ dataverse:${PUBLISHER_PREFIX}_modelfile を設定
- 登録後にファイルを取得し直し、サイズが一致することを確かめる
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import DATAVERSE_URL, api_get, api_patch, get_session  # noqa: E402

CAD_MODEL_URL = "dataverse:${PUBLISHER_PREFIX}_modelfile"
MAX_BYTES = 50 * 1024 * 1024
FORMATS = {".glb": "glb", ".obj": "obj", ".stl": "stl", ".fbx": "fbx"}


def validate(data: bytes, mapping: dict, path: Path) -> None:
    """アプリの inspectCadFile と同じ前提を、登録前に確認する（壊れたモデルを登録しない）"""
    if len(data) > MAX_BYTES:
        raise SystemExit(f"ファイルが 50 MB を超えています: {len(data)} バイト")
    fmt = mapping.get("format") or FORMATS.get(path.suffix.lower())
    if fmt not in FORMATS.values():
        raise SystemExit(f"対応していない形式です: {path.suffix}")
    if fmt == "glb":
        if data[:4] != b"glTF":
            raise SystemExit("GLB のヘッダー（glTF）がありません")
        length = int.from_bytes(data[12:16], "little")
        doc = json.loads(data[20 : 20 + length])
        used = set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", []))
        blocked = used & {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"}
        if blocked:
            raise SystemExit(f"未対応の圧縮拡張を使っています: {', '.join(sorted(blocked))}")
        if any("uri" in item for item in doc.get("buffers", [])):
            raise SystemExit("外部 .bin を参照しています。1 ファイルの GLB で書き出してください")
    if mapping.get("version") != 1 or not isinstance(mapping.get("rules"), dict):
        raise SystemExit("対応付け JSON の形式が不正です（version: 1 と rules が必要）")
    mapping["format"] = fmt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-no", required=True, help="工事番号（${PUBLISHER_PREFIX}_projectno）")
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--mapping", required=True, type=Path, help="対応付け JSON（アプリの CadMapping と同じ形式）")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = args.file.read_bytes()
    mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
    validate(data, mapping, args.file)
    mapping.update({"fileName": args.file.name, "fileSize": len(data), "savedAt": datetime.now(timezone.utc).isoformat()})

    rows = api_get(f"${PUBLISHER_PREFIX}_projects?$select=${PUBLISHER_PREFIX}_projectid,${PUBLISHER_PREFIX}_name&$filter=${PUBLISHER_PREFIX}_projectno eq '{args.project_no}'")["value"]
    if len(rows) != 1:
        raise SystemExit(f"工事番号 {args.project_no} の工事が {len(rows)} 件あります（1 件である必要があります）")
    project_id, name = rows[0]["${PUBLISHER_PREFIX}_projectid"], rows[0]["${PUBLISHER_PREFIX}_name"]
    print(f"対象: {args.project_no} {name}  ファイル {args.file.name} {len(data) / 1048576:.2f} MB  対応付け {len(mapping['rules'])} 件")
    if args.dry_run:
        return

    session = get_session()
    url = f"{DATAVERSE_URL.rstrip('/')}/api/data/v9.2/${PUBLISHER_PREFIX}_projects({project_id})/${PUBLISHER_PREFIX}_modelfile"
    response = session.patch(url, data=data, headers={"Content-Type": "application/octet-stream", "x-ms-file-name": args.file.name}, timeout=600)
    response.raise_for_status()
    api_patch(f"${PUBLISHER_PREFIX}_projects({project_id})", {"${PUBLISHER_PREFIX}_modelmapping": json.dumps(mapping, ensure_ascii=False), "${PUBLISHER_PREFIX}_modelurl": CAD_MODEL_URL})

    # 読み戻し: Dataverse は 4 MB を超える Range やファイル末尾を超える Range を受け付けない（416）ため、分割して取得する
    chunk = 4 * 1024 * 1024
    content = b""
    while len(content) < len(data):
        end = min(len(content) + chunk, len(data)) - 1
        part = session.get(f"{url}/$value", headers={"Range": f"bytes={len(content)}-{end}"}, timeout=600)
        part.raise_for_status()
        if not part.content:
            break
        content += part.content
    row = api_get(f"${PUBLISHER_PREFIX}_projects({project_id})?$select=${PUBLISHER_PREFIX}_modelurl,${PUBLISHER_PREFIX}_modelfile_name,${PUBLISHER_PREFIX}_modelmapping")
    if content != data or row["${PUBLISHER_PREFIX}_modelurl"] != CAD_MODEL_URL or json.loads(row["${PUBLISHER_PREFIX}_modelmapping"])["fileSize"] != len(data):
        raise SystemExit(f"読み戻しが一致しません: size={len(content)} url={row['${PUBLISHER_PREFIX}_modelurl']}")
    print(f"登録しました: {row['${PUBLISHER_PREFIX}_modelfile_name']}（{len(content)} バイト、内容一致）→ ${PUBLISHER_PREFIX}_modelurl={CAD_MODEL_URL}")


if __name__ == "__main__":
    main()
