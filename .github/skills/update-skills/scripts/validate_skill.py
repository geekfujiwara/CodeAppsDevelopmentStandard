"""スキル構成と秘匿情報を検証する汎用バリデーター。

検証項目:
  1. SKILL.md が存在し、frontmatter の name がフォルダ名と一致する（kebab-case）。
  2. frontmatter に description / category / triggers がある。
  3. Step 見出し（## / ### Step N）が整数で連番になっている（飛び・重複なし）。
  4. references/ と scripts/ の有無（無ければ警告）。
  5. 秘匿情報スキャン（実 GUID / *.crm*.dynamics.com / 実メール / クライアントシークレット様）。
  6. 役割分離（警告）: SKILL.md（正常系）に異常系（よくあるエラー/トラブル/デバッグ等）の
     実体（エラー対処表・references 誘導なしの長文）が直書きされていないか。
  7. 集約ファイル登録（警告）: README カタログ・agents/*.agent.md への登録漏れ。
  8. .env.example カバレッジ（警告）: scripts が環境変数を使うのに references/.env.example が無い。
  9. 内部リンク実在（警告）: SKILL.md/references の Markdown リンク先が実在するか（stale ref）。
 10. 番号連番・frontmatter lint（警告）: ## 番号（N. / フェーズ N）連番、description 過長・
     trigger 過多・本文肥大（トークン概算で Anthropic 上限 5,000 語 ≈ 6,500 トークン超）。

依存なし（標準ライブラリのみ）。どのリポジトリでも動く。

使い方:
  python validate_skill.py <skill-dir>      # 単一スキルを検証
  python validate_skill.py --all            # SKILLS_DIR 配下を一括検証
  python validate_skill.py --all --skills-dir .github/skills

終了コード: 問題（error）が1件以上なら 1、それ以外は 0。warning は 0 のまま。
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

# Windows の既定コンソール（cp932 等）でも絵文字・日本語を出力できるようにする
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

# 出力先が UTF-8 でない場合は ASCII マーカーにフォールバックする
_UTF8_OUT = (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf")
MARK_NG = "\u274c" if _UTF8_OUT else "[NG]"
MARK_WARN = "\u26a0\ufe0f " if _UTF8_OUT else "[WARN]"
MARK_OK = "\u2705" if _UTF8_OUT else "[OK]"

# --- 設定（環境変数 .env で上書き可能） ---------------------------------------

DEFAULT_SKILLS_DIR = ".github/skills"

# 誤検出を避けるための許可リスト（公式の well-known なシステム GUID 等）
ALLOWLIST = {
    "00000007-0000-0000-c000-000000000000",  # Dynamics CRM first-party app
    "00000003-0000-0000-c000-000000000000",  # Microsoft Graph
    "00000002-0000-0000-c000-000000000000",  # Azure AD Graph
    "a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a",  # Dynamics CRM mcp.tools 委任スコープ ID（固定）
    "ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b",  # Enterprise Token Store アプリ ID（固定）
    "6ab48b67-cd74-4ad4-81af-5932984589be",  # Cowork/Token Store 関連の well-known ID（固定）
    "96ff4394-9197-43aa-b393-6a41652e21f8",  # Power Virtual Agents Service 第一者アプリ ID（固定）
    "edfdb190-3791-45d8-9a6c-8f90a37c278a",  # AI Builder GPT Dynamic Prompt テンプレート ID（全環境固定）
    "00000000-0000-0000-0000-000000000000",  # 空 GUID（既定値プレースホルダー）
    "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",   # プレースホルダー
    "11111111-2222-3333-4444-555555555555",  # 汎用プレースホルダー（例示用）
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",   # 汎用プレースホルダー（例示用）
    "00000001-0000-0000-0001-00000000009b",  # Dataverse Default Solution（全環境固定）
    "953b9fac-1e5e-e611-80d6-00155ded156f",  # システムデフォルト WebResource（標準アイコン・全環境固定）
    "4273edbd-ac1d-40d3-9fb2-095c621b552d",  # 標準フォームコントロール CLASSID（全環境固定）
}

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FM_NAME_RE = re.compile(r"^name:\s*(.+?)\s*$", re.MULTILINE)
FM_KEY_RE = lambda k: re.compile(rf"^{k}:\s*", re.MULTILINE)
STEP_RE = re.compile(r"^#{2,3}\s+Step\s+(\d+)\b", re.MULTILINE)

# 役割分離チェック: SKILL.md（正常系）に異常系の実体が残っていないか。
# 見出しテキストが「異常系」を示し、かつその節がポインタ（references/ へのリンク）でなく
# 実体（複数行の表・長い本文）を含む場合に WARN を出す。
HEADING_RE = re.compile(r"^(#{2,6})\s+(.*\S)\s*$", re.MULTILINE)
ABNORMAL_HEADING_RE = re.compile(
    r"(トラブル|よくある(エラー|失敗|ミス|間違)|エラー(コード|早見|一覧|集)"
    r"|既知の(問題|不具合|バグ)|落とし穴|デバッグ|不具合|失敗例|ハマりどころ"
    r"|詰まりどころ|troubleshoot)",
    re.IGNORECASE,
)

GUID_RE = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
CRM_URL_RE = re.compile(r"https://[a-z0-9-]+\.crm[0-9]*\.dynamics\.com", re.IGNORECASE)
SECRET_RE = re.compile(r"\b[0-9A-Za-z]{2,3}~[0-9A-Za-z._~-]{30,}\b")  # client secret 様
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
EMAIL_ALLOW = ("example.com", "example.org", "contoso.com", "noreply.github.com")
# メールではない `@` トークン（OData バインド注釈・XML 名前空間等）の誤検出を除外する
# 例: parentbotid@odata.bind / value@odata.type / @microsoft.foo
NON_EMAIL_RE = re.compile(r"@(odata|microsoft|xmlns)\.", re.IGNORECASE)
# プレースホルダー的な組織名（<org> / {org} / yourorg）は許容
CRM_PLACEHOLDER = re.compile(r"https://(<org>|\{org\}|yourorg|\{[^}]+\})\.crm", re.IGNORECASE)


def load_env(start: Path) -> None:
    """リポジトリルートの .env を環境変数へ読み込む（既存値は上書きしない）。"""
    for parent in [start, *start.parents]:
        envf = parent / ".env"
        if envf.is_file():
            for line in envf.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
            return


class Report:
    def __init__(self, skill: str):
        self.skill = skill
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    def print(self) -> None:
        status = MARK_NG if self.errors else (MARK_WARN if self.warnings else MARK_OK)
        print(f"{status} {self.skill}")
        for e in self.errors:
            print(f"   ERROR: {e}")
        for w in self.warnings:
            print(f"   WARN : {w}")


def scan_secrets(path: Path, rep: Report) -> None:
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return
    rel = path.name
    for i, line in enumerate(lines, 1):
        for g in GUID_RE.findall(line):
            if g.lower() not in ALLOWLIST:
                rep.err(f"{rel}:{i}: 実 GUID らしき値 {g}（プレースホルダーに置換）")
        if CRM_URL_RE.search(line) and not CRM_PLACEHOLDER.search(line):
            rep.err(f"{rel}:{i}: 実 Dataverse URL らしき値（<org> 等に置換）: {line.strip()[:80]}")
        if SECRET_RE.search(line):
            rep.err(f"{rel}:{i}: クライアントシークレット様の文字列を検出")
        for em in EMAIL_RE.findall(line):
            if NON_EMAIL_RE.search(em):
                continue
            if not any(em.lower().endswith(a) for a in EMAIL_ALLOW):
                rep.warn(f"{rel}:{i}: 実メールアドレスらしき値 {em}（admin@example.com 等に置換）")


def check_role_separation(text: str, rep: Report) -> None:
    """SKILL.md に異常系の実体が残っていないか（正常系=SKILL.md / 異常系=references）を検査。

    異常系を示す見出しの節が「ポインタ（references/ への誘導）」ではなく、複数行の表や
    長い本文を直書きしている場合に WARN を出す。ヒューリスティックのため WARN 止まり。
    """
    headings = [(m.start(), len(m.group(1)), m.group(2)) for m in HEADING_RE.finditer(text)]
    for idx, (pos, level, title) in enumerate(headings):
        if not ABNORMAL_HEADING_RE.search(title):
            continue
        # 本文 = この見出しの次行から、同レベル以上の次見出しまで
        end = len(text)
        for npos, nlevel, _ in headings[idx + 1:]:
            if nlevel <= level:
                end = npos
                break
        body = text[pos:end].splitlines()[1:]
        non_empty = [l for l in body if l.strip()]
        table_lines = [l for l in body if l.lstrip().startswith("|")]
        links_ref = any("references/" in l for l in body)
        # エラー表（ヘッダに 症状/原因/対処/解決/エラーコード 等を含む）は明確な異常系。
        header = "".join(table_lines[:1])
        error_table = bool(re.search(r"症状|原因|対処|解決|エラーコード|現象|回避策", header))
        line_no = text[:pos].count("\n") + 1
        if error_table:
            rep.warn(
                f"SKILL.md:{line_no}: 異常系の見出し『{title}』にエラー対処表を直書き。"
                f"references/troubleshooting.md へ分離を検討"
            )
        elif not links_ref and (len(table_lines) >= 2 or len(non_empty) >= 5):
            # references/ への誘導もなく実体（表/長文）を直書きしている。
            rep.warn(
                f"SKILL.md:{line_no}: 異常系の見出し『{title}』が実体を直書きし"
                f" references/ へ誘導していない。troubleshooting.md へ分離を検討"
            )


def check_registration(skill_dir: Path, rep: Report) -> None:
    """スキルが README カタログと agents/*.agent.md の両方に登録されているか（追加漏れの定番）。"""
    name = skill_dir.name
    readme = skill_dir.parent / "README.md"
    if readme.is_file():
        if f"]({name}/SKILL.md)" not in readme.read_text(encoding="utf-8", errors="ignore"):
            rep.warn(f"README カタログ（{readme.name}）に未登録（1 行追加する）")
    agents_dir = skill_dir.parent.parent / "agents"
    if agents_dir.is_dir():
        agent_files = list(agents_dir.glob("*.agent.md"))
        registered = any(
            f"skills/{name}/SKILL.md" in af.read_text(encoding="utf-8", errors="ignore")
            for af in agent_files
        )
        if agent_files and not registered:
            rep.warn("agents/*.agent.md のスキル表に未登録（参照すべき agent があれば 1 行追加）")


def check_env_example(skill_dir: Path, rep: Report) -> None:
    """scripts が環境変数を使うのに references/.env.example が無いか。"""
    scripts = skill_dir / "scripts"
    if not scripts.is_dir():
        return
    uses_env = False
    for p in scripts.glob("*.py"):
        if re.search(r"os\.environ|getenv", p.read_text(encoding="utf-8", errors="ignore")):
            uses_env = True
            break
    if uses_env and not (skill_dir / "references" / ".env.example").is_file():
        rep.warn("scripts が環境変数を使うが references/.env.example が無い（パラメータを定義する）")


def check_internal_links(skill_dir: Path, rep: Report) -> None:
    """Markdown リンクが指す相対パス（references/scripts/別スキル）が実在するか（stale ref 検出）。"""
    link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    for md in [skill_dir / "SKILL.md", *sorted((skill_dir / "references").glob("*.md"))]:
        if not md.is_file():
            continue
        for i, line in enumerate(md.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            for target in link_re.findall(line):
                t = target.strip().split("#", 1)[0].split(" ", 1)[0]
                if not t or t.startswith(("http://", "https://", "mailto:")) or "://" in t:
                    continue
                # プレースホルダー（url / path 等の裸の語や {..}/<..>）は対象外
                if ("/" not in t and "." not in t) or "{" in t or "<" in t:
                    continue
                if (md.parent / t).exists():
                    continue
                rep.warn(f"{md.name}:{i}: リンク切れ（参照先が無い）: {target}")


def estimate_tokens(text: str) -> int:
    """依存なしのトークン概算。ASCII（英語/コード/記号）は約 4 文字/トークン、
    日本語等の非 ASCII は約 1 文字/トークンとみなす。やや過大評価寄りの保守的な目安。"""
    ascii_n = sum(1 for c in text if ord(c) < 128)
    other = len(text) - ascii_n
    return round(ascii_n / 4 + other)


def check_numbering_and_frontmatter(text: str, rep: Report) -> None:
    """## レベルの番号（N. / フェーズ N）連番、description 過長・trigger 過多・本文肥大。"""
    # ## レベルの番号連番（Step は別途 ERROR でチェック済みのため除外）
    nums = []
    for m in re.finditer(r"^##\s+(?:フェーズ|Phase)?\s*(\d+)[.\s　)]", text, re.MULTILINE):
        if re.match(r"^##\s+Step\b", m.group(0)):
            continue
        nums.append(int(m.group(1)))
    if nums:
        expected = list(range(nums[0], nums[0] + len(nums)))
        if nums != expected:
            rep.warn(f"## 見出しの番号が連番でない: {nums}（期待: {expected}）")

    # frontmatter（最初の --- ブロック）から description / triggers を取得
    fm = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if fm:
        block = fm.group(1)
        dm = re.search(r"^description:\s*(.+)$", block, re.MULTILINE)
        if dm and len(dm.group(1)) > 300:
            rep.warn(f"description が長い（{len(dm.group(1))}字）。要点に絞る（トリガー語を詰め込みすぎない）")
        trig = len(re.findall(r"^\s*-\s+", block, re.MULTILINE))
        if trig > 40:
            rep.warn(f"triggers が多い（{trig}個）。代表的な語に絞り込みを検討")
        body = text[fm.end():]
    else:
        body = text
    # Anthropic 推奨: SKILL.md 本文は 5,000 語（≈6,500 トークン）が絶対上限。
    # 文脈を消費するのはトークンなので、行数でなくトークン概算で判定する
    # （ASCII は約 4 文字/トークン、日本語等の非 ASCII は約 1 文字/トークン）。
    tokens = estimate_tokens(body)
    if tokens > 6500:
        body_lines = body.count("\n") + 1
        rep.warn(
            f"SKILL.md 本文が約 {tokens} トークン（{body_lines} 行）。Anthropic 上限"
            f" 5,000 語（≈6,500 トークン）超。references/ へ分割（progressive disclosure）を検討"
        )


def validate_skill(skill_dir: Path) -> Report:
    rep = Report(skill_dir.name)
    folder = skill_dir.name
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.is_file():
        rep.err("SKILL.md が存在しない")
        return rep

    text = skill_md.read_text(encoding="utf-8", errors="ignore")

    # frontmatter name 一致
    m = FM_NAME_RE.search(text)
    if not m:
        rep.err("frontmatter に name がない")
    else:
        name = m.group(1).strip().strip('"').strip("'")
        if not NAME_RE.match(name):
            rep.err(f"name '{name}' が kebab-case ではない")
        if name != folder:
            rep.err(f"name '{name}' がフォルダ名 '{folder}' と不一致")

    # 必須 frontmatter キー
    for key in ("description", "category", "triggers"):
        if not FM_KEY_RE(key).search(text):
            rep.err(f"frontmatter に {key} がない")

    # Step 整数連番
    steps = [int(x) for x in STEP_RE.findall(text)]
    if steps:
        if len(steps) != len(set(steps)):
            rep.err(f"Step 番号に重複がある: {steps}")
        expected = list(range(steps[0], steps[0] + len(steps)))
        if steps != expected:
            rep.err(f"Step 番号が整数連番でない: {steps}（期待: {expected}）")

    # 役割分離（正常系=SKILL.md / 異常系=references）
    check_role_separation(text, rep)
    # ## レベル番号の連番・frontmatter lint・本文肥大
    check_numbering_and_frontmatter(text, rep)
    # 集約ファイル（README カタログ / agents）への登録
    check_registration(skill_dir, rep)
    # scripts の環境変数に対する .env.example の有無
    check_env_example(skill_dir, rep)
    # Markdown リンク切れ（stale ref）
    check_internal_links(skill_dir, rep)

    # references / scripts の有無
    if not (skill_dir / "references").is_dir():
        rep.warn("references/ が無い（参考情報・異常系の置き場）")
    if not (skill_dir / "scripts").is_dir():
        rep.warn("scripts/ が無い（利用スクリプトの置き場）")

    # 秘匿情報スキャン（テキスト系ファイルのみ）
    exts = {".md", ".py", ".ps1", ".json", ".jsonc", ".ts", ".tsx", ".env", ".example"}
    for p in skill_dir.rglob("*"):
        if p.is_file() and (p.suffix in exts or p.name == ".env.example"):
            scan_secrets(p, rep)

    return rep


def main() -> int:
    ap = argparse.ArgumentParser(description="スキル構成と秘匿情報を検証する")
    ap.add_argument("skill", nargs="?", help="検証するスキルディレクトリ")
    ap.add_argument("--all", action="store_true", help="SKILLS_DIR 配下を一括検証")
    ap.add_argument("--skills-dir", help="スキルのルート（既定: .env の SKILLS_DIR または .github/skills）")
    args = ap.parse_args()

    here = Path.cwd()
    load_env(here)
    skills_dir = Path(args.skills_dir or os.environ.get("SKILLS_DIR", DEFAULT_SKILLS_DIR))

    targets: list[Path] = []
    if args.all:
        if not skills_dir.is_dir():
            print(f"SKILLS_DIR が見つからない: {skills_dir}", file=sys.stderr)
            return 2
        targets = [d for d in sorted(skills_dir.iterdir()) if (d / "SKILL.md").is_file()]
    elif args.skill:
        targets = [Path(args.skill)]
    else:
        ap.print_help()
        return 2

    had_error = False
    for t in targets:
        rep = validate_skill(t)
        rep.print()
        if rep.errors:
            had_error = True
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
