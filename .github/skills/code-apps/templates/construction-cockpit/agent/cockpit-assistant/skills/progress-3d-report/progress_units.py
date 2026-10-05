"""施工単位（CAD 部品の階・区画）と進捗率の相互換算。Copilot Studio のスキルから使う。

アプリ（現場コックピット）は、作業の進捗 p% に対して施工単位の先頭から floor(p/100 × 件数) 個を
「完成」、次の 1 個を「施工中」として 3D に表示する。施工単位は工事の ${PUBLISHER_PREFIX}_modelmapping（JSON）の
units[部位キー] に下から順で入っている。

    python progress_units.py --units '["IfcSlab_Level_1","IfcSlab_Level_2","IfcSlab_Level_3","IfcSlab_Level_4"]' --completed IfcSlab_Level_3
    python progress_units.py --units '[...]' --percent 60
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys


def tolerance(count: int) -> float:
    """アプリ（project-model-3d.tsx の segmentTolerance）と同じ丸め幅。進捗 1% の半分（最小 0.05 単位）+ 浮動小数の誤差"""
    return max(0.05, count / 200) + 1e-6

def _normalize(value: str) -> str:
    return re.sub(r"[\s_\-./:#()（）・]+", "", value).lower()


def percent_from_completed(units: list[str], completed: str | int) -> int:
    """「ここまで完了」を進捗率にする。completed は施工単位の名前（部分一致可）または完了した個数。"""
    if not units:
        raise ValueError("施工単位がありません。工事の ${PUBLISHER_PREFIX}_modelmapping を確認してください。")
    if isinstance(completed, int) or str(completed).strip().isdigit():
        count = int(completed)
    else:
        key = _normalize(str(completed))
        matches = [index for index, name in enumerate(units) if key and key in _normalize(name)]
        if not matches:
            raise ValueError(f"施工単位「{completed}」が見つかりません。候補: {', '.join(units)}")
        exact = [index for index in matches if _normalize(units[index]) == key]
        if len(matches) > 1 and not exact:
            raise ValueError(f"「{completed}」に一致する施工単位が複数あります: {', '.join(units[index] for index in matches)}")
        count = (exact or matches)[0] + 1
    if not 0 <= count <= len(units):
        raise ValueError(f"完了数 {count} は 0〜{len(units)} の範囲で指定してください。")
    return round(count * 100 / len(units))


def built_units(units: list[str], percent: float) -> dict:
    """進捗率から、3D に表示される「完成」「施工中」「未着手」の施工単位を求める。"""
    value = max(0.0, min(100.0, float(percent)))
    total = len(units)
    built = value / 100 * total
    done = min(total, math.floor(built + tolerance(total)))
    active = units[done] if done < total and built > done + tolerance(total) else None
    return {
        "percent": round(value),
        "done": units[:done],
        "active": active,
        "planned": units[done + (1 if active else 0):],
        "summary": f"{total} 単位中 {done} 単位が完成" + (f"、{active} を施工中" if active else ""),
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--units", required=True, help="施工単位の JSON 配列（${PUBLISHER_PREFIX}_modelmapping の units[部位キー]）")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--completed", help="ここまで完了した施工単位の名前、または完了した個数")
    group.add_argument("--percent", type=float, help="進捗率（0〜100）")
    args = parser.parse_args()
    units = json.loads(args.units)
    if args.completed is not None:
        percent = percent_from_completed(units, args.completed)
        print(json.dumps({"percent": percent, **built_units(units, percent)}, ensure_ascii=False))
    else:
        print(json.dumps(built_units(units, args.percent), ensure_ascii=False))


if __name__ == "__main__":
    main()
