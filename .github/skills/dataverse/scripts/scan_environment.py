#!/usr/bin/env python3
"""Dataverse 環境スキャン — 既存資産を棚卸しし、再利用 vs 新規の判断材料を出力する。

新規テーブル設計の **前** に実行する。標準テーブル（account / contact / product /
systemuser 等）と既存カスタムテーブルを API で走査し、再利用推奨レポート（Markdown）を出力する。

使い方:
    python scan_environment.py                # 既定の標準テーブル群＋全カスタムテーブルを走査（高速・件数なし）
    python scan_environment.py --counts       # 各テーブルのレコード件数も取得（やや時間がかかる）
    python scan_environment.py --out scan.md  # レポートを Markdown ファイルに保存
    python scan_environment.py --tables account,contact,product   # 任意テーブルを追加で詳細表示

依存: ../../standard/scripts/auth_helper.py（共通認証）。値は .env から取得。
"""
import argparse
import os
import sys

# 進捗ログをリアルタイム表示するため stdout/stderr を行バッファに切り替え。
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except AttributeError:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "standard", "scripts"))
from auth_helper import api_get  # noqa: E402

# 営業/CRM で再利用候補になりやすい標準テーブル（論理名 → 用途）
STANDARD_TABLES = {
    "systemuser": "ユーザー（担当者・所有者）。カスタムユーザーテーブルは作らない",
    "businessunit": "組織単位（行レベルセキュリティの基盤）",
    "team": "チーム（共同所有・テリトリー表現に利用可）",
    "account": "取引先企業（顧客）。Field Service 等で整備済みの想定",
    "contact": "取引先担当者（顧客の個人）",
    "lead": "リード（標準）。営業リードに再利用検討",
    "opportunity": "商談（標準）。パイプライン管理に再利用検討",
    "campaign": "キャンペーン（標準）",
    "product": "製品（標準）。製品マスタは新規作成せず再利用",
    "pricelevel": "価格表（標準）",
    "uom": "単位（標準）",
    "transactioncurrency": "通貨（標準・複数通貨対応）",
    "activitypointer": "活動（標準・タスク/メール/電話等の基盤）",
}


def get_count(entity_set: str) -> str:
    """レコード件数を概算取得（取得失敗時は '-'）。"""
    try:
        r = api_get(f"{entity_set}?$count=true&$top=1&$select=createdon")
        return str(r.get("@odata.count", "-"))
    except Exception:
        return "-"


def get_entity_meta(logical: str) -> dict | None:
    try:
        return api_get(
            f"EntityDefinitions(LogicalName='{logical}')"
            "?$select=LogicalName,SchemaName,DisplayName,EntitySetName,"
            "IsCustomEntity,OwnershipType"
        )
    except Exception:
        return None


def disp_name(meta: dict) -> str:
    try:
        return meta["DisplayName"]["UserLocalizedLabel"]["Label"]
    except Exception:
        return ""


def scan_standard(with_counts: bool) -> list[dict]:
    rows = []
    for logical, purpose in STANDARD_TABLES.items():
        meta = get_entity_meta(logical)
        if not meta:
            rows.append({"logical": logical, "exists": False, "purpose": purpose})
            continue
        es = meta.get("EntitySetName", "")
        rows.append({
            "logical": logical,
            "exists": True,
            "schema": meta.get("SchemaName", ""),
            "display": disp_name(meta),
            "entityset": es,
            "count": get_count(es) if (with_counts and es) else "-",
            "purpose": purpose,
        })
    return rows


def scan_custom(with_counts: bool) -> list[dict]:
    """カスタムテーブル（IsCustomEntity=true）を一覧化。所属ソリューションは別途要確認。"""
    res = api_get(
        "EntityDefinitions?$filter=IsCustomEntity eq true"
        "&$select=LogicalName,SchemaName,DisplayName,EntitySetName,OwnershipType"
    )
    rows = []
    for m in res.get("value", []):
        es = m.get("EntitySetName", "")
        rows.append({
            "logical": m.get("LogicalName", ""),
            "schema": m.get("SchemaName", ""),
            "display": disp_name(m),
            "entityset": es,
            "count": get_count(es) if (with_counts and es) else "-",
        })
    return sorted(rows, key=lambda r: r["logical"])


