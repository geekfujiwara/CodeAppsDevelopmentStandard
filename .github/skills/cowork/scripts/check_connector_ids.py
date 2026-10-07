"""Cowork プラグインのコネクタ ID が、ほかのプラグインと重ならないかを確かめる（読み取りのみ）。

Cowork は、同じコネクタ ID（agentConnectors[].id）を持つプラグインを 1 つしか有効にできない。
2 つ目を有効にすると「コネクタの競合 "<id>" を指定できるプラグインは 1 つだけです」と表示され、
どちらかを無効にするまで片方のプラグインの MCP が使えない。テナント内のプラグインの ID は API で一覧できないため、
(1) 汎用的な ID（dataverse-mcp など）を禁止し、(2) 手元にあるプラグインの manifest と突き合わせる。

  python check_connector_ids.py --manifest <plugin-root>/manifest.json
  python check_connector_ids.py --manifest <plugin-root>/manifest.json --scan C:/dev --scan D:/work
  （--scan を省くと .env / 環境変数の COWORK_PLUGIN_SCAN_DIRS（; 区切り）を使う）

終了コード: 0 = 問題なし / 1 = 汎用 ID・重複・ほかのプラグインとの衝突あり
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

# どのプラグインでも付けがちな ID。1 つでも使うと、同じ ID のプラグインと同時に有効にできない
GENERIC_IDS = {
    "dataverse-mcp", "dataverse", "dataversemcp", "dataverse-mcp-server",
    "mcp", "mcp-server", "remote-mcp", "backend-mcp", "custom-mcp", "my-mcp",
}
MAX_LENGTH = 64  # Unified App Manifest v1.29 の agentConnectors[].id
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SKIP_DIRS = {"node_modules", ".git", "dist", "bin", "obj", ".venv", "__pycache__"}


@dataclass(frozen=True)
class Connector:
    plugin: str
    plugin_id: str
    connector_id: str
    path: str

    @property
    def is_template(self) -> bool:
        return not self.plugin_id or "${" in self.plugin_id


def same_plugin(a: Connector, b: Connector) -> bool:
    """同じプラグインの別の置き場所（ソース・テンプレート・古い版）は衝突にしない。
    両方に実際の manifest id があれば id で、どちらかがプレースホルダー（ソースやテンプレート）なら名前で比べる。"""
    if not a.is_template and not b.is_template:
        return a.plugin_id == b.plugin_id
    return a.plugin == b.plugin


def load_connectors(path: Path) -> list[Connector]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return []
    if not isinstance(manifest, dict) or not manifest.get("agentConnectors"):
        return []
    name = (manifest.get("name") or {}).get("short") or path.parent.name
    plugin_id = str(manifest.get("id") or "")
    return [Connector(name, plugin_id, str(c.get("id") or ""), str(path)) for c in manifest["agentConnectors"] if isinstance(c, dict)]


def scan(dirs: list[Path]) -> list[Connector]:
    found: list[Connector] = []
    for root in dirs:
        if not root.is_dir():
            continue
        for current, subdirs, files in os.walk(root):
            subdirs[:] = [d for d in subdirs if d not in SKIP_DIRS]
            for f in files:
                if f == "manifest.json":
                    found += load_connectors(Path(current) / f)
    return found


def validate(target: list[Connector], others: list[Connector]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for c in target:
        cid = c.connector_id
        if not cid:
            errors.append("コネクタ ID が空です。")
            continue
        if cid in seen:
            errors.append(f"同じ manifest の中でコネクタ ID '{cid}' が重複しています。")
        seen.add(cid)
        if cid.lower() in GENERIC_IDS:
            errors.append(
                f"コネクタ ID '{cid}' は汎用的すぎます。同じ ID のプラグインとは同時に有効にできません"
                f"（Cowork の「コネクタの競合」）。'<プラグイン名>-{cid}' のようにプラグイン固有にしてください。"
            )
        if len(cid) > MAX_LENGTH:
            errors.append(f"コネクタ ID '{cid}' が {MAX_LENGTH} 文字を超えています。")
        if not ID_PATTERN.match(cid):
            errors.append(f"コネクタ ID '{cid}' は英小文字・数字・ハイフンの kebab-case にしてください。")
        clashes = sorted({f"{o.plugin}（{o.path}）" for o in others if o.connector_id == cid and not same_plugin(o, c)})
        if clashes:
            errors.append(f"コネクタ ID '{cid}' はほかのプラグインでも使われています: " + " / ".join(clashes))
    return errors


def scan_dirs_from_env() -> list[Path]:
    raw = os.environ.get("COWORK_PLUGIN_SCAN_DIRS", "")
    if not raw:
        env = Path.cwd() / ".env"
        if env.is_file():
            for line in env.read_text(encoding="utf-8-sig").splitlines():
                if line.strip().startswith("COWORK_PLUGIN_SCAN_DIRS="):
                    raw = line.split("=", 1)[1].strip().strip("'\"")
    return [Path(p.strip()) for p in re.split(r"[;,]", raw) if p.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True, type=Path, help="確かめる manifest.json")
    ap.add_argument("--scan", action="append", type=Path, default=[], help="ほかのプラグインの manifest を探すフォルダ（複数可）")
    args = ap.parse_args()

    target = load_connectors(args.manifest)
    if not target:
        raise SystemExit(f"agentConnectors がありません: {args.manifest}")
    dirs = args.scan or scan_dirs_from_env()
    target_file = args.manifest.resolve()
    others = [c for c in scan(dirs) if Path(c.path).resolve() != target_file]

    print(f"対象: {target[0].plugin}（{args.manifest}）")
    for c in target:
        print(f"  コネクタ ID: {c.connector_id}")
    if dirs:
        ids = sorted({o.connector_id for o in others})
        print(f"突き合わせ: {len(others)} 個のコネクタ（{', '.join(str(d) for d in dirs)}）/ ID {len(ids)} 種類: {', '.join(ids) or 'なし'}")
    else:
        print("突き合わせ: なし（--scan または COWORK_PLUGIN_SCAN_DIRS で、ほかのプラグインの置き場所を指定すると衝突も確かめる）")

    errors = validate(target, others)
    for e in errors:
        print(f"  ✖ {e}")
    if errors:
        sys.exit(1)
    print("✅ コネクタ ID はプラグイン固有で、見つかったほかのプラグインと重なっていません")


if __name__ == "__main__":
    main()
