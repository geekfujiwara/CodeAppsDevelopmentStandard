"""
カスタムセキュリティロール デプロイスクリプト

Dataverse Web API を使用してカスタムセキュリティロールを作成し、
ソリューション内テーブルに対する権限を自動設定する。

★ Basic User ロールの権限をコピーして土台にし、
  カスタムテーブル権限を上乗せする方式。
★ ROLE_DEFINITIONS をプロジェクトに合わせて書き換えてください。

手順:
  1. .env で DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を設定
  2. setup_dataverse.py でテーブルを作成済みであること
  3. python .github/skills/dataverse/scripts/deploy_security_role.py

依存:
  - .github/skills/standard/scripts/auth_helper.py（共通認証）
  - .env（DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX）

API リファレンス:
  https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/role
  https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addprivilegesrole
  https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/replaceprivilegesrole
  https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/privilegedepth
"""

import os
import sys
import time

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "..", "standard", "scripts"))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

# ── 環境変数 ──────────────────────────────────────────────
DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "")
APP_MODULE_ID = os.environ.get("APP_MODULE_ID", "")

API = f"{DATAVERSE_URL}/api/data/v9.2"

# ── ロール定義テンプレート ────────────────────────────────
#
# ★ プロジェクトに合わせてカスタマイズしてください。
#
# table_privileges:
#   "*" → ソリューション内の全カスタムテーブルに適用（デフォルト）
#   "geek_Category" → 特定テーブルの上書き（SchemaName で指定）
#
# Depth 値: "Basic" | "Local" | "Deep" | "Global" | None（権限なし）
#
# Verb: Create, Read, Write, Delete, Append, AppendTo, Assign, Share
#
# extra_privileges:
#   テーブルに紐付かない特殊権限の名前リスト（オプション）

ROLE_DEFINITIONS = [
    {
        "name": "インシデント管理 管理者",
        "description": "インシデント管理アプリの全テーブルに対するフルアクセス権限",
        "table_privileges": {
            "*": {
                "Create": "Global",
                "Read": "Global",
                "Write": "Global",
                "Delete": "Global",
                "Append": "Global",
                "AppendTo": "Global",
                "Assign": "Global",
                "Share": "Global",
            },
        },
        "extra_privileges": [],
    },
    {
        "name": "インシデント管理 ユーザー",
        "description": "インシデント管理アプリの基本的な CRUD 権限",
        "table_privileges": {
            "*": {
                "Create": "Local",
                "Read": "Global",
                "Write": "Basic",
                "Delete": "Basic",
                "Append": "Local",
                "AppendTo": "Local",
                "Assign": "Basic",
                "Share": "Basic",
            },
            # マスタテーブルは読み取り専用
            f"{PREFIX}_IncidentCategory": {
                "Create": None,
                "Read": "Global",
                "Write": None,
                "Delete": None,
                "Append": None,
                "AppendTo": "Global",
                "Assign": None,
                "Share": None,
            },
            f"{PREFIX}_Priority": {
                "Create": None,
                "Read": "Global",
                "Write": None,
                "Delete": None,
                "Append": None,
                "AppendTo": "Global",
                "Assign": None,
                "Share": None,
            },
        },
        "extra_privileges": [],
    },
    {
        "name": "インシデント管理 閲覧者",
        "description": "インシデント管理アプリの読み取りのみ。編集・削除不可",
        "table_privileges": {
            "*": {
                "Create": None,
                "Read": "Global",
                "Write": None,
                "Delete": None,
                "Append": None,
                "AppendTo": None,
                "Assign": None,
                "Share": None,
            },
        },
        "extra_privileges": [],
    },
]

# テーブル操作の Verb 一覧
TABLE_VERBS = ["Create", "Read", "Write", "Delete", "Append", "AppendTo", "Assign", "Share"]


# ── 認証 ──────────────────────────────────────────────────

def get_headers(include_solution=True):
    token = _get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    if include_solution and SOLUTION_NAME:
        h["MSCRM.SolutionName"] = SOLUTION_NAME
    return h


# ── API ヘルパー ─────────────────────────────────────────

def api_get(path, params=None):
    r = requests.get(f"{API}/{path}", headers=get_headers(False), params=params)
    r.raise_for_status()
    return r.json()


