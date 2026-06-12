"""
Code Apps デザインテンプレートを styles/index.pcss に適用するユーティリティ。
references/design-templates.md を単一ソースとしてパースするため、
テンプレートの追加・色変更は design-templates.md の編集だけで反映される。

使い方:
  python apply_design_template.py --list                    # テンプレート一覧を表示
  python apply_design_template.py 2 --project C:\\MyApp     # テンプレート 2 を適用
  python apply_design_template.py 2 --project C:\\MyApp --dry-run  # 変更内容のみ表示

前提:
  - 対象プロジェクトが CodeAppsStarter 構成（styles/index.pcss）または
    src/index.css に :root / .dark の CSS Variables を持つこと

動作:
  - :root / .dark ブロック内の変数値のみ書き換える（ブロック外は触らない）
  - --badge-* は意味色（ステータスの記号性）のため、テンプレートに含まれていても適用しない
  - @theme inline ブロックは変更しない
  - テンプレートにあるがブロック内に存在しない変数は、ブロック末尾に追記して報告する
"""
import argparse
import re
import sys
from pathlib import Path

# Windows コンソール（cp932）での日本語出力の文字化け対策
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TEMPLATES_MD = Path(__file__).resolve().parent.parent / "references" / "design-templates.md"

# プロジェクトルートからの探索順
TARGET_CANDIDATES = ["styles/index.pcss", "src/index.css"]


def parse_templates(md_text):
    """design-templates.md から {番号: {name, radius, light, dark}} を抽出する。"""
    templates = {}
    # 「## テンプレート定義」以降のみを対象にする（提案フォーマット例の表を誤読しない）
    _, _, body = md_text.partition("## テンプレート定義")
    if not body:
        raise SystemExit(f"テンプレート定義セクションが見つかりません: {TEMPLATES_MD}")

    sections = re.split(r"^### (\d+)\. (.+)$", body, flags=re.M)
    # re.split の結果: [前文, 番号, 名前, 本文, 番号, 名前, 本文, ...]
    for i in range(1, len(sections), 3):
        number = int(sections[i])
        name = re.sub(r"（.*?）", "", sections[i + 1]).strip()
        section = sections[i + 2]

        radius_m = re.search(r"\*\*--radius\*\*:\s*`([^`]+)`", section)
        css_blocks = re.findall(r"```css\n(.*?)```", section, flags=re.S)
        if not radius_m or len(css_blocks) < 2:
            raise SystemExit(
                f"テンプレート {number} ({name}) のパースに失敗しました。"
                " --radius と Light/Dark の css ブロック 2 つが必要です。"
            )

        templates[number] = {
            "name": name,
            "radius": radius_m.group(1),
            "light": parse_css_vars(css_blocks[0]),
            "dark": parse_css_vars(css_blocks[1]),
        }
    return templates


def parse_css_vars(css_text):
    """css ブロックから {変数名: 値} を抽出する。--badge-* は除外する。"""
    pairs = re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", css_text)
    return {name: value.strip() for name, value in pairs if not name.startswith("--badge-")}


def find_block(text, header_pattern):
    """header_pattern（例: r'^:root\\s*\\{'）にマッチするブロックの (開始, 終了) を返す。

    開始はブロック本文の先頭（{ の直後）、終了は対応する } の位置。
    CSS 変数定義に { } は現れない前提で、ネストのみブレースカウントで処理する。
    """
    m = re.search(header_pattern, text, flags=re.M)
    if not m:
        return None
    depth = 1
    pos = m.end()
    while pos < len(text) and depth > 0:
        if text[pos] == "{":
            depth += 1
        elif text[pos] == "}":
            depth -= 1
        pos += 1
    return m.end(), pos - 1


def apply_vars(block_text, vars_to_apply):
    """ブロック本文の変数値を書き換える。(新本文, 置換した変数, 見つからなかった変数) を返す。"""
    replaced, missing = [], []
    for name, value in vars_to_apply.items():
        pattern = re.compile(re.escape(name) + r"(\s*:\s*)[^;]+;")
        new_text, count = pattern.subn(lambda m: name + m.group(1) + value + ";", block_text, count=1)
        if count:
            if new_text != block_text:
                replaced.append(name)
            block_text = new_text
        else:
            missing.append(name)
    if missing:
        # ブロック末尾（} の直前）にインデント付きで追記
        addition = "".join(f"  {name}: {vars_to_apply[name]};\n" for name in missing)
        block_text = block_text.rstrip() + "\n\n  /* apply_design_template.py により追加 */\n" + addition
    return block_text, replaced, missing


def apply_template(css_text, template):
    """:root / .dark の両ブロックにテンプレートを適用した CSS 全文と適用レポートを返す。"""
    report = {}
    light_vars = dict(template["light"], **{"--radius": template["radius"]})
    for mode, header, vars_to_apply in [
        ("light", r"^:root\s*\{", light_vars),
        ("dark", r"^\.dark\s*\{", template["dark"]),
    ]:
        span = find_block(css_text, header)
        if span is None:
            raise SystemExit(f"{header} ブロックが見つかりません。対象ファイルを確認してください。")
        start, end = span
        new_block, replaced, missing = apply_vars(css_text[start:end], vars_to_apply)
        css_text = css_text[:start] + new_block + css_text[end:]
        report[mode] = {"replaced": replaced, "appended": missing}
    return css_text, report


def find_target(project_root):
    for candidate in TARGET_CANDIDATES:
        path = project_root / candidate
        if path.is_file():
            return path
    raise SystemExit(
        f"対象 CSS が見つかりません: {project_root} 配下に "
        + " / ".join(TARGET_CANDIDATES) + " のいずれかが必要です。"
    )


def main():
    parser = argparse.ArgumentParser(description="Code Apps デザインテンプレート適用")
    parser.add_argument("template", nargs="?", type=int, help="テンプレート番号")
    parser.add_argument("--project", type=Path, help="対象プロジェクトのルート")
    parser.add_argument("--list", action="store_true", help="テンプレート一覧を表示")
    parser.add_argument("--dry-run", action="store_true", help="ファイルを書き換えず変更内容のみ表示")
    args = parser.parse_args()

    templates = parse_templates(TEMPLATES_MD.read_text(encoding="utf-8"))

    if args.list or args.template is None:
        print("利用可能なデザインテンプレート:")
        for number, t in sorted(templates.items()):
            print(f"  {number}. {t['name']}  (--radius: {t['radius']}, 変数 light {len(t['light'])} / dark {len(t['dark'])})")
        if args.template is None and not args.list:
            parser.error("テンプレート番号を指定してください（一覧は --list）")
        return

    if args.template not in templates:
        raise SystemExit(f"テンプレート {args.template} は存在しません。--list で確認してください。")
    if not args.project:
        parser.error("--project で対象プロジェクトのルートを指定してください")

    template = templates[args.template]
    target = find_target(args.project.resolve())
    original = target.read_text(encoding="utf-8")
    updated, report = apply_template(original, template)

    print(f"テンプレート {args.template}. {template['name']} → {target}")
    for mode, r in report.items():
        line = f"  [{mode}] 置換 {len(r['replaced'])} 変数"
        if r["appended"]:
            line += f", 追記 {len(r['appended'])} 変数: " + ", ".join(r["appended"])
        print(line)

    if updated == original:
        print("変更はありません（既に適用済み）。")
        return
    if args.dry_run:
        print("--dry-run のため書き込みはスキップしました。")
        return
    target.write_text(updated, encoding="utf-8")
    print("適用しました。ライト/ダーク両モードで文字コントラストを目視確認してください。")


if __name__ == "__main__":
    main()
