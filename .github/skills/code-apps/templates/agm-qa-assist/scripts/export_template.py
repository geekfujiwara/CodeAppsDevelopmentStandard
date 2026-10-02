"""このプロジェクトから、開発標準の scaffold テンプレート（code-apps/templates/agm-qa-assist）を書き出す。

- generic-base と同じファイルは書き出さない（テンプレートは generic-base を extends する）
- 環境に固有の値（プレフィックス・リソース名・テナント等）は ${VAR} に置き換える。置き換え表は .env の実値から作る
- 秘密・生成物・検証用の一時ファイルは書き出さない

使い方: python scripts/export_template.py [--out .github/skills/code-apps/templates/agm-qa-assist] [--check]
  --check: 書き出したテンプレートに実値が残っていないかだけ確認する
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / ".github/skills/code-apps/templates/generic-base"
DEFAULT_OUT = ROOT / ".github/skills/code-apps/templates/agm-qa-assist"

INCLUDE = [
    ".gitignore", ".env.example", "eslint.config.js", "package.json", "index.html", "vite.config.ts",
    "src", "styles", "public", "tests", "data/demo",
    "scripts/setup_dataverse.py", "scripts/setup_security_roles.py", "scripts/configure_azure.py", "scripts/export_template.py",
    "scripts/test",
    "spec/requirements.md", "spec/design.md", "spec/test-plan.md", "spec/architecture.md", "spec/security.md", "spec/eval/stt-compare.json",
    "azure/speech-token-broker",
]
SKIP_DIRS = {"node_modules", "dist", "generated", "__pycache__", ".vite"}
SKIP_FILES = {"package-lock.json", "local.settings.json", ".env"}
TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".py", ".ps1", ".css", ".pcss", ".html", ".txt", ".yml", ".yaml", ""}

# 実値 → 変数。値は .env から（無いものは使わない）
VARIABLE_KEYS = [
    "AZURE_SUBSCRIPTION_ID", "TENANT_ID", "ENV_ID", "SOLUTION_ID", "DATAVERSE_URL", "VITE_DATAVERSE_URL", "VITE_AGM_SP_SITE_URL",
    "FUNCTION_APP_NAME", "AOAI_RESOURCE_NAME", "SPEECH_RESOURCE_NAME", "MAI_SPEECH_RESOURCE_NAME", "AZURE_RESOURCE_GROUP", "API_AUDIENCE", "SOLUTION_NAME",
]
# 人名・テスト用ユーザーなど（.env に無い固有名）
LITERALS = {
    "閲覧者（テスト用の幹部ユーザー）": "閲覧者（テスト用の幹部ユーザー）",
    "閲覧者（テスト用の幹部ユーザー）": "閲覧者（テスト用の幹部ユーザー）",
    "構築者": "構築者",
}


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def replacements(env: dict[str, str]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for key in VARIABLE_KEYS:
        value = env.get(key, "").strip()
        if len(value) >= 6:
            pairs.append((value.rstrip("/"), "${%s}" % ("DATAVERSE_URL" if key == "VITE_DATAVERSE_URL" else key).rstrip("/")))
    env_id = env.get("ENV_ID", "")
    if env_id:
        hex_id = env_id.replace("-", "").lower()
        pairs.append((f"{hex_id[:-2]}.{hex_id[-2:]}", "<環境 ID の 16 進>"))
    tenant_host = re.search(r"https://([a-z0-9-]+)\.sharepoint\.com", env.get("VITE_AGM_SP_SITE_URL", ""))
    if tenant_host:
        pairs.append((tenant_host.group(1), "<tenant>"))
    prefix = env.get("PUBLISHER_PREFIX", "")
    if prefix:
        pairs.append((f"{prefix}_", "${PUBLISHER_PREFIX}_"))
        pairs.append((f'"{prefix}"', '"${PUBLISHER_PREFIX}"'))
    pairs += list(LITERALS.items())
    # 長い値から置き換える（部分一致で短い値が先に崩さないように）
    return sorted(pairs, key=lambda p: -len(p[0]))


def norm(data: bytes) -> bytes:
    return data.replace(b"\r\n", b"\n")


def iter_files() -> list[Path]:
    out: list[Path] = []
    for item in INCLUDE:
        path = ROOT / item
        if path.is_file():
            out.append(path)
        elif path.is_dir():
            for dirpath, dirs, files in os.walk(path):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                out += [Path(dirpath, f) for f in files if f not in SKIP_FILES]
    return out


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    env = load_env()
    pairs = replacements(env)
    # ソリューション名は既定値としてテンプレートに書いてよい（秘密ではない）
    secrets = [v for v, _ in pairs if not v.startswith("${") and v != env.get("SOLUTION_NAME")]

    if args.check:
        hits = []
        for path in args.out.rglob("*"):
            if path.is_file() and path.suffix in TEXT_SUFFIXES:
                text = path.read_text(encoding="utf-8", errors="ignore")
                hits += [f"{path.relative_to(args.out)}: {s}" for s in secrets if s in text]
        print("\n".join(hits) or "✅ 実値は残っていません")
        return 1 if hits else 0

    if args.out.exists():
        # scaffold.json・README.md・spec/environment.md はテンプレート側で管理する（書き出しで消さない）
        keep = {"scaffold.json", "README.md", "spec/environment.md"}
        for child in sorted(args.out.rglob("*"), key=lambda p: -len(p.parts)):
            rel = child.relative_to(args.out).as_posix()
            if rel in keep or any(k.startswith(rel + "/") for k in keep):
                continue
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    written = skipped = 0
    for path in iter_files():
        rel = path.relative_to(ROOT)
        data = path.read_bytes()
        base = BASE / rel
        if base.is_file() and norm(base.read_bytes()) == norm(data):
            skipped += 1
            continue
        dest = args.out / rel
        if rel.as_posix() == "azure/speech-token-broker/local.settings.sample.json":
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix in TEXT_SUFFIXES:
            text = norm(data).decode("utf-8")
            for old, new in pairs:
                text = text.replace(old, new)
            dest.write_text(text, encoding="utf-8", newline="\n")
        else:
            shutil.copyfile(path, dest)
        written += 1
    # Function の手元設定は秘密を含みうるため、サンプルだけを置く
    sample = args.out / "azure/speech-token-broker/local.settings.sample.json"
    sample.write_text('{\n  "IsEncrypted": false,\n  "Values": {\n    "FUNCTIONS_WORKER_RUNTIME": "node",\n    "AzureWebJobsStorage": "UseDevelopmentStorage=true"\n  }\n}\n', encoding="utf-8")
    print(f"OK: {written} ファイルを書き出しました（generic-base と同じ {skipped} ファイルは省略）→ {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
