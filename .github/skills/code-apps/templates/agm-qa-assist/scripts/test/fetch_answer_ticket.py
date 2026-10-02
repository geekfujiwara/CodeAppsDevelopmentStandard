"""生成 API のチケットをコネクタ経由で取り、ホスト再現テスト用のビルドに渡すためファイルへ書く（画面には出さない）。

使い方: python scripts/test/fetch_answer_ticket.py --out .mcp/answer-ticket.json   （.mcp は Git 除外。使い終わったら消す）
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())
    import requests  # noqa: PLC0415
    from auth_helper import get_token  # noqa: PLC0415
    from _common import connection as connection_of, runtime_url  # noqa: PLC0415

    connection, connector = connection_of("AGM_SPEECH_CONNREF")
    runtime = runtime_url(connector)
    res = requests.get(f"{runtime}/{connection}/answer/ticket", headers={"Authorization": f"Bearer {get_token('https://apihub.azure.com/.default')}"}, timeout=60)
    res.raise_for_status()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(res.json()), encoding="utf-8")
    print(f"チケットを書き出しました: {args.out}（{res.json()['expiresInSeconds']} 秒有効）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
