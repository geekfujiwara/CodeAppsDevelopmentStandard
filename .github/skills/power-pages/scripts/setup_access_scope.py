"""Power Pages のアクセススコープ（Self / Account）に応じたテーブル権限を冪等構成する。

SKILL.md Step 3（Self）/ Step 4（Account）/ Step 8（検証）で使用する。

作成するもの:
  - powerpagecomponent type=18（テーブル権限）: content JSON ＋ 自己参照 N:N association
  - powerpagecomponent type=9（サイト設定）: Webapi/{table}/enabled, Webapi/{table}/fields
  - Web ロール（type=11）: ACCESS_SCOPE_WEBROLE_NAME が既存に無い場合のみ作成
  - 反映のためのサイト再起動

恒久的な事前チェック（正常系の実行でも毎回動作する）:
  1. assert_scope_value()        : scope が既知の値域か（誤った整数・文字列混入を検出）
  2. assert_account_readonly()   : account 権限に write/create/delete を付けていないか
                                   （取引先企業は「参照のみ」が本スキルのセキュリティ要件）
  3. verify_relationship()       : accountrelationship / contactrelationship が
                                   メタデータ上実在するスキーマ名か（表示名・列名の指定ミスを検出）
  4. assert_serializable()       : content が JSON シリアライズ可能か（送信直前）
  5. resolve_site_language_id()  : powerpagesitelanguageid が解決できるか（null だと 404）

使い方:
  python setup_access_scope.py --list-relationships
  python setup_access_scope.py --scope self
  python setup_access_scope.py --scope account
  python setup_access_scope.py --scope account --verify-only

パラメータは references/.env.example を参照（実値は .env）。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# --- auth_helper（standard スキル）を import パスに追加 ---
_SCRIPT_DIR = Path(__file__).resolve().parent
_CANDIDATES = [
    _SCRIPT_DIR.parent.parent / "standard" / "scripts",  # .github/skills/standard/scripts
    *[p / ".github" / "skills" / "standard" / "scripts" for p in _SCRIPT_DIR.parents],
    *[p / "scripts" for p in _SCRIPT_DIR.parents],
    *_SCRIPT_DIR.parents,
]
for _c in _CANDIDATES:
    if (_c / "auth_helper.py").is_file():
        sys.path.insert(0, str(_c))
        break
else:  # noqa: PLW0120
    sys.exit("auth_helper.py が見つかりません（standard スキルの scripts フォルダを確認）")

for _p in _SCRIPT_DIR.parents:
    if (_p / ".env").is_file():
        load_dotenv(_p / ".env")
        break

from auth_helper import api_get, api_patch, api_post, get_session  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

# --- mspp_scope の値域（API で確認済み） ---
SCOPE_GLOBAL = 756150000
SCOPE_CONTACT = 756150001
SCOPE_ACCOUNT = 756150002
SCOPE_PARENT = 756150003
SCOPE_SELF = 756150004
VALID_SCOPES = {SCOPE_GLOBAL, SCOPE_CONTACT, SCOPE_ACCOUNT, SCOPE_PARENT, SCOPE_SELF}
SCOPE_NAMES = {
    SCOPE_GLOBAL: "Global",
    SCOPE_CONTACT: "Contact",
    SCOPE_ACCOUNT: "Account",
    SCOPE_PARENT: "Parent",
    SCOPE_SELF: "Self",
}

TYPE_SITE_SETTING = 9
TYPE_WEBROLE = 11
TYPE_TABLE_PERMISSION = 18

ENV_ID = os.environ.get("ENV_ID", "")
PP_SUBDOMAIN = os.environ.get("PP_SUBDOMAIN", "")
PAGES_WEBSITE_ID = os.environ.get("PAGES_WEBSITE_ID", "")
WEBROLE_NAME = os.environ.get("ACCESS_SCOPE_WEBROLE_NAME", "").strip() or "Authenticated Users"
ACCOUNT_FIELDS = os.environ.get("ACCOUNT_WEBAPI_FIELDS", "*")
CHILD_FIELDS = os.environ.get("ACCESS_SCOPE_CHILD_WEBAPI_FIELDS", "*")
ALLOW_DELETE = os.environ.get("ACCESS_SCOPE_ALLOW_DELETE", "false").lower() == "true"


# ---------- 事前チェック（恒久対策） ----------


def assert_scope_value(scope: object) -> int:
    """scope が既知の値域の整数であることを保証する。

    文字列の "756150001" や誤った値を content に書くとランタイムが権限を無視するため、
    送信前に必ず検出する。
    """
    if not isinstance(scope, int) or isinstance(scope, bool) or scope not in VALID_SCOPES:
        sys.exit(f"ERROR: 不正な scope 値です: {scope!r}（許可: {sorted(VALID_SCOPES)}）")
    return scope


def assert_account_readonly(content: dict) -> None:
    """account テーブル権限が「参照のみ」であることを保証する。

    取引先企業はサインインユーザーが編集・削除できてはならない（本スキルのセキュリティ要件）。
    appendto は子レコードの Lookup バインドに必要なため許可する（編集権限ではない）。
    """
    if content.get("entitylogicalname") != "account":
        return
    for priv in ("write", "create", "delete"):
        if content.get(priv):
            sys.exit(
                f"ERROR: account 権限に {priv}=true が指定されています。"
                "取引先企業は参照のみ（read + appendto）にしてください"
            )


def assert_serializable(content: dict) -> str:
    """content が JSON シリアライズ可能であることを送信直前に検証する。"""
    try:
        return json.dumps(content)
    except TypeError as exc:
        sys.exit(f"ERROR: content に JSON 化できない値が含まれています: {exc}")


def fetch_relationships(parent_logical: str) -> dict[str, str]:
    """親テーブルの 1:N リレーション（スキーマ名 → 参照元テーブル論理名）を取得する。"""
    data = api_get(
        f"EntityDefinitions(LogicalName='{parent_logical}')/OneToManyRelationships"
        f"?$select=SchemaName,ReferencingEntity"
    )
    return {r["SchemaName"]: r["ReferencingEntity"] for r in data.get("value", [])}


def verify_relationship(parent_logical: str, schema_name: str, child_logical: str) -> None:
    """リレーションスキーマ名が実在し、参照元が想定の子テーブルであることを検証する。

    表示名や Lookup 列名を指定してしまう定番ミスを、権限作成前に検出する。
    """
    rels = fetch_relationships(parent_logical)
    if schema_name not in rels:
        candidates = [s for s, e in rels.items() if e == child_logical]
        hint = f"  候補: {', '.join(candidates)}" if candidates else ""
        sys.exit(
            f"ERROR: リレーション '{schema_name}' が {parent_logical} に存在しません。\n"
            f"       スキーマ名（表示名でも Lookup 列名でもない）を指定してください。{hint}"
        )
    if rels[schema_name] != child_logical:
        sys.exit(
            f"ERROR: '{schema_name}' の参照元は '{rels[schema_name]}' であり "
            f"'{child_logical}' ではありません"
        )
    print(f"    リレーション検証 OK: {schema_name} → {child_logical}")


# ---------- サイト・ロールの解決 ----------


def resolve_site_id() -> str:
    sites = api_get(
        "powerpagesites?$top=1&$orderby=createdon desc&$select=powerpagesiteid,name"
    ).get("value", [])
    if not sites:
        sys.exit("ERROR: powerpagesites にレコードが見つかりません")
    print(f"  site: {sites[0]['name']} ({sites[0]['powerpagesiteid']})")
    return sites[0]["powerpagesiteid"]


def resolve_adx_website_id() -> str:
    sites = api_get(
        "adx_websites?$top=1&$orderby=createdon desc&$select=adx_websiteid,adx_name"
    ).get("value", [])
    if not sites:
        sys.exit("ERROR: adx_websites にレコードが見つかりません")
    return sites[0]["adx_websiteid"]


def resolve_site_language_id(site_id: str) -> str:
    """powerpagesitelanguageid を解決する。null のままだとランタイムが権限を無視して 404 になる。"""
    langs = api_get(
        f"powerpagesitelanguages?$filter=_powerpagesiteid_value eq {site_id}"
        f"&$select=powerpagesitelanguageid&$top=1"
    ).get("value", [])
    if not langs:
        sys.exit("ERROR: powerpagesitelanguages が見つかりません（サイトの言語設定を確認）")
    return langs[0]["powerpagesitelanguageid"]


def find_component(site_id: str, ctype: int, exact_name: str) -> dict | None:
    data = api_get(
        f"powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq {ctype}"
        f"&$select=powerpagecomponentid,name,content&$top=500"
    )
    for c in data.get("value", []):
        if (c.get("name") or "") == exact_name:
            return c
    return None


def create_component(site_id: str, lang_id: str, ctype: int, name: str, content: dict) -> str:
    body = {
        "powerpagecomponenttype": ctype,
        "name": name,
        "content": assert_serializable(content),
        "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
        "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",
    }
    cid = api_post("powerpagecomponents", body)
    print(f"  CREATED type={ctype}: {name} ({cid})")
    return cid or ""


def resolve_webrole_id(site_id: str, lang_id: str, adx_website_id: str) -> str:
    """Web ロールを取得する。ACCESS_SCOPE_WEBROLE_NAME が未作成なら作成する。"""
    data = api_get(
        f"powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq {TYPE_WEBROLE}"
        f"&$select=powerpagecomponentid,name&$top=200"
    )
    roles = data.get("value", [])
    target = WEBROLE_NAME.lower()
    for role in roles:
        name = (role.get("name") or "").lower()
        if name == target or (target.startswith("authenticated") and "authenticated" in name):
            print(f"  webrole: {role.get('name')} ({role['powerpagecomponentid']})")
            return role["powerpagecomponentid"]
    if target.startswith("authenticated"):
        sys.exit("ERROR: Authenticated Users Web ロールが見つかりません（サイトの初期化を確認）")
    role_id = create_component(
        site_id, lang_id, TYPE_WEBROLE, WEBROLE_NAME,
        {"authenticatedusersrole": False, "anonymoususersrole": False, "websiteid": adx_website_id},
    )
    print(f"  NOTE: 専用ロール '{WEBROLE_NAME}' を作成しました。"
          "対象 contact への割り当ては別途必要です")
    return role_id


# ---------- 権限・サイト設定 ----------


def build_content(
    adx_website_id: str, logical: str, name: str, scope: int, relationship_field: str | None,
    relationship: str | None, role_id: str, *,
    read: bool, write: bool, create: bool, delete: bool, append: bool, appendto: bool,
) -> dict:
    content = {
        "filecontent": None,
        "entitylogicalname": logical,
        "entityname": name,
        "scope": assert_scope_value(scope),
        "read": read, "write": write, "create": create, "delete": delete,
        "append": append, "appendto": appendto,
        "websiteid": adx_website_id,
        "adx_entitypermission_webrole": [role_id],
        "parentrelationship": None,
        "parententitypermission": None,
        "contactrelationship": None,
        "accountrelationship": None,
        "childTablePermissions": [],
        "permissionfetchxml": None,
    }
    if relationship_field:
        content[relationship_field] = relationship
    assert_account_readonly(content)
    return content


def ensure_association(perm_id: str, role_id: str) -> bool:
    """権限(type=18) → Web ロール(type=11) の N:N association を冪等作成する。

    これがランタイム正本。content JSON の配列だけでは 403 (90040120) になる。
    """
    data = api_get(
        f"powerpagecomponents({perm_id})?$select=powerpagecomponentid"
        f"&$expand=powerpagecomponent_powerpagecomponent($select=powerpagecomponentid)"
    )
    linked = {a["powerpagecomponentid"]
              for a in data.get("powerpagecomponent_powerpagecomponent", [])}
    if role_id in linked:
        print("    ASSOC OK: N:N association は既に存在")
        return True
    api_post(
        f"powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref",
        {"@odata.id": f"{os.environ['DATAVERSE_URL'].rstrip('/')}"
                      f"/api/data/v9.2/powerpagecomponents({role_id})"},
    )
    print("    ASSOC CREATED: N:N association を作成（ランタイム正本）")
    return True


def upsert_permission(site_id: str, lang_id: str, name: str, content: dict, role_id: str) -> None:
    existing = find_component(site_id, TYPE_TABLE_PERMISSION, name)
    if existing:
        perm_id = existing["powerpagecomponentid"]
        current = json.loads(existing.get("content") or "{}")
        current.update({k: v for k, v in content.items()
                        if k != "adx_entitypermission_webrole"})
        roles = current.get("adx_entitypermission_webrole") or []
        if role_id not in roles:
            roles.append(role_id)
        current["adx_entitypermission_webrole"] = roles
        assert_account_readonly(current)
        api_patch(f"powerpagecomponents({perm_id})",
                  {"content": assert_serializable(current)})
        print(f"  UPDATED: {name}")
    else:
        perm_id = create_component(site_id, lang_id, TYPE_TABLE_PERMISSION, name, content)
    ensure_association(perm_id, role_id)


def upsert_site_setting(site_id: str, lang_id: str, adx_website_id: str,
                        key: str, value: str) -> None:
    existing = find_component(site_id, TYPE_SITE_SETTING, key)
    content = {"value": value, "websiteid": adx_website_id}
    if existing:
        api_patch(f"powerpagecomponents({existing['powerpagecomponentid']})",
                  {"content": assert_serializable(content)})
        print(f"  UPDATED: {key} = {value}")
    else:
        create_component(site_id, lang_id, TYPE_SITE_SETTING, key, content)


def enable_webapi(site_id: str, lang_id: str, adx_website_id: str,
                  logical: str, fields: str) -> None:
    upsert_site_setting(site_id, lang_id, adx_website_id, f"Webapi/{logical}/enabled", "true")
    upsert_site_setting(site_id, lang_id, adx_website_id, f"Webapi/{logical}/fields", fields)


# ---------- 検証・再起動 ----------


def parse_table_pairs(raw: str, env_name: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for item in [x.strip() for x in raw.split(",") if x.strip()]:
        if ":" not in item:
            sys.exit(f"ERROR: {env_name} の書式が不正です: '{item}'"
                     "（'論理名:リレーションスキーマ名' で指定）")
        logical, relationship = item.split(":", 1)
        pairs.append((logical.strip(), relationship.strip()))
    return pairs


def verify(site_id: str, role_id: str, logicals: list[str]) -> int:
    """権限・association・Webapi 設定の欠落を検出する。欠落件数を返す。"""
    missing = 0
    data = api_get(
        f"powerpagecomponents?$filter=_powerpagesiteid_value eq {site_id} "
        f"and powerpagecomponenttype eq {TYPE_TABLE_PERMISSION}"
        f"&$select=powerpagecomponentid,name,content&$top=500"
    )
    perms = {}
    for c in data.get("value", []):
        content = json.loads(c.get("content") or "{}")
        perms.setdefault(content.get("entitylogicalname"), []).append((c, content))
    for logical in logicals:
        entries = perms.get(logical) or []
        if not entries:
            print(f"  NG: {logical} のテーブル権限がありません")
            missing += 1
            continue
        for comp, content in entries:
            scope = content.get("scope")
            print(f"  {logical}: scope={SCOPE_NAMES.get(scope, scope)} "
                  f"read={content.get('read')} write={content.get('write')} "
                  f"create={content.get('create')} appendto={content.get('appendto')}")
            expanded = api_get(
                f"powerpagecomponents({comp['powerpagecomponentid']})"
                f"?$select=powerpagecomponentid"
                f"&$expand=powerpagecomponent_powerpagecomponent($select=powerpagecomponentid)"
            )
            linked = {a["powerpagecomponentid"]
                      for a in expanded.get("powerpagecomponent_powerpagecomponent", [])}
            if role_id not in linked:
                print("    NG: Web ロールの N:N association がありません → 403 の原因")
                missing += 1
        if not find_component(site_id, TYPE_SITE_SETTING, f"Webapi/{logical}/enabled"):
            print(f"    NG: Webapi/{logical}/enabled がありません → 404 の原因")
            missing += 1
    return missing


def restart_site() -> None:
    if not ENV_ID or not (PAGES_WEBSITE_ID or PP_SUBDOMAIN):
        print("  SKIP restart: ENV_ID / PAGES_WEBSITE_ID(または PP_SUBDOMAIN) 未設定")
        return
    session = get_session(scope="https://api.powerplatform.com/.default")
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    website_id = PAGES_WEBSITE_ID
    if not website_id:
        resp = session.get(f"{base}?api-version=2024-10-01")
        resp.raise_for_status()
        for site in resp.json().get("value", []):
            if site.get("subdomain", "") == PP_SUBDOMAIN:
                website_id = site["id"]
                break
    if not website_id:
        print(f"  WARNING: 再起動対象サイトが見つかりません（PP_SUBDOMAIN='{PP_SUBDOMAIN}'）")
        return
    session.post(f"{base}/{website_id}/restart?api-version=2024-10-01").raise_for_status()
    print("  RESTARTED: 反映まで 60〜90 秒待つ")


# ---------- メイン ----------


def main() -> None:
    parser = argparse.ArgumentParser(description="Power Pages アクセススコープ構成")
    parser.add_argument("--scope", choices=["self", "account"],
                        default=os.environ.get("ACCESS_SCOPE", ""))
    parser.add_argument("--list-relationships", action="store_true",
                        help="account / contact の 1:N リレーションスキーマ名を一覧する")
    parser.add_argument("--verify-only", action="store_true",
                        help="作成せず、権限・association・Webapi 設定の整合だけを検証する")
    args = parser.parse_args()

    if args.list_relationships:
        for parent in ("account", "contact"):
            print(f"\n=== {parent} の 1:N リレーション ===")
            for schema, child in sorted(fetch_relationships(parent).items()):
                print(f"  {schema}  →  {child}")
        return

    if args.scope not in ("self", "account"):
        sys.exit("ERROR: --scope self|account を指定してください"
                 "（SKILL.md Step 1 の AskUserQuestion 結果を .env の ACCESS_SCOPE に記録）")

    print(f"=== アクセススコープ構成: {args.scope} ===\n")
    print("[1/5] サイト・ロールを解決...")
    site_id = resolve_site_id()
    adx_website_id = resolve_adx_website_id()
    lang_id = resolve_site_language_id(site_id)
    role_id = resolve_webrole_id(site_id, lang_id, adx_website_id)
    print()

    if args.scope == "account":
        parent_logical, rel_field = "account", "accountrelationship"
        pairs = parse_table_pairs(os.environ.get("ACCOUNT_CHILD_TABLES", ""),
                                  "ACCOUNT_CHILD_TABLES")
    else:
        parent_logical, rel_field = "contact", "contactrelationship"
        pairs = parse_table_pairs(os.environ.get("SELF_CHILD_TABLES", ""), "SELF_CHILD_TABLES")

    logicals = [parent_logical, *[p[0] for p in pairs]]

    if args.verify_only:
        print("[検証] 権限・association・Webapi 設定を確認...")
        missing = verify(site_id, role_id, logicals)
        print(f"\n欠落: {missing} 件")
        sys.exit(1 if missing else 0)

    print(f"[2/5] {parent_logical} 権限を作成/更新...")
    if args.scope == "account":
        # 取引先企業は「参照のみ」。appendto は子レコードの Lookup バインドに必要
        name = "Account - Account scope (read only)"
        content = build_content(
            adx_website_id, "account", name, SCOPE_ACCOUNT, None, None, role_id,
            read=True, write=False, create=False, delete=False, append=False, appendto=True,
        )
        upsert_permission(site_id, lang_id, name, content, role_id)
        enable_webapi(site_id, lang_id, adx_website_id, "account", ACCOUNT_FIELDS)
    else:
        name = "Contact - Self"
        content = build_content(
            adx_website_id, "contact", name, SCOPE_SELF, None, None, role_id,
            read=True, write=True, create=False, delete=False, append=False, appendto=True,
        )
        upsert_permission(site_id, lang_id, name, content, role_id)
        enable_webapi(site_id, lang_id, adx_website_id, "contact", "*")
    print()

    print("[3/5] 業務テーブル権限を作成/更新...")
    if not pairs:
        print("  WARNING: 対象テーブルが未設定です（.env の *_CHILD_TABLES を確認）")
    for logical, relationship in pairs:
        print(f"  --- {logical} ---")
        verify_relationship(parent_logical, relationship, logical)
        name = f"{logical} - {SCOPE_NAMES[SCOPE_ACCOUNT if args.scope == 'account' else SCOPE_CONTACT]} scope"
        content = build_content(
            adx_website_id, logical, name,
            SCOPE_ACCOUNT if args.scope == "account" else SCOPE_CONTACT,
            rel_field, relationship, role_id,
            read=True, write=True, create=True, delete=ALLOW_DELETE,
            append=True, appendto=True,
        )
        upsert_permission(site_id, lang_id, name, content, role_id)
        enable_webapi(site_id, lang_id, adx_website_id, logical, CHILD_FIELDS)
    print()

    print("[4/5] 構成を検証...")
    missing = verify(site_id, role_id, logicals)
    print()

    print("[5/5] サイトを再起動...")
    restart_site()

    if missing:
        sys.exit(f"\n未解決の欠落が {missing} 件あります。上のログを確認してください")
    print("\n完了! Account アクセスの場合は次の 2 点も確認すること:")
    print("  1. 対象ユーザーの contact.parentcustomerid に取引先企業が設定されている")
    print("  2. クライアントの POST 本文で account への Lookup を @odata.bind している")


if __name__ == "__main__":
    main()
