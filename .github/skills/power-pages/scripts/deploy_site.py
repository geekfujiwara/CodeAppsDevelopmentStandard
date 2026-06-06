"""Power Pages SPA デプロイスクリプト（検証済み標準手順）

pac pages upload-code-site → Post-Upload Fix → Restart の一連を実行する。
「クラシックページ」にフォールバックしないための必須修正を自動適用する。

検証済み環境:
- React 19 + Vite 7 + Tailwind CSS 4
- PAC CLI v2.7+
- Power Pages Standard Data Model

必須条件:
- portal/powerpages.config.json に compiledPath, siteName が設定済み
- portal/dist/ にビルド済みアセットが存在する
- pac auth who で認証済み
- .env に DATAVERSE_URL, ENV_ID が設定済み

Usage:
    py .github/skills/power-pages/scripts/deploy_site.py [OPTIONS]

Options:
    --skip-build      ビルドをスキップ（事前ビルド済みの場合）
    --skip-checks     デプロイ前チェックをスキップ
    --skip-restart    サイト再起動をスキップ
    --portal-dir DIR  ポータルディレクトリ（デフォルト: ./portal）
"""
import sys
import os
import re
import json
import subprocess
import logging

# パスセットアップ
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

try:
    from auth_helper import get_token
except ImportError:
    print("ERROR: auth_helper.py not found. Run from project root.")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
except ImportError:
    pass

import requests

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATAVERSE_URL = os.environ.get('DATAVERSE_URL', '').rstrip('/')
ENV_ID = os.environ.get('ENV_ID', '')
PORTAL_DIR = os.environ.get('PORTAL_DIR', os.path.join(PROJECT_ROOT, 'portal'))

# CLI args
skip_build = '--skip-build' in sys.argv
skip_checks = '--skip-checks' in sys.argv
skip_restart = '--skip-restart' in sys.argv

for arg in sys.argv[1:]:
    if arg.startswith('--portal-dir'):
        idx = sys.argv.index(arg)
        if idx + 1 < len(sys.argv):
            PORTAL_DIR = sys.argv[idx + 1]


# ---------------------------------------------------------------------------
# Dataverse ヘルパー
# ---------------------------------------------------------------------------
def dv_headers():
    return {
        'Authorization': f'Bearer {get_token()}',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
    }


def dv_patch_headers():
    h = dv_headers()
    h['If-Match'] = '*'
    return h


def dv_get(path):
    return requests.get(f"{DATAVERSE_URL}/api/data/v9.2/{path}", headers=dv_headers())


def dv_patch(path, payload):
    return requests.patch(f"{DATAVERSE_URL}/api/data/v9.2/{path}", headers=dv_patch_headers(), json=payload)


# ---------------------------------------------------------------------------
# Phase 0: Pre-Deploy Check
# ---------------------------------------------------------------------------
def phase_predeploy_check():
    """デプロイ前チェック."""
    logger.info("=" * 60)
    logger.info("Phase 0: Pre-Deploy Check")
    logger.info("=" * 60)

    if skip_checks:
        logger.info("  (skipped via --skip-checks)")
        return

    predeploy_script = os.path.join(SCRIPT_DIR, 'predeploy_check.py')
    if os.path.isfile(predeploy_script):
        predeploy_cmd = [sys.executable, predeploy_script, '--fix']
        if skip_restart:
            predeploy_cmd.append('--skip-restart')
        result = subprocess.run(predeploy_cmd,
                               capture_output=True, text=True, encoding='utf-8', errors='replace')
        if result.stdout:
            print(result.stdout)
        if result.returncode != 0:
            logger.error("Pre-deploy check failed")
            if result.stderr:
                print(result.stderr)
            sys.exit(1)
    else:
        logger.info("  predeploy_check.py not found, skipping")