def detail_table(logical: str) -> str:
    """指定テーブルの主要列（カスタム列＋Lookup）を Markdown で返す。"""
    out = [f"\n#### `{logical}` 列詳細\n"]
    try:
        attrs = api_get(
            f"EntityDefinitions(LogicalName='{logical}')/Attributes"
            "?$select=LogicalName,AttributeType,IsCustomAttribute"
            "&$filter=IsValidForRead eq true"
        )
    except Exception as e:
        return out[0] + f"\n（取得失敗: {e}）\n"
    out.append("| 論理名 | 型 | カスタム |")
    out.append("|---|---|---|")
    for a in sorted(attrs.get("value", []), key=lambda x: (not x.get("IsCustomAttribute", False), x.get("LogicalName", ""))):
        out.append(f"| {a.get('LogicalName','')} | {a.get('AttributeType','')} | {'✅' if a.get('IsCustomAttribute') else ''} |")
    return "\n".join(out)


def build_report(std: list[dict], custom: list[dict], details: list[str]) -> str:
    md = ["# Dataverse 環境スキャンレポート", ""]
    md.append(f"対象環境: `{os.environ.get('DATAVERSE_URL', '(.env)')}`")
    md.append("")
    md.append("## 1. 標準テーブル（再利用候補）")
    md.append("")
    md.append("> ユーザーは `systemuser`＋所有者/作成者列、顧客は `account`/`contact`、製品は `product` を**再利用**する。")
    md.append("")
    md.append("| 論理名 | 存在 | 表示名 | EntitySet | 件数 | 用途・再利用方針 |")
    md.append("|---|---|---|---|---|---|")
    for r in std:
        if r["exists"]:
            md.append(f"| `{r['logical']}` | ✅ | {r['display']} | {r['entityset']} | {r['count']} | {r['purpose']} |")
        else:
            md.append(f"| `{r['logical']}` | ❌ | - | - | - | {r['purpose']} |")
    md.append("")
    md.append("## 2. 既存カスタムテーブル（再利用検討）")
    md.append("")
    md.append("> 他ソリューション（Field Service 等）が作成済みのテーブル。新規作成前に流用可否を確認する。")
    md.append("")
    if custom:
        md.append("| 論理名 | 表示名 | EntitySet | 件数 |")
        md.append("|---|---|---|---|")
        for r in custom:
            md.append(f"| `{r['logical']}` | {r['display']} | {r['entityset']} | {r['count']} |")
    else:
        md.append("（カスタムテーブルなし）")
    md.append("")
    if details:
        md.append("## 3. 指定テーブルの列詳細")
        md.extend(details)
    md.append("")
    md.append("## 4. 再利用 vs 新規の指針")
    md.append("")
    md.append("- **再利用**: 標準/既存テーブルが用途に合致する場合は新規作成しない。")
    md.append("- **新規**: 既存に存在しない営業固有の概念のみ作成する。")
    md.append("- **ユーザー参照**: `ownerid`/`createdby`/`modifiedby` システム列＋`systemuser` Lookup を使う。")
    md.append("- **顧客参照**: customer 型 Lookup（`account`/`contact` ポリモーフィック）を使う。")
    return "\n".join(md)


def main():
    ap = argparse.ArgumentParser(description="Dataverse 環境スキャン")
    ap.add_argument("--out", help="レポート出力先 Markdown パス")
    ap.add_argument("--tables", help="列詳細を表示するテーブル（カンマ区切り論理名）")
    ap.add_argument("--counts", action="store_true", help="各テーブルのレコード件数も取得（やや時間がかかる）")
    args = ap.parse_args()

    print("[scan] 標準テーブルを走査中...")
    std = scan_standard(args.counts)
    print("[scan] カスタムテーブルを走査中...")
    custom = scan_custom(args.counts)

    details = []
    if args.tables:
        for t in [x.strip() for x in args.tables.split(",") if x.strip()]:
            print(f"[scan] {t} の列詳細を取得中...")
            details.append(detail_table(t))

    report = build_report(std, custom, details)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"[scan] レポートを書き出しました: {args.out}")
    else:
        print("\n" + report)


if __name__ == "__main__":
    main()
