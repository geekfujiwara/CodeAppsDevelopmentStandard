"""スキルの `templates/` から作業ツリーを生成する汎用スキャフォルダー。

どのスキルでも同じ形でテンプレートを配れるようにするための共通実装。
スキル固有のスクリプトを書かずに済む範囲は、すべてここで吸収する。

テンプレートの置き方:

    <skill>/templates/<template-name>/
      scaffold.json        # 任意。変数の宣言・ブロック別ファイル・次の手順
      __PKG__/…            # パス名の __VAR__ も置換される
      src/app.ts           # 本文の ${VAR} が置換される

`scaffold.json`（すべて任意キー）:

    {
      "description": "Foundry Autopilot のオーバーレイ",
      "extends": "../generic-base",
      "variables": ["AGENT_NAME", "AGENT_NAMESPACE"],
      "optionalVariables": ["IMAGE_MODEL_DEPLOYMENT"],
      "derivedVariables": ["PKG"],
      "blockFiles": {"B17": ["image_tools.py"]},
      "nextSteps": ["python scripts/provision_image_model.py --execute"]
    }

`variables` / `optionalVariables` は `.env` から取る値、`derivedVariables` は
呼び出し側が組み立てて `--var` で渡す値（パッケージ名など）。
`extends` はベース テンプレートへの相対パス。ベースを先に展開し、同じパスのファイルは
継承側で上書きする（宣言・ブロックは合算、`nextSteps` は継承側を優先）。

生成先に `.git` / `.github` / `.vscode` / `.env` しか無い場合は空とみなす
（スキルを取得した作業ルートへ直接生成できるようにするため）。

値は `--env`（既定 `.env`）と `--var K=V` から解決する。`--var` が優先。
プロセスの環境変数は、マニフェストで宣言された名前だけ見る。

置換されずに残った `${UPPER_SNAKE}` は**エラーで停止する**。
未解決のまま書き出すと、動かない理由がテンプレート由来だと分からなくなる。

使い方:
    python scaffold_from_template.py --template <dir> --target <dir> [--dry-run]
    python scaffold_from_template.py --template <dir> --target <dir> --blocks B1,B17 --force
    python scaffold_from_template.py --template <dir> --list-variables

終了コード: 0 = 成功、2 = 入力エラー、3 = 未解決の変数が残った。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

MANIFEST_NAME = "scaffold.json"
# 置換対象は UPPER_SNAKE だけに絞る。TypeScript のテンプレートリテラル `${count}` を
# 変数と誤認すると、テンプレートに JS/TS を置けなくなる。
TOKEN_RE = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}")
PATH_TOKEN_RE = re.compile(r"__([A-Z][A-Z0-9_]*)__")
BLOCK_RE = re.compile(r"SCAFFOLD:BLOCK:([A-Z][A-Z0-9]*):(START|END)")
BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".pdf", ".woff", ".woff2"}
SKIP_NAMES = {MANIFEST_NAME, ".DS_Store"}
SKIP_DIRS = {"__pycache__", "node_modules", ".git"}
TARGET_METADATA_NAMES = {".git", ".github", ".vscode", ".env", ".DS_Store"}


class ScaffoldError(Exception):
    pass


@dataclass
class Manifest:
    description: str = ""
    extends: str = ""
    variables: list[str] = field(default_factory=list)
    optional_variables: list[str] = field(default_factory=list)
    derived_variables: list[str] = field(default_factory=list)
    preserve_undeclared_variables: bool = False
    block_files: dict[str, list[str]] = field(default_factory=dict)
    next_steps: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, template: Path) -> "Manifest":
        path = template / MANIFEST_NAME
        if not path.is_file():
            return cls()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ScaffoldError(f"{path} を解析できません: {error}") from error
        return cls(
            description=str(raw.get("description", "")),
            extends=str(raw.get("extends", "")),
            variables=[str(v) for v in raw.get("variables", [])],
            optional_variables=[str(v) for v in raw.get("optionalVariables", [])],
            derived_variables=[str(v) for v in raw.get("derivedVariables", [])],
            preserve_undeclared_variables=bool(raw.get("preserveUndeclaredVariables", False)),
            block_files={str(k): [str(f) for f in v] for k, v in (raw.get("blockFiles") or {}).items()},
            next_steps=[str(s) for s in raw.get("nextSteps", [])],
        )

    def declared(self) -> set[str]:
        return set(self.variables) | set(self.optional_variables) | set(self.derived_variables)

    def file_to_block(self) -> dict[str, str]:
        return {name: block for block, names in self.block_files.items() for name in names}

    @classmethod
    def merge(cls, chain: list[Path]) -> "Manifest":
        """ベース → 継承側の順で宣言を合算する。"""
        merged = cls()
        for template in chain:
            current = cls.load(template)
            merged.description = current.description or merged.description
            merged.variables += [v for v in current.variables if v not in merged.variables]
            merged.optional_variables += [v for v in current.optional_variables if v not in merged.optional_variables]
            merged.derived_variables += [v for v in current.derived_variables if v not in merged.derived_variables]
            merged.preserve_undeclared_variables |= current.preserve_undeclared_variables
            for block, names in current.block_files.items():
                merged.block_files.setdefault(block, []).extend(names)
            if current.next_steps:
                merged.next_steps = current.next_steps
        return merged


def resolve_chain(template: Path) -> list[Path]:
    """`extends` をたどり、ベースから順に並べたテンプレート列を返す。"""
    chain: list[Path] = []
    current = template.resolve()
    while True:
        if current in chain:
            raise ScaffoldError(f"extends が循環しています: {current}")
        chain.append(current)
        parent = Manifest.load(current).extends
        if not parent:
            return list(reversed(chain))
        current = (current / parent).resolve()
        if not current.is_dir():
            raise ScaffoldError(f"extends のベース テンプレートが見つかりません: {current}")


def layered_files(chain: list[Path]) -> list[tuple[Path, Path]]:
    """(ソース, テンプレート内の相対パス)。後ろのテンプレートが同じパスを上書きする。"""
    files: dict[Path, Path] = {}
    for template in chain:
        for path in iter_template_files(template):
            files[path.relative_to(template)] = path
    return [(source, relative) for relative, source in sorted(files.items())]


def is_effectively_empty(target: Path) -> bool:
    return not target.exists() or all(entry.name in TARGET_METADATA_NAMES for entry in target.iterdir())


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def parse_vars(pairs: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            raise ScaffoldError(f"--var は KEY=VALUE の形で指定してください: {pair}")
        key, value = pair.split("=", 1)
        values[key.strip()] = value
    return values


def resolve_variables(manifest: Manifest, env_path: Path, overrides: dict[str, str]) -> dict[str, str]:
    """値の出どころは `.env` と `--var`。プロセスの環境変数は宣言済みの名前だけ見る。

    `os.environ` を丸ごと流し込むと、`${PATH}` のような偶然の一致で
    開発マシンの値が黙って埋め込まれる。
    """
    values = load_env(env_path)
    for name in manifest.declared():
        if name not in values and os.environ.get(name):
            values[name] = os.environ[name]
    values.update(overrides)
    return values


def strip_blocks(content: str, selected: set[str]) -> str:
    """`SCAFFOLD:BLOCK:<ID>:START` .. `:END` のうち、選ばれていないブロックを落とす。"""
    if "SCAFFOLD:BLOCK:" not in content:
        return content
    kept: list[str] = []
    skipping = 0
    for line in content.splitlines(keepends=True):
        match = BLOCK_RE.search(line)
        if match:
            block, kind = match.group(1), match.group(2)
            if kind == "START":
                if skipping or block not in selected:
                    skipping += 1
            elif skipping:
                skipping -= 1
            continue
        if not skipping:
            kept.append(line)
    return "".join(kept)


def substitute(text: str, variables: dict[str, str]) -> str:
    return TOKEN_RE.sub(lambda m: variables.get(m.group(1), m.group(0)), text)


def render_path(relative: Path, variables: dict[str, str]) -> Path:
    parts = [
        PATH_TOKEN_RE.sub(lambda m: variables.get(m.group(1), m.group(0)), part)
        for part in relative.parts
    ]
    return Path(*parts)


def iter_template_files(template: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(template.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(template)
        if any(part in SKIP_DIRS for part in relative.parts) or path.name in SKIP_NAMES:
            continue
        files.append(path)
    return files


def template_variables(template: Path) -> set[str]:
    """テンプレートが実際に使っている変数名（本文とパス名の両方）。"""
    found: set[str] = set()
    for path, relative in layered_files(resolve_chain(template)):
        found.update(PATH_TOKEN_RE.findall(str(relative)))
        if path.suffix.lower() in BINARY_SUFFIXES:
            continue
        try:
            found.update(TOKEN_RE.findall(path.read_text(encoding="utf-8")))
        except (UnicodeDecodeError, OSError):
            continue
    return found


@dataclass
class Plan:
    writes: list[tuple[Path, Path]] = field(default_factory=list)
    skipped_blocks: list[Path] = field(default_factory=list)
    unresolved: dict[str, list[str]] = field(default_factory=dict)


def build_plan(template: Path, target: Path, variables: dict[str, str], blocks: set[str]) -> Plan:
    chain = resolve_chain(template)
    manifest = Manifest.merge(chain)
    gate = manifest.file_to_block()
    plan = Plan()

    for path, relative in layered_files(chain):
        required = gate.get(path.name)
        if required and required not in blocks:
            plan.skipped_blocks.append(relative)
            continue
        destination_relative = render_path(relative, variables)
        plan.writes.append((path, target / destination_relative))

        # パスの __VAR__ は常に scaffold 専用。本文は TypeScript の `${CONSTANT}` と
        # 共存できるよう、明示 opt-in 時だけ未宣言トークンを実行時コードとして保持する。
        missing = set(PATH_TOKEN_RE.findall(str(destination_relative)))
        if path.suffix.lower() not in BINARY_SUFFIXES:
            rendered = substitute(strip_blocks(path.read_text(encoding="utf-8"), blocks), variables)
            content_missing = set(TOKEN_RE.findall(rendered))
            if manifest.preserve_undeclared_variables:
                content_missing &= manifest.declared()
            missing |= content_missing
        if missing:
            plan.unresolved[str(relative)] = sorted(missing)
    return plan


def write_plan(template: Path, target: Path, variables: dict[str, str], blocks: set[str], plan: Plan) -> None:
    for source, destination in plan.writes:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix.lower() in BINARY_SUFFIXES:
            shutil.copyfile(source, destination)
            continue
        rendered = substitute(strip_blocks(source.read_text(encoding="utf-8"), blocks), variables)
        destination.write_text(rendered, encoding="utf-8", newline="\n")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--template", required=True, help="テンプレート ディレクトリ")
    parser.add_argument("--target", help="生成先（--list-variables のときは不要）")
    parser.add_argument("--env", default=".env", help="変数を読む .env（既定: .env）")
    parser.add_argument("--var", action="append", default=[], help="KEY=VALUE。.env より優先（複数可）")
    parser.add_argument("--blocks", default="", help="有効にする機能ブロック（カンマ区切り）")
    parser.add_argument("--force", action="store_true", help="空でない生成先へ重ねる")
    parser.add_argument("--dry-run", action="store_true", help="書き込まずに計画だけ出す")
    parser.add_argument("--list-variables", action="store_true", help="テンプレートが使う変数を一覧する")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    template = Path(args.template)
    if not template.is_dir():
        print(f"ERROR: テンプレートが見つかりません: {template}", file=sys.stderr)
        return 2

    try:
        manifest = Manifest.merge(resolve_chain(template))
        used = template_variables(template)
        if args.list_variables:
            declared = manifest.declared()
            for name in sorted(used | declared):
                marks = []
                if name in manifest.optional_variables:
                    marks.append("optional")
                if name in manifest.derived_variables:
                    marks.append("derived")
                if name not in used:
                    marks.append("declared but unused")
                if name not in declared and declared:
                    marks.append("used but undeclared")
                suffix = f"  ({', '.join(marks)})" if marks else ""
                print(f"{name}{suffix}")
            return 0

        if not args.target:
            print("ERROR: --target を指定してください", file=sys.stderr)
            return 2
        target = Path(args.target)
        if not is_effectively_empty(target) and not args.force:
            print(f"ERROR: 生成先が空ではありません: {target}（意図的に重ねるなら --force）", file=sys.stderr)
            return 2

        variables = resolve_variables(manifest, Path(args.env), parse_vars(args.var))
        blocks = {b.strip().upper() for b in args.blocks.split(",") if b.strip()}
        plan = build_plan(template, target, variables, blocks)
    except ScaffoldError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if plan.unresolved:
        print("ERROR: 置換されなかった変数が残っています。.env か --var に足してください:", file=sys.stderr)
        for relative, names in sorted(plan.unresolved.items()):
            print(f"  {relative}: {', '.join(names)}", file=sys.stderr)
        return 3

    if args.dry_run:
        print(f"[dry-run] {len(plan.writes)} ファイルを {target} へ書き込みます")
        for _source, destination in plan.writes:
            print(f"  + {destination}")
    else:
        write_plan(template, target, variables, blocks, plan)
        print(f"OK: {len(plan.writes)} ファイルを {target} へ生成しました")

    for relative in plan.skipped_blocks:
        print(f"  - {relative}（選ばれていないブロックのため生成しません）")
    if manifest.next_steps:
        print("Next:")
        for index, step in enumerate(manifest.next_steps, 1):
            print(f"  {index}. {step}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
