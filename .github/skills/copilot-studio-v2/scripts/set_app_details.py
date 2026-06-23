"""
Copilot Studio v2 (cliagent) エージェントの「Edit details」(Teams + M365 チャネル メタデータ)を
API だけで設定する。
================================================================================
公開ダイアログ「Teams + Microsoft 365 ＞ Edit details」の保存先は Dataverse ではなく、
PVA(Power Virtual Agents) の bot management ゲートウェイである（実機の保存トレースで確定）:

  GET  {gw}/api/botmanagement/v1/channels/msteams/app
  PUT  {gw}/api/botmanagement/v1/channels/msteams/app/save
         ?isCopilotExtensionEnabled={M365有効}&isConsentProvidedToChangeACPToAny=true

  {gw} = その環境の PVA ゲートウェイ
         （例: https://powervamg.us-il102.gateway.prod.island.powerapps.com）

ゲートウェイ URL と BAP 環境 ID は BAP 環境 API から Dataverse org の一致で自動取得する
（ハードコードしない）。アイコン(colorIcon/outlineIcon/accentColor)も Dataverse ではなく
このゲートウェイに保存されるため、本スクリプトが set_icon.py の生成アイコンを取り込んで送る。

UI 項目 → ペイロード キーの対応:
  Icon                                   → colorIcon(192) / outlineIcon(32) / accentColor
  Short description*                      → shortDescription      （M365 公開の必須項目）
  Long description                        → longDescription
  Show an agent disclaimer in M365        → disclaimer
  Developer name                          → developerName
  Website / Terms of use / Privacy        → websiteLink / termsLink / privacyLink
  Microsoft Partner Network ID            → microsoftPartnerNetworkId
  Discoverable in Power Platform store    → isPowerPlatformStoreDiscoverable
  Users can add this agent to a team      → scopes に "team"
  Use this agent for group/meeting chats  → scopes に "groupchat"
  (上記いずれか有効)                       → teamsCollaborationEnabled
  Supports calling                        → supportsCalling / isTeamsIvrEnabled
  SSO Application (client) ID             → singleSignOnAadApplicationClientId
  SSO Resource URI                        → singleSignOnResourceUri
  Make agent available in M365 Copilot    → save の isCopilotExtensionEnabled クエリ

挙動（既定: 妥当なデフォルトを自動補完して公開）:
  - 現在値を GET し、その上に .env / アイコン / デフォルトをマージして PUT する（破壊しない）。
  - 必須の shortDescription が未指定なら、AGENT 名/Instructions から自動生成する。
  - websiteLink/termsLink/privacyLink が未指定なら Copilot Studio 既定の fwlink を使う。
  - --require-confirm を付けると、補完値が1つでもあれば確認のため停止する（CI で利用）。
  - --dry-run でプレビューのみ（PUT しない）。

.env パラメータ（詳細は references/.env.example）:
  AGENT_BOTID / AGENT_SCHEMA          対象エージェント（未指定なら agent_botid.txt）
  APP_SHORT_DESCRIPTION               Short description（80字以内）
  APP_LONG_DESCRIPTION                Long description（3400字以内）
  APP_DISCLAIMER                      M365 ディスクレーマー文（任意・空可）
  APP_DEVELOPER_NAME                  Developer name
  APP_WEBSITE_URL / APP_TERMS_URL / APP_PRIVACY_URL
  APP_MPN_ID                          Microsoft Partner Network ID
  APP_STORE_DISCOVERABLE              Power Platform store に表示（true/false, 既定 false）
  APP_TEAMS_SCOPES                    "personal,team,groupchat" のカンマ区切り（既定 personal）
  APP_SUPPORTS_CALLING               通話対応（true/false, 既定 false）
  APP_TEAMS_RA_ID                     Teams Resource Account ID（calling 用 / 任意）
  APP_SSO_CLIENT_ID                   SSO Application(client) ID（GUID / 任意）
  APP_SSO_RESOURCE_URI               SSO Resource URI（任意）
  APP_M365_ENABLED                    M365 Copilot で利用可能にするか（true/false, 既定 true）
  PVA_GATEWAY_BASE                    PVA ゲートウェイ URL の明示指定（任意・通常は自動取得）
  BAP_ENVIRONMENT_ID                  BAP 環境 ID の明示指定（任意・通常は自動取得）

実行: python set_app_details.py [--dry-run] [--require-confirm]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import api_get, get_token, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

# PVA bot management ゲートウェイ向けトークンの audience
PVA_RESOURCE = "96ff4394-9197-43aa-b393-6a41652e21f8"
PVA_SCOPE = f"{PVA_RESOURCE}/.default"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"

# Copilot Studio が既定で入れる標準リンク（設定済み実機で確認済み）
DEFAULT_WEBSITE = "https://go.microsoft.com/fwlink/?linkid=2138949"
DEFAULT_TERMS = "https://go.microsoft.com/fwlink/?linkid=2138865"
DEFAULT_PRIVACY = "https://go.microsoft.com/fwlink/?linkid=2138950"
DEFAULT_SSO_CLIENT_ID = "00000000-0000-0000-0000-000000000000"

VALID_SCOPES = ("personal", "team", "groupchat")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _truthy(val: str, default: bool) -> bool:
    v = (val or "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return default


def _jwt_claims(token: str) -> dict:
    """アクセストークンのペイロード(claims)をデコードする（tid/oid 取得用）。"""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def _first_sentence(text: str, limit: int = 80) -> str:
    """Instructions から1文目を抜き出し、説明文の自動デフォルトに使う。"""
    if not text:
        return ""
    for raw in text.splitlines():
        line = raw.strip().lstrip("#").lstrip("-").strip()
        if len(line) >= 6:
            for sep in ("。", ". ", "．"):
                if sep in line:
                    line = line.split(sep)[0] + ("。" if sep in ("。", "．") else "")
                    break
            return line[:limit]
    return ""


def resolve_bot() -> str:
    bot = _env("AGENT_BOTID")
    if bot and re.fullmatch(r"[0-9a-fA-F-]{36}", bot):
        return bot
    schema = _env("AGENT_SCHEMA")
    if schema:
        res = api_get(f"bots?$select=botid&$filter=schemaname eq '{schema}'").get("value")
        if res:
            return res[0]["botid"]
    bf = Path("agent_botid.txt")
    if bf.exists():
        return bf.read_text(encoding="utf-8").strip()
    print("Error: AGENT_BOTID / AGENT_SCHEMA / agent_botid.txt のいずれかが必要です。", file=sys.stderr)
    sys.exit(1)


def discover_gateway() -> tuple[str, str]:
    """BAP 環境 API から (PVA ゲートウェイ URL, BAP 環境 ID) を取得する。
    Dataverse org の instanceUrl 一致で当該環境を特定する。.env での明示指定があれば優先。"""
    gw = _env("PVA_GATEWAY_BASE").rstrip("/")
    bap_env = _env("BAP_ENVIRONMENT_ID")
    if gw and bap_env:
        return gw, bap_env

    tok = get_token(BAP_SCOPE)
    url = ("https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform"
           "/scopes/admin/environments?api-version=2021-04-01&$expand=properties")
    r = requests.get(url, headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    r.raise_for_status()
    target = DATAVERSE_URL.rstrip("/").lower()
    for e in r.json().get("value", []):
        p = e.get("properties", {}) or {}
        meta = p.get("linkedEnvironmentMetadata", {}) or {}
        inst = (meta.get("instanceUrl") or "").rstrip("/").lower()
        if inst == target:
            rt = p.get("runtimeEndpoints", {}) or {}
            disc_gw = (rt.get("microsoft.PowerVirtualAgents") or "").rstrip("/")
            return gw or disc_gw, bap_env or e.get("name", "")
    print("Error: Dataverse org に一致する BAP 環境が見つかりません。"
          "PVA_GATEWAY_BASE / BAP_ENVIRONMENT_ID を .env に指定してください。", file=sys.stderr)
    sys.exit(1)


def _dv_icons(bot_id: str) -> tuple[str | None, str | None, str | None]:
    """set_icon.py が Dataverse に入れた colorIcon/outlineIcon/accentColor を取り出す
    （ゲートウェイ側へ転送するためのアイコン供給元）。"""
    bd = api_get(f"bots({bot_id})?$select=applicationmanifestinformation")
    ami = json.loads(bd.get("applicationmanifestinformation") or "{}")
    teams = ami.get("teams", {}) or {}
    return teams.get("colorIcon"), teams.get("outlineIcon"), teams.get("accentColor")


def _gen_icons(name: str) -> tuple[str, str]:
    """set_icon.py の描画ロジックを再利用して colorIcon(192)/outlineIcon(32) を生成する。
    save は両アイコンが必須(null 不可)のため、未設定時のフォールバックに使う。"""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import set_icon  # noqa: PLC0415

    text = (_env("ICON_TEXT") or name[:1]).upper()
    color = set_icon.to_b64(set_icon.draw_icon(192, text))
    outline = set_icon.to_b64(set_icon.draw_icon(32, text, transparent_bg=True, outline_only=True))
    return color, outline


def get_current(gw: str, headers: dict) -> dict:
    r = requests.get(f"{gw}/api/botmanagement/v1/channels/msteams/app", headers=headers, timeout=60)
    if r.status_code == 200:
        return r.json() or {}
    return {}


def build_payload(bot: dict, bot_id: str, current: dict) -> tuple[dict, list[str]]:
    """現在値(current)＋.env＋アイコン＋デフォルトをマージしたペイロードを組み立てる。
    戻り値: (payload, 自動補完した項目名リスト)。"""
    name = bot["name"]
    p = dict(current)  # 現在値を土台にして破壊を避ける

    # Instructions（説明文デフォルト用）
    instr = ""
    try:
        cfg = json.loads(bot.get("configuration") or "{}")
        segs = cfg.get("agentSettings", {}).get("instructions", {}).get("segments", [])
        instr = " ".join(s.get("value", "") for s in segs)
    except Exception:
        instr = ""

    defaulted: list[str] = []

    # アイコン（Dataverse の set_icon.py 生成物を供給。無ければ生成してフォールバック）
    color, outline, accent = _dv_icons(bot_id)
    if not color:
        color = current.get("colorIcon")
    if not outline:
        outline = current.get("outlineIcon")
    if not color or not outline:
        gen_color, gen_outline = _gen_icons(name)
        color = color or gen_color
        outline = outline or gen_outline
        defaulted.append("Icon")
    p["colorIcon"] = color
    p["outlineIcon"] = outline
    p["accentColor"] = _env("ICON_BG_COLOR") or accent or p.get("accentColor") or "#2563EB"

    # Short description（必須）
    short = _env("APP_SHORT_DESCRIPTION")
    if not short:
        short = p.get("shortDescription") or _first_sentence(instr) or f"{name} エージェント"
        if not current.get("shortDescription"):
            defaulted.append("Short description")
    p["shortDescription"] = short[:80]

    # Long description
    longd = _env("APP_LONG_DESCRIPTION")
    if not longd:
        longd = p.get("longDescription") or short
        if not current.get("longDescription"):
            defaulted.append("Long description")
    p["longDescription"] = longd[:3400]

    # Disclaimer（任意・空可）
    disc = _env("APP_DISCLAIMER")
    p["disclaimer"] = disc if disc else (p.get("disclaimer") or "")

    # Developer name
    dev = _env("APP_DEVELOPER_NAME")
    if not dev:
        dev = p.get("developerName") or _env("DEVELOPER_NAME") or "Copilot Studio Maker"
        if not current.get("developerName"):
            defaulted.append("Developer name")
    p["developerName"] = dev

    # Links
    p["websiteLink"] = _env("APP_WEBSITE_URL") or p.get("websiteLink") or DEFAULT_WEBSITE
    p["termsLink"] = _env("APP_TERMS_URL") or p.get("termsLink") or DEFAULT_TERMS
    p["privacyLink"] = _env("APP_PRIVACY_URL") or p.get("privacyLink") or DEFAULT_PRIVACY

    # MPN ID（任意・空可）
    p["microsoftPartnerNetworkId"] = _env("APP_MPN_ID") or p.get("microsoftPartnerNetworkId") or ""

    # Power Platform store 表示
    p["isPowerPlatformStoreDiscoverable"] = _truthy(
        _env("APP_STORE_DISCOVERABLE"), bool(current.get("isPowerPlatformStoreDiscoverable", False)))

    # Teams scopes（チームに追加 / グループ・会議チャット）
    raw_scopes = _env("APP_TEAMS_SCOPES")
    if raw_scopes:
        scopes = [s.strip() for s in raw_scopes.split(",") if s.strip() in VALID_SCOPES]
    elif current.get("scopes"):
        scopes = [s for s in current["scopes"] if s in VALID_SCOPES]
    else:
        scopes = ["personal"]
        defaulted.append("Teams scopes")
    if "personal" not in scopes:
        scopes.insert(0, "personal")
    p["scopes"] = scopes
    p["teamsCollaborationEnabled"] = ("team" in scopes) or ("groupchat" in scopes)

    # 通話対応
    p["supportsCalling"] = _truthy(_env("APP_SUPPORTS_CALLING"), bool(current.get("supportsCalling", False)))
    p["isTeamsIvrEnabled"] = current.get("isTeamsIvrEnabled")

    # Teams Resource Account ID（任意）
    p["teamsRaId"] = _env("APP_TEAMS_RA_ID") or p.get("teamsRaId") or ""

    # SSO（任意）
    p["singleSignOnAadApplicationClientId"] = (
        _env("APP_SSO_CLIENT_ID")
        or p.get("singleSignOnAadApplicationClientId")
        or DEFAULT_SSO_CLIENT_ID
    )
    sso_uri = _env("APP_SSO_RESOURCE_URI")
    p["singleSignOnResourceUri"] = sso_uri if sso_uri else p.get("singleSignOnResourceUri")

    return p, defaulted


def set_app_details(bot_id: str, *, dry_run: bool, require_confirm: bool) -> None:
    bot = api_get(f"bots({bot_id})?$select=name,configuration")
    name = bot["name"]

    gw, bap_env = discover_gateway()
    tok = get_token(PVA_SCOPE)
    claims = _jwt_claims(tok)
    tenant = claims.get("tid") or _env("TENANT_ID")
    uid = claims.get("oid", "")
    headers = {
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "x-cci-applicationsource": "Web",
        "x-cci-bapenvironmentid": bap_env,
        "x-cci-cdsbotid": bot_id,
        "x-cci-routing-tenantid": tenant,
        "x-cci-routing-userid": uid,
        "x-cci-tenantid": tenant,
    }

    current = get_current(gw, headers)
    payload, defaulted = build_payload(bot, bot_id, current)
    m365 = _truthy(_env("APP_M365_ENABLED"), True)

    print(f"対象: {name} ({bot_id})")
    print(f"ゲートウェイ: {gw}")
    print("--- 設定内容 ---")
    print(f"  Short description : {payload['shortDescription']}")
    _ld = payload["longDescription"]
    print(f"  Long description  : {_ld[:60]}{'…' if len(_ld) > 60 else ''}")
    print(f"  Disclaimer        : {payload['disclaimer'] or '(なし)'}")
    print(f"  Developer name    : {payload['developerName']}")
    print(f"  Website           : {payload['websiteLink']}")
    print(f"  Terms of use      : {payload['termsLink']}")
    print(f"  Privacy statement : {payload['privacyLink']}")
    print(f"  MPN ID            : {payload['microsoftPartnerNetworkId'] or '(未設定)'}")
    print(f"  Store 表示        : {payload['isPowerPlatformStoreDiscoverable']}")
    print(f"  Teams scopes      : {payload['scopes']} (collaboration={payload['teamsCollaborationEnabled']})")
    print(f"  Supports calling  : {payload['supportsCalling']}")
    print(f"  SSO client id     : {payload['singleSignOnAadApplicationClientId']}")
    print(f"  Icon(color/outline): "
          f"{'有' if payload.get('colorIcon') else '無'}/"
          f"{'有' if payload.get('outlineIcon') else '無'} accent={payload['accentColor']}")
    print(f"  M365 Copilot 有効 : {m365}")
    if defaulted:
        print(f"  ⚠️ 自動補完した項目: {', '.join(defaulted)}（.env で上書き可能）")

    if require_confirm and defaulted:
        print("  ⛔ --require-confirm 指定かつ自動補完あり。"
              ".env に値を設定してから再実行してください。", file=sys.stderr)
        sys.exit(2)

    if dry_run:
        print("  [dry-run] PUT はスキップしました。")
        return

    url = (f"{gw}/api/botmanagement/v1/channels/msteams/app/save"
           f"?isCopilotExtensionEnabled={'true' if m365 else 'false'}"
           f"&isConsentProvidedToChangeACPToAny=true")
    r = requests.put(url, headers=headers,
                     data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), timeout=120)
    if r.status_code in (200, 204):
        print("  ✅ Edit details を設定しました（PVA ゲートウェイ）。")
    else:
        print(f"  ❌ 設定失敗: {r.status_code} {r.text[:400]}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description="Copilot Studio v2 の Edit details(チャネル メタデータ)を設定")
    ap.add_argument("--dry-run", action="store_true", help="PUT せずプレビューのみ")
    ap.add_argument("--require-confirm", action="store_true",
                    help="自動補完が発生したら停止（値の手動確認を強制）")
    args = ap.parse_args()

    bot_id = resolve_bot()
    set_app_details(bot_id, dry_run=args.dry_run, require_confirm=args.require_confirm)


if __name__ == "__main__":
    main()
