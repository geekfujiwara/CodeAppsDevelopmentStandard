"""Function App のランタイムストレージ接続を ID ベース（マネージド ID）に構成する。

共有キー禁止（`allowSharedKeyAccess=false`）のストレージでは、接続文字列の
`AzureWebJobsStorage` ではホストが起動できず `0 functions loaded` となり全ルートが 404 になる。
デプロイ自体はマネージド ID で成功してしまうため「デプロイ成功なのに動かない」状態になりやすい。

使い方:
    python .github/skills/mcp-server/scripts/configure_function_storage.py --app func-example-mcp --account stexamplefn
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))

from azure_helper import arm_get, arm_post, arm_put, get_app_settings  # noqa: E402

# Functions ホストはホスト ID のリース管理に Blob の所有者権限を要求する
BLOB_DATA_OWNER = "b7e6dc6d-f1e8-4753-8033-0f276bb0955b"


def assign_blob_owner(subscription: str, resource_group: str, account: str, principal_id: str) -> None:
    import uuid

    scope = (
        f"/subscriptions/{subscription}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.Storage/storageAccounts/{account}"
    )
    body = {
        "properties": {
            "roleDefinitionId": (
                f"/subscriptions/{subscription}/providers/Microsoft.Authorization"
                f"/roleDefinitions/{BLOB_DATA_OWNER}"
            ),
            "principalId": principal_id,
            "principalType": "ServicePrincipal",
        }
    }
    try:
        arm_put(f"{scope}/providers/Microsoft.Authorization/roleAssignments/{uuid.uuid4()}", body, api_version="2022-04-01")
        print(f"[role] Storage Blob Data Owner -> {account}")
    except RuntimeError as exc:
        if "RoleAssignmentExists" in str(exc):
            print("[role] Storage Blob Data Owner は割り当て済み")
        else:
            raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True, help="Function App 名")
    parser.add_argument("--account", required=True, help="Functions ランタイム用ストレージアカウント名")
    parser.add_argument("--subscription", default=os.getenv("AZURE_SUBSCRIPTION_ID"))
    parser.add_argument("--resource-group", default=os.getenv("AZURE_RESOURCE_GROUP"))
    args = parser.parse_args()

    if not args.subscription or not args.resource_group:
        raise SystemExit("AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP を指定してください")

    site = f"/subscriptions/{args.subscription}/resourceGroups/{args.resource_group}/providers/Microsoft.Web/sites/{args.app}"
    principal_id = arm_get(site)["identity"]["principalId"]
    assign_blob_owner(args.subscription, args.resource_group, args.account, principal_id)

    settings = get_app_settings(args.subscription, args.resource_group, args.app)
    settings.pop("AzureWebJobsStorage", None)
    settings["AzureWebJobsStorage__accountName"] = args.account
    arm_put(f"{site}/config/appsettings", {"properties": settings})
    print(f"[settings] AzureWebJobsStorage__accountName={args.account}（接続文字列は削除）")

    arm_post(f"{site}/restart")
    print(f"[restart] {args.app}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
