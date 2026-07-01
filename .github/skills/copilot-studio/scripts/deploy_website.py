"""Azure Storage 静的 Web サイトへ外部公開サイトをデプロイする（汎用）。

認証は standard スキルの auth_helper（DeviceCode / PAC プロファイル）を利用し、
`az login` / az CLI は不要。ARM（コントロールプレーン）でリソースグループと
ストレージアカウントを冪等に作成し、データプレーンは **Entra（AAD）認証** で
アップロードする（組織の Azure Policy が共有キー認証・公開 BLOB アクセスを
禁止していても動作する）。

設定は .env（references/.env.example 参照）から取得する。実値はハードコードしない。

使い方:
    python .github/skills/copilot-studio/scripts/deploy_website.py
    python .github/skills/copilot-studio/scripts/deploy_website.py website/index.html
"""
import base64
import json
import os
import sys
import time
import uuid
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[4]  # リポジトリルート
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
import auth_helper  # noqa: E402
from auth_helper import get_token  # noqa: E402

load_dotenv()

# ── 設定（.env）─────────────────────────────────────
RESOURCE_GROUP = os.getenv("AZURE_RESOURCE_GROUP", "rg-agent-website")
LOCATION = os.getenv("AZURE_LOCATION", "japaneast")
STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "")
SUBSCRIPTION_ID = os.getenv("AZURE_SUBSCRIPTION_ID", "")
INDEX_FILE = ROOT / (sys.argv[1] if len(sys.argv) > 1 else "website/index.html")

ARM = "https://management.azure.com"
ARM_SCOPE = "https://management.azure.com/.default"
STORAGE_SCOPE = "https://storage.azure.com/.default"
API = "2023-01-01"
# Storage Blob Data Owner（データプレーン AAD 認証用のロール定義 ID）
BLOB_DATA_OWNER = "b7e6dc6d-f1e8-4753-8033-0f276bb0955b"


class HelperCredential:
    """auth_helper.get_token を azure SDK の TokenCredential として橋渡しする。"""

    def get_token(self, *scopes, **kwargs):
        from azure.core.credentials import AccessToken

        scope = scopes[0]
        token = get_token(scope)
        _, expires_on = auth_helper._inmemory_tokens[scope]
        return AccessToken(token, int(expires_on))


def arm_headers():
    return {"Authorization": f"Bearer {get_token(ARM_SCOPE)}", "Content-Type": "application/json"}


def pick_subscription() -> str:
    if SUBSCRIPTION_ID:
        return SUBSCRIPTION_ID
    r = requests.get(f"{ARM}/subscriptions?api-version=2022-12-01", headers=arm_headers(), timeout=60)
    r.raise_for_status()
    subs = [s for s in r.json().get("value", []) if s.get("state") == "Enabled"]
    if not subs:
        raise SystemExit("有効なサブスクリプションが見つかりません。AZURE_SUBSCRIPTION_ID を設定してください。")
    sub = subs[0]
    print(f"サブスクリプション: {sub.get('displayName')} ({sub['subscriptionId']})")
    return sub["subscriptionId"]


def ensure_provider(sub: str):
    requests.post(
        f"{ARM}/subscriptions/{sub}/providers/Microsoft.Storage/register?api-version=2022-12-01",
        headers=arm_headers(),
        timeout=60,
    )


def ensure_resource_group(sub: str):
    r = requests.put(
        f"{ARM}/subscriptions/{sub}/resourcegroups/{RESOURCE_GROUP}?api-version=2021-04-01",
        headers=arm_headers(),
        json={"location": LOCATION},
        timeout=60,
    )
    r.raise_for_status()
    print(f"リソースグループ: {RESOURCE_GROUP}")


