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
    (
        re.compile(r"\bresult\.value\b"),
        "旧 IOperationResult.value（SDK 1.2.7 では result.data を使う）",
    ),
    (
        re.compile(r"\.retrieveMultipleRecordsAsync\s*\([^,]+,\s*`?\?\$"),
        "文字列形式の retrieveMultipleRecordsAsync options（IOperationOptions オブジェクトを使う）",
    ),
    (
        re.compile(r"\.retrieveRecordAsync\s*\([^,]+,\s*[^,]+,\s*`?\?\$"),
        "文字列形式の retrieveRecordAsync options（IOperationOptions オブジェクトを使う）",
    ),
    (
        re.compile(r"\.executeAsync\s*\(\s*[\"']"),
        "旧 executeAsync(name, params) 形式（IDataOperation オブジェクトを使う）",
    ),
    (
        re.compile(r'''from\s+["']\.power/'''),
        "無効な .power import（呼び出し元からの相対パスを使う）",
    ),
]

# SDK の破壊的変更の影響範囲を押さえるため、SDK に直接触れてよいのは
# サービス層と初期化 provider だけに限定する（UI 層への漏出を検出する）
SDK_SURFACE_DIRS = ("src/lib", "src/services", "src/providers")

TEMPLATE_PACKAGE = Path(__file__).resolve().parent.parent / "templates" / "generic-base" / "package.json"
TEMPLATE_PACKAGE_JSON = json.loads(TEMPLATE_PACKAGE.read_text(encoding="utf-8"))
POWER_APPS_SDK_VERSION = TEMPLATE_PACKAGE_JSON["dependencies"]["@microsoft/power-apps"]
POWER_APPS_CLI_VERSION = TEMPLATE_PACKAGE_JSON["devDependencies"]["@microsoft/power-apps-cli"]
TEMPLATE_SNAPSHOT_PACKAGE = Path(__file__).resolve().parent.parent / "references" / "template-snapshot" / "package.json"

# CRUD ラッパーは templates/dataverse-client.ts を正とし、各サンプルはそのコピーにする
CANONICAL_CLIENT = Path(__file__).resolve().parent.parent / "templates" / "dataverse-client.ts"
CLIENT_REL = "src/lib/dataverse-client.ts"


def check(sample: Path) -> list[str]:
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        if not (sample / rel).exists():
            errors.append(f"必須ファイルがありません: {rel}")

    pkg_path = sample / "package.json"
    if pkg_path.is_file():
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        deploy = pkg.get("scripts", {}).get("deploy")
        if deploy != "npm run build && npm run predeploy && npx power-apps push":
            errors.append(
                "package.json の scripts.deploy は "
                "'npm run build && npm run predeploy && npx power-apps push' に統一してください"
            )
        sdk_version = pkg.get("dependencies", {}).get("@microsoft/power-apps")
        if sdk_version != POWER_APPS_SDK_VERSION:
            errors.append(
                "package.json の dependencies に "
                f"'@microsoft/power-apps': '{POWER_APPS_SDK_VERSION}' を指定してください"
            )
        cli_version = pkg.get("devDependencies", {}).get("@microsoft/power-apps-cli")
        if cli_version != POWER_APPS_CLI_VERSION:
            errors.append(
                "package.json の devDependencies に "
                f"'@microsoft/power-apps-cli': '{POWER_APPS_CLI_VERSION}' を指定してください"
            )
        for name, body in pkg.get("scripts", {}).items():
            for m in re.finditer(r"\bnode\s+([\w./-]+\.(?:mjs|cjs|js))", body):
                if not (sample / m.group(1)).exists():
                    errors.append(
                        f"package.json の scripts.{name} が実在しないファイルを実行しています: {m.group(1)}"
                        "（npm run 実行時に MODULE_NOT_FOUND になります）"
                    )

    readme_path = sample / "README.md"
    if readme_path.is_file():
        readme = readme_path.read_text(encoding="utf-8")
        legacy = re.search(r"\bpac code (?:init|push|add-data-source)\b", readme)
        if legacy:
            errors.append(f"README.md に廃止予定の標準コマンドが残っています: {legacy.group(0)}")
        setup_commands = [
            r"^npm install --no-audit --no-fund\s*$",
            r"^npx power-apps auth-status\s*$",
            r"^npx power-apps init --environment-id",
            r"^npx power-apps add-data-source",
        ]
        matches = [re.search(command, readme, re.MULTILINE) for command in setup_commands]
        positions = [match.start() if match else -1 for match in matches]
        if any(position < 0 for position in positions) or positions != sorted(positions):
            errors.append(
                "README.md のセットアップは npm install → auth-status → init → add-data-source の順にしてください"
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
    errors.extend(check_dataverse_client(sample))
    return errors


def check_dataverse_client(sample: Path) -> list[str]:
    target = sample / CLIENT_REL
    if not target.is_file() or not CANONICAL_CLIENT.is_file():
        return []
    if target.read_bytes() == CANONICAL_CLIENT.read_bytes():
        return []
    return [
        f"{CLIENT_REL} が templates/dataverse-client.ts と一致しません"
        "（python sync_dataverse_client.py で反映してください）"
    ]


def check_template_snapshot() -> list[str]:
    if not TEMPLATE_SNAPSHOT_PACKAGE.is_file():
        return [f"テンプレートキャッシュがありません: {TEMPLATE_SNAPSHOT_PACKAGE}"]
    pkg = json.loads(TEMPLATE_SNAPSHOT_PACKAGE.read_text(encoding="utf-8"))
    errors: list[str] = []
    if pkg.get("dependencies", {}).get("@microsoft/power-apps") != POWER_APPS_SDK_VERSION:
        errors.append(f"template-snapshot の SDK を {POWER_APPS_SDK_VERSION} に同期してください")
    if pkg.get("devDependencies", {}).get("@microsoft/power-apps-cli") != POWER_APPS_CLI_VERSION:
        errors.append(f"template-snapshot の CLI を {POWER_APPS_CLI_VERSION} に同期してください")
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
        posix = rel.as_posix()
        if "@microsoft/power-apps" in text and not posix.startswith(SDK_SURFACE_DIRS):
            found.append(
                f"SDK を UI 層から直接 import しています: {rel}"
                f"（{' / '.join(SDK_SURFACE_DIRS)} のいずれかに隠してください）"
            )
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

    snapshot_errors = check_template_snapshot()
    if snapshot_errors:
        print("\n❌ template-snapshot")
        for error in snapshot_errors:
            print(f"   • {error}")

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
    return 1 if failed or snapshot_errors else 0


if __name__ == "__main__":
    sys.exit(main())
