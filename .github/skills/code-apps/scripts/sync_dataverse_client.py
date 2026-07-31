"""templates/dataverse-client.ts を、samples 配下の全コピーへ反映する。

SDK の破壊的変更でラッパーを直すときは、templates/dataverse-client.ts だけを編集し
本スクリプトで配布する。

使い方:
  python sync_dataverse_client.py            # 差分のあるコピーを上書き
  python sync_dataverse_client.py --check    # 上書きせず差分の有無だけを返す（CI 用）
"""

from __future__ import annotations

import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

BASE = Path(__file__).resolve().parent.parent
CANONICAL = BASE / "templates" / "dataverse-client.ts"
COPY_REL = Path("src/lib/dataverse-client.ts")


def main() -> int:
    check_only = "--check" in sys.argv

    if not CANONICAL.is_file():
        print(f"❌ 正となるファイルがありません: {CANONICAL}")
        return 1

    expected = CANONICAL.read_bytes()
    drifted = []

    for sample in sorted(p for p in (BASE / "samples").iterdir() if p.is_dir()):
        target = sample / COPY_REL
        if not target.is_file():
            continue
        if target.read_bytes() == expected:
            continue
        drifted.append(sample.name)
        if not check_only:
            target.write_bytes(expected)

    if not drifted:
        print("✅ すべてのコピーが templates/dataverse-client.ts と一致しています")
        return 0

    verb = "差分あり" if check_only else "更新しました"
    for name in drifted:
        print(f"{'⚠️' if check_only else '🔄'} {name}: {verb}")
    return 1 if check_only else 0


if __name__ == "__main__":
    sys.exit(main())