# ---------------------------------------------------------------------------
# Phase 1: Verify
# ---------------------------------------------------------------------------
def phase_verify():
    """前提確認."""
    logger.info("=" * 60)
    logger.info("Phase 1: Verify Prerequisites")
    logger.info("=" * 60)

    # pac auth
    result = subprocess.run(['pac', 'auth', 'who'], capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("pac auth not configured. Run: pac auth create --environment <URL>")
        sys.exit(1)
    logger.info("  ✓ pac auth OK")

    # powerpages.config.json
    config_path = os.path.join(PORTAL_DIR, 'powerpages.config.json')
    if not os.path.isfile(config_path):
        logger.error(f"powerpages.config.json not found at {config_path}")
        sys.exit(1)
    with open(config_path) as f:
        config = json.load(f)
    logger.info(f"  ✓ Site: {config['siteName']}, compiledPath: {config['compiledPath']}")

    # .env
    if not DATAVERSE_URL:
        logger.error("DATAVERSE_URL not set in .env")
        sys.exit(1)
    if not ENV_ID:
        logger.error("ENV_ID not set in .env")
        sys.exit(1)
    logger.info(f"  ✓ DATAVERSE_URL: {DATAVERSE_URL}")

    return config


# ---------------------------------------------------------------------------
# Phase 2: Build
# ---------------------------------------------------------------------------
def phase_build():
    """SPA ビルド."""
    logger.info("=" * 60)
    logger.info("Phase 2: Build")
    logger.info("=" * 60)

    if skip_build:
        logger.info("  (skipped via --skip-build)")
        return

    result = subprocess.run('npm run build', shell=True, cwd=PORTAL_DIR,
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        logger.error(f"Build failed: {result.stderr[-500:]}")
        sys.exit(1)
    logger.info("  ✓ Build OK")


# ---------------------------------------------------------------------------
# Phase 3: Upload
# ---------------------------------------------------------------------------
def phase_upload():
    """pac pages upload-code-site."""
    logger.info("=" * 60)
    logger.info("Phase 3: Upload")
    logger.info("=" * 60)

    result = subprocess.run(
        f'pac pages upload-code-site --rootPath "{PORTAL_DIR}"',
        shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    if result.stdout:
        lines = result.stdout.strip().split('\n')
        for line in lines[-10:]:
            logger.info(f"  {line}")
    if result.returncode != 0:
        logger.error(f"Upload failed: {result.stderr[-300:]}")
        sys.exit(1)
    logger.info("  ✓ Upload OK")


# ---------------------------------------------------------------------------
# Phase 4: Post-Upload Fix（SPA 表示に必須 — クラシック防止）
# ---------------------------------------------------------------------------
def phase_post_upload_fix(config):
    """pac pages upload 後の必須修正.

    これを実行しないとクラシックページが表示される。
    検証済みパターン:
    1. Page Template: usewebsiteheaderandfooter = false（全テンプレート）
    2. Web Template "Default studio template": source = body-only SPA ローダー
    3. Home ページ (Root + Content): mspp_copy = body-only HTML

    根本原因:
    - pac pages upload-code-site は Page Template の usewebsiteheaderandfooter を
      true にリセットする場合がある
    - Web Template source を標準的なクラシックテンプレートに上書きする
    - mspp_copy を dist/index.html の全文（<!doctype html>...）で上書きする

    修正パターン（検証済み）:
    - Web Template source = body-only HTML（CSS link + div#root + script tag）
    - mspp_copy = body-only HTML
    - アセットパス = /assets/xxx（ルート相対、./ ではない）
    """
    logger.info("=" * 60)
    logger.info("Phase 4: Post-Upload Fix (SPA 必須修正)")
    logger.info("=" * 60)

    # dist/index.html からアセットファイル名を取得
    compiled_path = config.get('compiledPath', 'dist')
    dist_dir = os.path.join(PORTAL_DIR, compiled_path)
    index_html_path = os.path.join(dist_dir, 'index.html')

    if not os.path.isfile(index_html_path):
        logger.error(f"dist/index.html not found: {index_html_path}")
        sys.exit(1)

    with open(index_html_path, encoding='utf-8') as f:
        html = f.read()

    js_match = re.search(r'src="[./]*(assets/[^"]+\.js)"', html)
    css_match = re.search(r'href="[./]*(assets/[^"]+\.css)"', html)

    if not js_match or not css_match:
        logger.error("Cannot parse asset filenames from index.html")
        sys.exit(1)

    js_file = js_match.group(1)
    css_file = css_match.group(1)
    logger.info(f"  Assets: /{js_file}, /{css_file}")

    # Website ID 取得
    r = dv_get(f"mspp_websites?$filter=mspp_name eq '{config['siteName']}'&$select=mspp_websiteid,mspp_name")
    websites = r.json().get('value', [])
    if not websites:
        r = dv_get("mspp_websites?$select=mspp_websiteid,mspp_name")
        websites = r.json().get('value', [])
    if not websites:
        logger.error("No website found in Dataverse")
        sys.exit(1)

    wid = websites[0]['mspp_websiteid']
    logger.info(f"  Website: {websites[0].get('mspp_name', '')} ({wid})")

    # --- Fix A: Page Templates ---
    logger.info("\n  [A] Page Templates: usewebsiteheaderandfooter → false")
    r = dv_get(f"mspp_pagetemplates?$filter=_mspp_websiteid_value eq '{wid}'"
               f"&$select=mspp_pagetemplateid,mspp_name,mspp_usewebsiteheaderandfooter")
    r.raise_for_status()
    for pt in r.json().get('value', []):
        pid = pt['mspp_pagetemplateid']
        name = pt['mspp_name']
        if pt.get('mspp_usewebsiteheaderandfooter') is True:
            rp = dv_patch(f"mspp_pagetemplates({pid})", {'mspp_usewebsiteheaderandfooter': False})
            logger.info(f"      {name}: → false ({rp.status_code})")
        else:
            logger.info(f"      {name}: OK")

    # --- Fix B: Web Template source = body-only SPA ローダー ---
    logger.info("\n  [B] Web Template 'Default studio template' → SPA loader")
    web_template_source = (
        '<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
        '<link\n'
        '  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"\n'
        '  rel="stylesheet"\n'
        '/>\n'
        f'<link rel="stylesheet" href="/{css_file}" />\n'
        '<div id="root"></div>\n'
        f'<script type="module" src="/{js_file}"></script>\n'
    )

    r = dv_get(f"mspp_webtemplates?$filter=_mspp_websiteid_value eq '{wid}'"
               f"&$select=mspp_webtemplateid,mspp_name")
    r.raise_for_status()
    for wt in r.json().get('value', []):
        if 'default studio' in wt.get('mspp_name', '').lower():
            wt_id = wt['mspp_webtemplateid']
            rp = dv_patch(f"mspp_webtemplates({wt_id})", {'mspp_source': web_template_source})
            logger.info(f"      {wt['mspp_name']}: ({rp.status_code})")

    # --- Fix C: Home page mspp_copy = body-only ---
    logger.info("\n  [C] Home page mspp_copy → body-only")
    new_copy = (
        '<div id="root"></div>\n'
        f'<script type="module" crossorigin src="/{js_file}"></script>\n'
        f'<link rel="stylesheet" crossorigin href="/{css_file}">'
    )

    r = dv_get(f"mspp_webpages?$filter=_mspp_websiteid_value eq '{wid}' and mspp_name eq 'Home'"
               f"&$select=mspp_webpageid,mspp_isroot")
    r.raise_for_status()
    pages = r.json().get('value', [])
    for p in pages:
        pid = p['mspp_webpageid']
        label = 'Root' if p.get('mspp_isroot') else 'Content'
        rp = dv_patch(f"mspp_webpages({pid})", {'mspp_copy': new_copy})
        logger.info(f"      {label} ({pid}): {rp.status_code}")

    logger.info("\n  ✓ Post-upload fix complete")


# ---------------------------------------------------------------------------
# Phase 4.5: Table Permission → Authenticated Users 自動紐づけ
# ---------------------------------------------------------------------------
def phase_link_permissions(config):
    """テーブル権限を Authenticated Users Web ロールに自動紐づけ.

    ⚠️ EDM (Enhanced Data Model) では、Dataverse 管理者であっても Power Pages 上では
    contact として認証されるため、Web ロール経由でないとテーブル権限が評価されない。
    全 Table Permission を Authenticated Users に紐づけないと 403 になる。

    2つの N:N テーブルで紐づけが必要:
    1. powerpagecomponent_powerpagecomponent (EDM v2 自己参照 N:N)
    2. mspp_entitypermission_webrole (Standard Data Model N:N)
    ランタイムは後者 (mspp) を参照するため、両方設定する。
    pac pages upload-code-site はデプロイ時に mspp 側の N:N を消すバグがある。
    """
    logger.info("=" * 60)
    logger.info("Phase 4.5: Link Table Permissions → Authenticated Users [MUST]")
    logger.info("=" * 60)

    h = dv_headers()

    # サイト ID (powerpagesiteid) を取得
    r = dv_get(f"powerpagesites?$filter=name eq '{config['siteName']}'"
               f"&$select=powerpagesiteid,name")
    if r.status_code != 200:
        logger.error(f"  ❌ powerpagesites 取得失敗: {r.status_code}")
        return
    sites = r.json().get('value', [])
    if not sites:
        # サイト名で一致しない場合は部分一致で試行
        r = dv_get("powerpagesites?$select=powerpagesiteid,name")
        sites = [s for s in r.json().get('value', []) if config['siteName'].lower() in s.get('name', '').lower()]
    if not sites:
        logger.warning("  ⚠️ powerpagesites が見つかりません — スキップ")
        return
    site_id = sites[0]['powerpagesiteid']

    # Authenticated Users ロール (type=11) を取得
    r = dv_get(f"powerpagecomponents"
               f"?$filter=powerpagecomponenttype eq 11 and _powerpagesiteid_value eq {site_id}"
               f"&$select=powerpagecomponentid,name")
    if r.status_code != 200:
        logger.error(f"  ❌ Web ロール取得失敗: {r.status_code}")
        return
    roles = r.json().get('value', [])
    auth_role = next((rl for rl in roles if 'authenticated' in rl.get('name', '').lower()), None)
    if not auth_role:
        logger.error("  ❌ 'Authenticated Users' ロールが見つかりません")
        return
    auth_role_id = auth_role['powerpagecomponentid']
    logger.info(f"  Authenticated Users: {auth_role_id}")

    # テーブル権限 (type=18) を列挙
    r = dv_get(f"powerpagecomponents"
               f"?$filter=powerpagecomponenttype eq 18 and _powerpagesiteid_value eq {site_id}"
               f"&$select=powerpagecomponentid,name")
    if r.status_code != 200:
        logger.error(f"  ❌ テーブル権限取得失敗: {r.status_code}")
        return
    perms = r.json().get('value', [])
    logger.info(f"  テーブル権限数: {len(perms)}")

    linked_count = 0
    for p in perms:
        pid = p['powerpagecomponentid']
        # 現在のリンクを確認
        lr = requests.get(
            f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({pid})/powerpagecomponent_powerpagecomponent"
            f"?$select=powerpagecomponentid",
            headers=h)
        linked_ids = [l['powerpagecomponentid'] for l in lr.json().get('value', [])] if lr.status_code == 200 else []

        if auth_role_id in linked_ids:
            logger.info(f"    {p['name']}: OK (already linked)")
        else:
            # 紐づけ
            url = f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({pid})/powerpagecomponent_powerpagecomponent/$ref"
            body = {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({auth_role_id})"}
            rr = requests.post(url, json=body, headers=h)
            if rr.status_code in (200, 204):
                logger.info(f"    {p['name']}: LINKED ({rr.status_code})")
                linked_count += 1
            else:
                logger.error(f"    {p['name']}: FAILED ({rr.status_code} {rr.text[:100]})")

    if linked_count > 0:
        logger.info(f"  => {linked_count} 件のテーブル権限を紐づけました (EDM v2)")
    else:
        logger.info("  => 全て紐づけ済み (EDM v2)")

    # --- Standard N:N (mspp_entitypermission_webrole) ---
    # Power Pages ランタイムはこちらを参照する。pac pages upload-code-site が
    # デプロイ時にこの N:N を消すため、毎回再リンクが必要。
    logger.info("\n  [mspp N:N] mspp_entitypermission_webrole 紐づけ")

    # mspp_websites から Website ID を取得
    wr = dv_get(f"mspp_websites?$filter=mspp_websiteid eq '{site_id}'"
                f"&$select=mspp_websiteid")
    mspp_wid = site_id  # powerpagesiteid = mspp_websiteid (同じ)

    # mspp_webroles から Authenticated Users を取得
    rr = dv_get(f"mspp_webroles?$filter=_mspp_websiteid_value eq '{mspp_wid}'"
                " and mspp_authenticatedusersrole eq true"
                "&$select=mspp_webroleid,mspp_name")
    mspp_roles = rr.json().get('value', []) if rr.status_code == 200 else []
    if not mspp_roles:
        # authenticatedusersrole フラグがない場合は名前で検索
        rr = dv_get(f"mspp_webroles?$filter=_mspp_websiteid_value eq '{mspp_wid}'"
                    "&$select=mspp_webroleid,mspp_name,mspp_authenticatedusersrole")
        mspp_roles = [r for r in rr.json().get('value', [])
                      if 'authenticated' in r.get('mspp_name', '').lower()]
    if not mspp_roles:
        logger.warning("  ⚠️ mspp Authenticated Users ロールが見つかりません")
    else:
        mspp_role_id = mspp_roles[0]['mspp_webroleid']
        logger.info(f"  mspp Authenticated Users: {mspp_role_id}")

        # mspp_entitypermissions を取得してリンク
        mr = dv_get(f"mspp_entitypermissions?$filter=_mspp_websiteid_value eq '{mspp_wid}'"
                    "&$select=mspp_entitypermissionid,mspp_entityname")
        mspp_perms = mr.json().get('value', []) if mr.status_code == 200 else []

        mspp_linked = 0
        for mp in mspp_perms:
            mpid = mp['mspp_entitypermissionid']
            # 既存リンク確認
            lr = requests.get(
                f"{DATAVERSE_URL}/api/data/v9.2/mspp_entitypermissions({mpid})"
                f"/mspp_entitypermission_webrole/$ref", headers=h)
            existing_refs = lr.json().get('value', []) if lr.status_code == 200 else []
            already = any(mspp_role_id in ref.get('@odata.id', '') for ref in existing_refs)

            if already:
                logger.info(f"    {mp['mspp_entityname']}: OK (mspp linked)")
            else:
                url = (f"{DATAVERSE_URL}/api/data/v9.2/"
                       f"mspp_entitypermissions({mpid})/mspp_entitypermission_webrole/$ref")
                body = {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/mspp_webroles({mspp_role_id})"}
                rr = requests.post(url, json=body, headers=h)
                if rr.status_code in (200, 201, 204):
                    logger.info(f"    {mp['mspp_entityname']}: LINKED (mspp)")
                    mspp_linked += 1
                elif rr.status_code == 409:
                    logger.info(f"    {mp['mspp_entityname']}: OK (conflict=already linked)")
                else:
                    logger.error(f"    {mp['mspp_entityname']}: FAILED ({rr.status_code})")

        if mspp_linked > 0:
            logger.info(f"  => {mspp_linked} 件の mspp N:N を紐づけました")
        else:
            logger.info("  => 全て mspp 紐づけ済み")


# ---------------------------------------------------------------------------
# Phase 5: Restart
# ---------------------------------------------------------------------------
def phase_restart(config):
    """サイト再起動（キャッシュクリア）.

    ⚠️ デプロイ後のサイト再起動は MUST。Dataverse のテーブル権限・サイト設定は
    ランタイムに積極的にキャッシュされるため、再起動しないと変更が反映されず
    403 (EntityPermissionReadIsMissing) 等の原因になる。

    Power Platform API のサイト ID は Dataverse の powerpagesiteid とは別物。
    .env の PAGES_WEBSITE_ID があればそれを最優先で使う（最も確実）。
    なければ /websites を GET して name 一致（スペース除去で正規化）で API 側 ID を取得する。
    """
    logger.info("=" * 60)
    logger.info("Phase 5: Restart (cache clear) [MUST]")
    logger.info("=" * 60)

    if skip_restart:
        logger.warning("  ⚠️ --skip-restart 指定: 再起動をスキップしました。")
        logger.warning("     権限・設定変更が反映されない場合があります。")
        logger.warning("     手動で再起動してください（admin.powerplatform.microsoft.com）。")
        return None

    token = get_token(scope='https://api.powerplatform.com/.default')
    h = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    def _restart(sid):
        rr = requests.post(
            f'https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites/{sid}/restart?api-version=2024-10-01',
            headers=h)
        if rr.status_code < 400:
            logger.info(f"  ✅ Restart triggered: {rr.status_code}")
        else:
            logger.error(f"  ❌ Restart FAILED: {rr.status_code} {rr.text[:200]}")
            logger.error("     手動で再起動してください（admin.powerplatform.microsoft.com）。")
        return rr.status_code < 400

    r = requests.get(
        f'https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01',
        headers=h)
    sites = r.json().get('value', [])

    site_url = None

    # [1] .env の PAGES_WEBSITE_ID を最優先（siteName と PP API 登録名の不一致対策）
    env_site_id = os.environ.get('PAGES_WEBSITE_ID', '').strip()
    if env_site_id:
        match = next((s for s in sites if s.get('id') == env_site_id), None)
        if match:
            site_url = match.get('websiteUrl', '')
            logger.info(f"  PAGES_WEBSITE_ID 使用: {match.get('name', '')} ({env_site_id})")
            _restart(env_site_id)
            return site_url
        logger.warning(f"  ⚠️ PAGES_WEBSITE_ID={env_site_id} が PP API に見つかりません。名前照合にフォールバックします。")

    # [2] 名前照合（スペース除去で正規化: 'm365status' ⊂ 'M365 Status Portal'）
    def _norm(x):
        return ''.join(x.lower().split())

    target = _norm(config['siteName'])
    for s in sites:
        if target in _norm(s.get('name', '')):
            sid = s['id']
            site_url = s.get('websiteUrl', '')
            logger.info(f"  名前照合: {s.get('name', '')} ({sid})")
            logger.info(f"  💡 .env に PAGES_WEBSITE_ID={sid} を設定すると次回から確実に再起動できます。")
            _restart(sid)
            break
    else:
        logger.error("  ❌ Site not found in PP API — 再起動できませんでした。")
        logger.error("     .env に PAGES_WEBSITE_ID を設定するか、手動で再起動してください。")
        logger.error("     一覧: " + ", ".join(f"{s.get('name')}={s.get('id')}" for s in sites))

    return site_url



# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    logger.info("")
    logger.info("Power Pages SPA Deploy (Verified Standard Procedure)")
    logger.info("")

    phase_predeploy_check()
    config = phase_verify()
    phase_build()
    phase_upload()
    phase_post_upload_fix(config)
    phase_link_permissions(config)
    site_url = phase_restart(config)

    logger.info("")
    logger.info("=" * 60)
    logger.info("✅ Deploy complete!")
    if site_url:
        logger.info(f"   URL: {site_url}")
    logger.info("   (Allow 1-2 minutes for cache propagation)")
    logger.info("")
    logger.info("   ⚠️ ブラウザキャッシュをクリアしてからアクセスしてください:")
    logger.info("      Ctrl+Shift+Delete → [キャッシュされた画像とファイル] → 削除")
    logger.info("      （またはシークレット/InPrivate ウィンドウで確認）")
    logger.info("=" * 60)


if __name__ == '__main__':
    main()