def ensure_storage_account(sub: str) -> str:
    base = (
        f"{ARM}/subscriptions/{sub}/resourceGroups/{RESOURCE_GROUP}"
        f"/providers/Microsoft.Storage/storageAccounts/{STORAGE_ACCOUNT}"
    )
    r = requests.get(f"{base}?api-version={API}", headers=arm_headers(), timeout=60)
    if r.status_code == 200:
        print(f"ストレージアカウント既存: {STORAGE_ACCOUNT}")
        return base

    chk = requests.post(
        f"{ARM}/subscriptions/{sub}/providers/Microsoft.Storage/checkNameAvailability?api-version={API}",
        headers=arm_headers(),
        json={"name": STORAGE_ACCOUNT, "type": "Microsoft.Storage/storageAccounts"},
        timeout=60,
    )
    chk.raise_for_status()
    if not chk.json().get("nameAvailable"):
        raise SystemExit(
            f"ストレージアカウント名 '{STORAGE_ACCOUNT}' は使用できません: "
            f"{chk.json().get('message')} — AZURE_STORAGE_ACCOUNT で別名を指定してください。"
        )

    body = {
        "sku": {"name": "Standard_LRS"},
        "kind": "StorageV2",
        "location": LOCATION,
        "properties": {"minimumTlsVersion": "TLS1_2"},
    }
    cr = requests.put(f"{base}?api-version={API}", headers=arm_headers(), json=body, timeout=120)
    cr.raise_for_status()
    print(f"ストレージアカウント作成中: {STORAGE_ACCOUNT} …")
    for _ in range(30):
        time.sleep(6)
        g = requests.get(f"{base}?api-version={API}", headers=arm_headers(), timeout=60)
        if g.status_code == 200 and g.json().get("properties", {}).get("provisioningState") == "Succeeded":
            print("  作成完了")
            return base
    raise SystemExit("ストレージアカウントのプロビジョニングがタイムアウトしました。")


def _token_oid() -> str:
    tok = get_token(ARM_SCOPE)
    payload = tok.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["oid"]


def ensure_role_assignment(base: str, sub: str):
    """自分に Storage Blob Data Owner を割り当てる（データプレーン AAD 認証用）。"""
    role_def = (
        f"/subscriptions/{sub}/providers/Microsoft.Authorization"
        f"/roleDefinitions/{BLOB_DATA_OWNER}"
    )
    body = {
        "properties": {
            "roleDefinitionId": role_def,
            "principalId": _token_oid(),
            "principalType": "User",
        }
    }
    r = requests.put(
        f"{base}/providers/Microsoft.Authorization/roleAssignments/{uuid.uuid4()}?api-version=2022-04-01",
        headers=arm_headers(),
        json=body,
        timeout=60,
    )
    if r.status_code in (200, 201):
        print("ロール割り当て: Storage Blob Data Owner 付与（反映待ち）")
        time.sleep(30)
    elif r.status_code == 409 or "RoleAssignmentExists" in r.text:
        print("ロール割り当て: 既存")
    else:
        r.raise_for_status()


def deploy_blob():
    from azure.core.exceptions import HttpResponseError
    from azure.storage.blob import BlobServiceClient, ContentSettings

    svc = BlobServiceClient(
        account_url=f"https://{STORAGE_ACCOUNT}.blob.core.windows.net",
        credential=HelperCredential(),
    )
    svc.set_service_properties(
        static_website={
            "enabled": True,
            "index_document": "index.html",
            "error_document404_path": "index.html",
        }
    )
    print("静的 Web サイト有効化")
    web = svc.get_container_client("$web")
    last_err = None
    for attempt in range(10):
        try:
            with open(INDEX_FILE, "rb") as f:
                web.upload_blob(
                    name="index.html",
                    data=f,
                    overwrite=True,
                    content_settings=ContentSettings(content_type="text/html; charset=utf-8"),
                )
            print("index.html アップロード完了")
            return
        except HttpResponseError as e:
            if "AuthorizationPermissionMismatch" in str(e):
                last_err = e
                print(f"  RBAC 反映待ち… 再試行 {attempt + 1}/10")
                time.sleep(20)
                continue
            raise
    raise SystemExit(f"アップロードに失敗しました（RBAC 反映待ちタイムアウト）: {last_err}")


def main():
    if not STORAGE_ACCOUNT:
        raise SystemExit("AZURE_STORAGE_ACCOUNT を .env に設定してください（3-24 文字・小文字英数字・グローバル一意）。")
    if not INDEX_FILE.exists():
        raise SystemExit(f"index.html が見つかりません: {INDEX_FILE}")
    sub = pick_subscription()
    ensure_provider(sub)
    ensure_resource_group(sub)
    base = ensure_storage_account(sub)
    ensure_role_assignment(base, sub)
    deploy_blob()
    print("\n✅ デプロイ完了")
    print(f"   https://{STORAGE_ACCOUNT}.z11.web.core.windows.net/")


if __name__ == "__main__":
    main()
