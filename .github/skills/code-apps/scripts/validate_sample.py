"""samples/ 配下の Code Apps サンプルが、そのままビルド・デプロイできる完全性を保っているか検証する。

使い方:
  python validate_sample.py                       # samples/ 配下すべて
  python validate_sample.py samples/geek-store    # 個別

検証項目はいずれも「宣言と実体の整合」で、実行にネットワーク・認証を必要としない。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

REQUIRED_FILES = [
    "package.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "plugins/plugin-power-apps.ts",
    "src/main.tsx",
    "src/index.css",
    "src/config.ts",
    "src/router.tsx",
    "src/pages/_layout.tsx",
]

# 実 GUID / 実環境 URL / メールアドレスが混入していないこと
# メールは @odata.bind 等の OData 注釈とプレースホルダー用ドメインを除外する
SECRET_PATTERNS = [
    (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I), "GUID"),
    (re.compile(r"https://[\w-]+\.crm\d*\.dynamics\.com", re.I), "Dataverse URL"),
    (
        re.compile(
            r"[\w.+-]+@(?!odata\b)(?!example\.)(?!contoso\.)[\w-]+\.[a-z]{2,}\b",
            re.I,
        ),
        "メールアドレス",
    ),
]
SECRET_SCAN_SUFFIXES = {".ts", ".tsx", ".json", ".md", ".html", ".env", ".example"}
SECRET_SCAN_EXCLUDE_DIRS = {"node_modules", "dist", ".power", "generated"}

# @microsoft/power-apps v1.2 でルートエクスポートと旧 DataClient API が廃止されたため、
# 使っているとビルドが通らない
SDK_PATTERNS = [
    (
        re.compile(r"""from ['"]@microsoft/power-apps['"]"""),
        "SDK のルート import（サブパス /app /data を使う）",
    ),
    (
        re.compile(r"\.(getRecords|createRecord|updateRecord|deleteRecord)\s*\("),
        "廃止された DataClient API（*Async 系または生成 MicrosoftDataverseService を使う）",
    ),
]


def check(sample: Path) -> list[str]:
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        if not (sample / rel).exists():
            errors.append(f"必須ファイルがありません: {rel}")

    pkg_path = sample / "package.json"
    if pkg_path.is_file():
        scripts = json.loads(pkg_path.read_text(encoding="utf-8")).get("scripts", {})
        predeploy = scripts.get("predeploy", "")
        if predeploy and not (sample / "scripts/pre-deploy-check.mjs").exists():
            errors.append(
                "package.json が predeploy を宣言しているのに scripts/pre-deploy-check.mjs がありません"
                "（npm run predeploy が MODULE_NOT_FOUND で失敗します）"
            )

    index_css = sample / "src/index.css"
    if index_css.is_file():
        for m in re.finditer(r"""@import\s+["']([^"']+)["']""", index_css.read_text(encoding="utf-8")):
            target = (index_css.parent / m.group(1)).resolve()
            if not target.exists():
                errors.append(f"src/index.css が import するファイルがありません: {m.group(1)}")

    if (sample / "src/components/ui").is_dir() and not (sample / "components.json").is_file():
        errors.append("src/components/ui があるのに components.json がありません（shadcn の追加ができません）")

    for html in sample.glob("*.html"):
        for m in re.finditer(r"""["'](/[\w.-]+\.(?:svg|png|ico|jpg))["']""", html.read_text(encoding="utf-8")):
            if not (sample / "public" / m.group(1).lstrip("/")).exists():
                errors.append(f"{html.name} が参照する静的アセットがありません: public{m.group(1)}")

    errors.extend(scan_secrets(sample))
    errors.extend(scan_sdk_usage(sample))
    return errors


def scan_sdk_usage(sample: Path) -> list[str]:
    found: list[str] = []
    for path in sample.rglob("*"):
        if not path.is_file() or path.suffix not in {".ts", ".tsx"}:
            continue
        rel = path.relative_to(sample)
        if SECRET_SCAN_EXCLUDE_DIRS & set(rel.parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern, label in SDK_PATTERNS:
            m = pattern.search(text)
            if m:
                found.append(f"{label}: {rel} → {m.group(0)}")
    return found


def scan_secrets(sample: Path) -> list[str]:
    found: list[str] = []
    for path in sample.rglob("*"):
        if not path.is_file() or path.suffix not in SECRET_SCAN_SUFFIXES:
            continue
        if SECRET_SCAN_EXCLUDE_DIRS & set(path.relative_to(sample).parts):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern, label in SECRET_PATTERNS:
            m = pattern.search(text)
            if m:
                found.append(f"秘匿情報の可能性（{label}）: {path.relative_to(sample)} → {m.group(0)}")
    return found


def main() -> int:
    base = Path(__file__).resolve().parent.parent / "samples"
    targets = [Path(a).resolve() for a in sys.argv[1:]] or sorted(p for p in base.iterdir() if p.is_dir())

    failed = 0
    for sample in targets:
        errors = check(sample)
        if errors:
            failed += 1
            print(f"\n❌ {sample.name}")
            for e in errors:
                print(f"   • {e}")
        else:
            print(f"✅ {sample.name}")

    print(f"\n{len(targets) - failed}/{len(targets)} サンプルが OK")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