def api_post(path, body, include_solution=True):
    r = requests.post(f"{API}/{path}", headers=get_headers(include_solution), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


def api_patch(path, body, include_solution=False):
    r = requests.patch(f"{API}/{path}", headers=get_headers(include_solution), json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


# ── Step 1: ルートビジネスユニット取得 ────────────────────

def get_root_business_unit():
    """ルートビジネスユニットの ID を取得する"""
    print("\n=== Step 1: ルートビジネスユニット取得 ===")

    bu = api_get("businessunits", {
        "$filter": "parentbusinessunitid eq null",
        "$select": "businessunitid,name",
    })

    if not bu.get("value"):
        raise RuntimeError("ルートビジネスユニットが見つかりません")

    root_bu = bu["value"][0]
    print(f"  ルート BU: {root_bu['name']} ({root_bu['businessunitid']})")
    return root_bu["businessunitid"]


# ── Step 2: ソリューション内テーブル一覧取得 ──────────────

def get_solution_tables():
    """ソリューション内のカスタムテーブルを取得する（SchemaName 含む）"""
    print("\n=== Step 2: ソリューション内テーブル一覧の取得 ===")

    # ソリューション ID を取得
    sols = api_get("solutions", {
        "$filter": f"uniquename eq '{SOLUTION_NAME}'",
        "$select": "solutionid",
    })
    if not sols.get("value"):
        raise RuntimeError(f"ソリューション '{SOLUTION_NAME}' が見つかりません")
    sol_id = sols["value"][0]["solutionid"]
    print(f"  ソリューション ID: {sol_id}")

    # ソリューション内のエンティティ コンポーネント（componenttype=1）を取得
    comps = api_get("solutioncomponents", {
        "$filter": f"_solutionid_value eq {sol_id} and componenttype eq 1",
        "$select": "objectid",
    })
    entity_ids = [c["objectid"] for c in comps.get("value", [])]
    print(f"  エンティティ コンポーネント数: {len(entity_ids)}")

    # 各エンティティの SchemaName を取得
    tables = []
    for eid in entity_ids:
        try:
            meta = api_get(f"EntityDefinitions({eid})", {
                "$select": "LogicalName,SchemaName,DisplayName,MetadataId,IsCustomEntity",
            })
            display = ""
            dn = meta.get("DisplayName", {})
            if dn and dn.get("LocalizedLabels"):
                for lbl in dn["LocalizedLabels"]:
                    if lbl.get("LanguageCode") == 1041:
                        display = lbl["Label"]
                        break
                if not display and dn["LocalizedLabels"]:
                    display = dn["LocalizedLabels"][0].get("Label", "")
            if not display:
                display = meta["LogicalName"]

            tables.append({
                "logical_name": meta["LogicalName"],
                "schema_name": meta["SchemaName"],
                "display_name": display,
                "metadata_id": meta["MetadataId"],
                "is_custom": meta.get("IsCustomEntity", False),
            })
            print(f"  テーブル: {meta['SchemaName']} ({display})")
        except requests.HTTPError as e:
            print(f"  ⚠️ エンティティ {eid} の取得失敗: {e}")

    return tables


# ── Step 3: 権限 ID の一括取得 ────────────────────────────

def get_table_privileges(tables):
    """各テーブルの CRUD + Append/AppendTo/Assign/Share 権限 ID を取得する"""
    print("\n=== Step 3: テーブル権限 ID の取得 ===")

    # SchemaName → {Verb → privilegeid} のマップ
    priv_map = {}

    for table in tables:
        schema = table["schema_name"]
        priv_map[schema] = {}

        # 権限名パターンで検索
        filter_parts = []
        for verb in TABLE_VERBS:
            filter_parts.append(f"name eq 'prv{verb}{schema}'")
        filter_str = " or ".join(filter_parts)

        try:
            privs = api_get("privileges", {
                "$filter": filter_str,
                "$select": "privilegeid,name",
            })
            for p in privs.get("value", []):
                # 権限名から Verb を抽出: prv{Verb}{SchemaName}
                name = p["name"]
                for verb in TABLE_VERBS:
                    if name == f"prv{verb}{schema}":
                        priv_map[schema][verb] = p["privilegeid"]
                        break

            found = len(priv_map[schema])
            print(f"  {schema}: {found}/{len(TABLE_VERBS)} 権限を検出")

            if found == 0:
                # フォールバック: LogicalName で再検索
                logical = table["logical_name"]
                filter_parts2 = [f"name eq 'prv{v}{logical}'" for v in TABLE_VERBS]
                privs2 = api_get("privileges", {
                    "$filter": " or ".join(filter_parts2),
                    "$select": "privilegeid,name",
                })
                for p in privs2.get("value", []):
                    name = p["name"]
                    for verb in TABLE_VERBS:
                        if name == f"prv{verb}{logical}":
                            priv_map[schema][verb] = p["privilegeid"]
                            break
                found2 = len(priv_map[schema])
                if found2 > 0:
                    print(f"    → LogicalName フォールバックで {found2} 権限を検出")

        except requests.HTTPError as e:
            print(f"  ⚠️ {schema} の権限取得失敗: {e}")

    return priv_map


# ── Step 3.5: Basic User ロールの権限を取得 ──────────────

def get_basic_user_privileges(root_bu_id):
    """Basic User ロール（旧 Common Data Service User）の全権限を取得する。
    新しいカスタムロールの土台として使用する。"""
    print("\n=== Step 3.5: Basic User ロールの権限取得 ===")

    # Basic User を検索（名前の揺れに対応）
    for role_name in ["Basic User", "Common Data Service User"]:
        roles = api_get("roles", {
            "$filter": f"name eq '{role_name}' and _businessunitid_value eq {root_bu_id}",
            "$select": "roleid,name",
        })
        if roles.get("value"):
            break

    if not roles.get("value"):
        print("  ⚠️ Basic User ロールが見つかりません。空の権限セットで続行します。")
        return []

    base_role = roles["value"][0]
    base_role_id = base_role["roleid"]
    print(f"  ベースロール: {base_role['name']} ({base_role_id})")

    # RetrieveRolePrivilegesRole で権限一覧を取得
    try:
        result = api_get(f"RetrieveRolePrivilegesRole(RoleId={base_role_id})")
        priv_list = result.get("RolePrivileges", [])
        print(f"  Basic User の権限数: {len(priv_list)}")
        return priv_list
    except requests.HTTPError as e:
        print(f"  ⚠️ RetrieveRolePrivilegesRole 失敗: {e}")
        # フォールバック: roleprivileges_association で取得
        print("  → roleprivileges_association で再試行...")
        try:
            privs = api_get(f"roles({base_role_id})/roleprivileges_association", {
                "$select": "privilegeid,name",
            })
            # roleprivileges_association は privilege エンティティを返す
            # Depth 情報がないので Local をデフォルトにする
            fallback_list = []
            for p in privs.get("value", []):
                fallback_list.append({
                    "PrivilegeId": p["privilegeid"],
                    "Depth": "Local",
                })
            print(f"  フォールバック権限数: {len(fallback_list)}")
            return fallback_list
        except requests.HTTPError as e2:
            print(f"  ⚠️ フォールバックも失敗: {e2}")
            return []


# ── Step 4: ロールのべき等作成 ────────────────────────────

def ensure_role(role_def, root_bu_id):
    """ロールをべき等に作成/更新する"""
    role_name = role_def["name"]
    print(f"\n--- ロール: {role_name} ---")

    # 既存検索（名前 + ルート BU で一意特定）
    existing = api_get("roles", {
        "$filter": f"name eq '{role_name}' and _businessunitid_value eq {root_bu_id}",
        "$select": "roleid,name,description",
    })

    body = {
        "name": role_name,
        "description": role_def.get("description", ""),
        "businessunitid@odata.bind": f"/businessunits({root_bu_id})",
    }

    if existing.get("value"):
        role_id = existing["value"][0]["roleid"]
        print(f"  既存ロールを更新: {role_id}")
        api_patch(f"roles({role_id})", {
            "name": role_name,
            "description": role_def.get("description", ""),
        })
    else:
        print(f"  ロール '{role_name}' を新規作成")
        resp = api_post("roles", body, include_solution=True)
        # OData-EntityId ヘッダーから ID を取得
        entity_id_header = resp.headers.get("OData-EntityId", "")
        if "(" in entity_id_header and ")" in entity_id_header:
            role_id = entity_id_header.split("(")[-1].rstrip(")")
        else:
            # 再検索
            refetch = api_get("roles", {
                "$filter": f"name eq '{role_name}' and _businessunitid_value eq {root_bu_id}",
                "$select": "roleid",
            })
            if not refetch.get("value"):
                raise RuntimeError(f"ロール '{role_name}' の作成後に ID を取得できません")
            role_id = refetch["value"][0]["roleid"]

        print(f"  ロール作成完了: {role_id}")
        # 作成直後に少し待機（メタデータ反映待ち）
        time.sleep(2)

    return role_id


# ── Step 5: 権限設定（Basic User + カスタムテーブル権限）──

def set_role_privileges(role_id, role_def, tables, priv_map, base_privileges):
    """Basic User の権限を土台にして、カスタムテーブル権限を上乗せする。
    ReplacePrivilegesRole で全権限を一括設定する。"""
    role_name = role_def["name"]
    print(f"\n  === 権限設定: {role_name} ===")

    # 1. Basic User の権限をベースにコピー（PrivilegeId → {PrivilegeId, Depth} の dict）
    priv_dict = {}
    for p in base_privileges:
        pid = p.get("PrivilegeId") or p.get("privilegeId")
        if pid:
            priv_dict[pid] = {
                "PrivilegeId": pid,
                "Depth": p.get("Depth", "Local"),
            }

    print(f"    Basic User ベース権限数: {len(priv_dict)}")

    # 2. カスタムテーブル権限を上乗せ（上書きまたは追加）
    table_privs = role_def.get("table_privileges", {})
    default_privs = table_privs.get("*", {})

    custom_added = 0
    for table in tables:
        schema = table["schema_name"]

        # テーブル固有の権限定義があればそれを使用、なければデフォルト
        specific = table_privs.get(schema, default_privs)

        table_priv_ids = priv_map.get(schema, {})

        for verb in TABLE_VERBS:
            depth = specific.get(verb)
            priv_id = table_priv_ids.get(verb)
            if not priv_id:
                continue  # 権限 ID が見つからない

            if depth is None:
                # 明示的に None → この権限を除去（Basic User にあっても削除）
                priv_dict.pop(priv_id, None)
            else:
                # 上書きまたは新規追加
                priv_dict[priv_id] = {
                    "PrivilegeId": priv_id,
                    "Depth": depth,
                }
                custom_added += 1

    print(f"    カスタムテーブル権限追加/上書き: {custom_added}")

    # 3. extra_privileges（テーブルに紐付かない特殊権限）
    extra = role_def.get("extra_privileges", [])
    if extra:
        filter_parts = [f"name eq '{name}'" for name in extra]
        filter_str = " or ".join(filter_parts)
        try:
            extra_privs = api_get("privileges", {
                "$filter": filter_str,
                "$select": "privilegeid,name",
            })
            for p in extra_privs.get("value", []):
                priv_dict[p["privilegeid"]] = {
                    "PrivilegeId": p["privilegeid"],
                    "Depth": "Global",
                }
                print(f"    特殊権限: {p['name']}")
        except requests.HTTPError as e:
            print(f"    ⚠️ 特殊権限の取得失敗: {e}")

    privileges_list = list(priv_dict.values())
    print(f"    合計権限数: {len(privileges_list)}（Basic User + カスタム）")

    if not privileges_list:
        print("    ⚠️ 設定する権限がありません")
        return

    # 4. ReplacePrivilegesRole で全権限を一括設定
    #    （Basic User の権限 + カスタム権限が一度に反映される）
    #    大量の権限を一度に送ると失敗する場合があるのでバッチ分割
    batch_size = 100
    first_batch = True
    for i in range(0, len(privileges_list), batch_size):
        batch = privileges_list[i:i + batch_size]
        try:
            if first_batch:
                # 最初のバッチは ReplacePrivilegesRole で全置換
                api_post(
                    f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole",
                    {"Privileges": batch},
                    include_solution=False,
                )
                first_batch = False
            else:
                # 2 バッチ目以降は AddPrivilegesRole で追加
                api_post(
                    f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole",
                    {"Privileges": batch},
                    include_solution=False,
                )
            print(f"    ✅ バッチ {i // batch_size + 1}: {len(batch)} 権限を設定")
        except requests.HTTPError as e:
            err_text = e.response.text if e.response else str(e)
            print(f"    ⚠️ バッチ {i // batch_size + 1} 失敗: {err_text[:300]}")
            # ReplacePrivilegesRole が失敗したら AddPrivilegesRole にフォールバック
            if first_batch:
                print("    → AddPrivilegesRole にフォールバック...")
                first_batch = False
                try:
                    api_post(
                        f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole",
                        {"Privileges": batch},
                        include_solution=False,
                    )
                    print(f"    ✅ フォールバック成功: {len(batch)} 権限を追加")
                except requests.HTTPError as e2:
                    err_text2 = e2.response.text if e2.response else str(e2)
                    print(f"    ⚠️ フォールバックも失敗: {err_text2[:300]}")


# ── Step 6: ソリューション含有検証 ────────────────────────

def verify_solution_membership(role_ids):
    """ロールがソリューションに含まれているか検証する"""
    print("\n=== Step 6: ソリューション含有検証 ===")

    for role_id, role_name in role_ids:
        try:
            api_post("AddSolutionComponent", {
                "ComponentId": role_id,
                "ComponentType": 20,  # Security Role
                "SolutionUniqueName": SOLUTION_NAME,
                "AddRequiredComponents": False,
                "DoNotIncludeSubcomponents": False,
            }, include_solution=False)
            print(f"  ✅ ロール '{role_name}' をソリューションに追加/検証: {role_id}")
        except requests.HTTPError as e:
            err_text = e.response.text if e.response else ""
            if "already" in err_text.lower():
                print(f"  ⏭️  ロール '{role_name}' は既にソリューション内: {role_id}")
            else:
                print(f"  ⚠️ ロール '{role_name}' のソリューション追加に失敗: {err_text[:300]}")


# ── Step 7: モデル駆動型アプリ関連付け ────────────────────

def associate_with_app(role_ids):
    """ロールをモデル駆動型アプリに関連付ける"""
    if not APP_MODULE_ID:
        print("\n=== Step 7: モデル駆動型アプリ関連付け（スキップ: APP_MODULE_ID 未設定）===")
        return

    print("\n=== Step 7: モデル駆動型アプリ関連付け ===")

    for role_id, role_name in role_ids:
        try:
            h = get_headers(False)
            r = requests.post(
                f"{API}/appmodules({APP_MODULE_ID})/appmoduleroles_association/$ref",
                headers=h,
                json={"@odata.id": f"{API}/roles({role_id})"},
            )
            if r.ok:
                print(f"  ✅ ロール '{role_name}' をアプリに関連付け")
            elif r.status_code == 409 or "already" in r.text.lower():
                print(f"  ⏭️  ロール '{role_name}' は既にアプリに関連付け済み")
            else:
                print(f"  ⚠️ 関連付け失敗 ({r.status_code}): {r.text[:300]}")
        except Exception as e:
            print(f"  ⚠️ ロール '{role_name}' の関連付けエラー: {e}")


# ── メイン ────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  カスタムセキュリティロール デプロイ")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print(f"  ロール数: {len(ROLE_DEFINITIONS)}")
    print("=" * 60)

    # Step 1: ルートビジネスユニット取得
    root_bu_id = get_root_business_unit()

    # Step 2: ソリューション内テーブル一覧取得
    tables = get_solution_tables()
    if not tables:
        print("\n⚠️ ソリューション内にテーブルが見つかりません。先に setup_dataverse.py を実行してください。")
        sys.exit(1)

    # Step 3: 権限 ID 取得
    priv_map = get_table_privileges(tables)

    # Step 3.5: Basic User ロールの権限を取得（カスタムロールの土台）
    base_privileges = get_basic_user_privileges(root_bu_id)

    # Step 4-5: ロール作成 → 権限設定（Basic User + カスタム）
    print("\n=== Step 4-5: ロール作成 & 権限設定 ===")
    role_ids = []
    for role_def in ROLE_DEFINITIONS:
        role_id = ensure_role(role_def, root_bu_id)
        set_role_privileges(role_id, role_def, tables, priv_map, base_privileges)
        role_ids.append((role_id, role_def["name"]))

    # Step 6: ソリューション含有検証
    verify_solution_membership(role_ids)

    # Step 7: モデル駆動型アプリ関連付け
    associate_with_app(role_ids)

    # 結果表示
    print("\n" + "=" * 60)
    print("  ✅ カスタムセキュリティロールのデプロイ完了")
    for role_id, role_name in role_ids:
        print(f"    {role_name}: {role_id}")
    print("=" * 60)


if __name__ == "__main__":
    main()
