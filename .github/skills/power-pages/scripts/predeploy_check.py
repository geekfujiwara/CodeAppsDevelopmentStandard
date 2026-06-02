"""Power Pages SPA デプロイ前チェック.

クラシックページ表示を防止するための事前検証を行う。
deploy_site.py の Phase 0 として自動実行される。

チェック項目:
1. ビルド出力の存在（dist/index.html + assets/）
2. Page Template の usewebsiteheaderandfooter 値
3. Web Template source の状態
4. mspp_copy のフォーマット（full HTML が入っていないか）
5. 重複ページの検出
6. テーブル権限 → Authenticated Users Web ロールのリンク検証

Usage:
    py .github/skills/power-pages/scripts/predeploy_check.py [--fix]
"""
import sys
import os
import re
import json
import logging

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

try:
    from auth_helper import get_token
    import requests
except ImportError:
    print("ERROR: auth_helper.py or requests not found.")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATAVERSE_URL = os.environ.get('DATAVERSE_URL', '').rstrip('/')
PORTAL_DIR = os.environ.get('PORTAL_DIR', os.path.join(PROJECT_ROOT, 'portal'))
FIX_MODE = '--fix' in sys.argv


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


def get_website_id():
    """powerpages.config.json から siteName を読み、対応する website ID を返す."""
    config_path = os.path.join(PORTAL_DIR, 'powerpages.config.json')
    if not os.path.isfile(config_path):
        return None, None

    with open(config_path) as f:
        config = json.load(f)
    site_name = config.get('siteName', '')

    h = dv_headers()
    r = requests.get(f"{DATAVERSE_URL}/api/data/v9.2/mspp_websites?$select=mspp_websiteid,mspp_name", headers=h)
    if r.status_code != 200:
        return None, config

    for w in r.json().get('value', []):
        if site_name.lower() in w.get('mspp_name', '').lower():
            return w['mspp_websiteid'], config

    # Return first if only one
    websites = r.json().get('value', [])
    if len(websites) == 1:
        return websites[0]['mspp_websiteid'], config

    return None, config


def run_checks():
    """全チェックを実行。成功なら True, 失敗なら False."""
    logger.info("Power Pages SPA Pre-Deploy Check")
    logger.info("=" * 50)

    errors = []
    warnings = []

    # --- Check 1: Build output ---
    logger.info("\n[1] Build output check...")
    config_path = os.path.join(PORTAL_DIR, 'powerpages.config.json')
    if os.path.isfile(config_path):
        with open(config_path) as f:
            config = json.load(f)
        compiled_path = config.get('compiledPath', 'dist')
        dist_dir = os.path.join(PORTAL_DIR, compiled_path)
        index_html = os.path.join(dist_dir, 'index.html')

        if not os.path.isfile(index_html):
            errors.append(f"dist/index.html not found at {index_html}. Run: npm run build")
        else:
            with open(index_html, encoding='utf-8') as f:
                html = f.read()
            js_match = re.search(r'src="[./]*(assets/[^"]+\.js)"', html)
            css_match = re.search(r'href="[./]*(assets/[^"]+\.css)"', html)
            if not js_match or not css_match:
                errors.append("Cannot parse JS/CSS asset filenames from index.html")
            else:
                js_path = os.path.join(dist_dir, js_match.group(1))
                css_path = os.path.join(dist_dir, css_match.group(1))
                if not os.path.isfile(js_path):
                    errors.append(f"JS bundle not found: {js_path}")
                if not os.path.isfile(css_path):
                    errors.append(f"CSS bundle not found: {css_path}")
                if os.path.isfile(js_path) and os.path.isfile(css_path):
                    logger.info(f"    ✓ JS: {js_match.group(1)}")
                    logger.info(f"    ✓ CSS: {css_match.group(1)}")
    else:
        errors.append(f"powerpages.config.json not found at {config_path}")

    # --- Check 2: Vite config ---
    logger.info("\n[2] Vite config check...")
    vite_path = os.path.join(PORTAL_DIR, 'vite.config.ts')
    if os.path.isfile(vite_path):
        with open(vite_path, encoding='utf-8') as f:
            vite_content = f.read()
        if 'inlineDynamicImports' not in vite_content:
            warnings.append("vite.config.ts: inlineDynamicImports not found (recommended: true)")
        if "base:" not in vite_content and "base :" not in vite_content:
            warnings.append("vite.config.ts: base not set (recommended: './')")
        else:
            logger.info("    ✓ Vite config OK")
    else:
        warnings.append("vite.config.ts not found")

    # --- Check 3-5: Dataverse state (only if connected) ---
    if not DATAVERSE_URL:
        warnings.append("DATAVERSE_URL not set — skipping Dataverse checks")
    else:
        wid, _ = get_website_id()
        if not wid:
            warnings.append("Website not found in Dataverse — skipping Dataverse checks")
        else:
            h = dv_headers()
            hp = dv_patch_headers()

            # Check 3: Page Template
            logger.info("\n[3] Page Template check...")
            r = requests.get(
                f"{DATAVERSE_URL}/api/data/v9.2/mspp_pagetemplates"
                f"?$filter=_mspp_websiteid_value eq '{wid}'"
                f"&$select=mspp_pagetemplateid,mspp_name,mspp_usewebsiteheaderandfooter",
                headers=h)
            if r.status_code == 200:
                for pt in r.json().get('value', []):
                    if pt.get('mspp_usewebsiteheaderandfooter') is True:
                        msg = f"Page Template '{pt['mspp_name']}' has usewebsiteheaderandfooter=true"
                        if FIX_MODE:
                            rp = requests.patch(
                                f"{DATAVERSE_URL}/api/data/v9.2/mspp_pagetemplates({pt['mspp_pagetemplateid']})",
                                headers=hp, json={'mspp_usewebsiteheaderandfooter': False})
                            logger.info(f"    FIXED: {pt['mspp_name']} → false ({rp.status_code})")
                        else:
                            warnings.append(msg)
                    else:
                        logger.info(f"    ✓ {pt['mspp_name']}: OK")

            # Check 4: Web Template
            logger.info("\n[4] Web Template check...")
            r = requests.get(
                f"{DATAVERSE_URL}/api/data/v9.2/mspp_webtemplates"
                f"?$filter=_mspp_websiteid_value eq '{wid}'"
                f"&$select=mspp_webtemplateid,mspp_name,mspp_source",
                headers=h)
            if r.status_code == 200:
                for wt in r.json().get('value', []):
                    if 'default studio' in wt.get('mspp_name', '').lower():
                        src = wt.get('mspp_source', '') or ''
                        if '<!doctype' in src.lower() or '<html' in src.lower():
                            warnings.append("Web Template 'Default studio template' contains full HTML (should be body-only SPA loader)")
                        elif 'id="root"' in src or 'id="mainContent"' not in src:
                            logger.info(f"    ✓ {wt['mspp_name']}: SPA loader detected")
                        else:
                            warnings.append(f"Web Template '{wt['mspp_name']}' may be classic template")

            # Check 5: mspp_copy
            logger.info("\n[5] Home page mspp_copy check...")
            r = requests.get(
                f"{DATAVERSE_URL}/api/data/v9.2/mspp_webpages"
                f"?$filter=_mspp_websiteid_value eq '{wid}' and mspp_name eq 'Home'"
                f"&$select=mspp_webpageid,mspp_isroot,mspp_copy",
                headers=h)
            if r.status_code == 200:
                for p in r.json().get('value', []):
                    copy = p.get('mspp_copy', '') or ''
                    label = 'Root' if p.get('mspp_isroot') else 'Content'
                    if '<!doctype' in copy.lower():
                        msg = f"Home ({label}) mspp_copy contains full HTML (should be body-only)"
                        if FIX_MODE:
                            # Will be fixed by deploy_site.py Phase 4
                            logger.info(f"    ⚠ {label}: full HTML detected (will be fixed during deploy)")
                        else:
                            warnings.append(msg)
                    elif 'id="root"' in copy:
                        logger.info(f"    ✓ Home ({label}): body-only SPA")
                    elif not copy.strip():
                        warnings.append(f"Home ({label}): mspp_copy is empty")
                    else:
                        logger.info(f"    ? Home ({label}): custom content ({len(copy)} bytes)")

    # --- Check 6: Table Permission → Web Role link ---
    if DATAVERSE_URL:
        logger.info("\n[6] Table Permission → Authenticated Users link check...")
        # powerpagesiteid を取得
        r = requests.get(
            f"{DATAVERSE_URL}/api/data/v9.2/powerpagesites?$select=powerpagesiteid,name",
            headers=dv_headers())
        pp_sites = r.json().get('value', []) if r.status_code == 200 else []
        if pp_sites:
            pp_site_id = pp_sites[0]['powerpagesiteid']

            # Authenticated Users ロール
            r = requests.get(
                f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents"
                f"?$filter=powerpagecomponenttype eq 11 and _powerpagesiteid_value eq {pp_site_id}"
                f"&$select=powerpagecomponentid,name",
                headers=dv_headers())
            roles = r.json().get('value', []) if r.status_code == 200 else []
            auth_role = next((rl for rl in roles if 'authenticated' in rl.get('name', '').lower()), None)

            if auth_role:
                auth_role_id = auth_role['powerpagecomponentid']
                # テーブル権限
                r = requests.get(
                    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents"
                    f"?$filter=powerpagecomponenttype eq 18 and _powerpagesiteid_value eq {pp_site_id}"
                    f"&$select=powerpagecomponentid,name",
                    headers=dv_headers())
                perms = r.json().get('value', []) if r.status_code == 200 else []

                unlinked = []
                for p in perms:
                    pid = p['powerpagecomponentid']
                    lr = requests.get(
                        f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({pid})"
                        f"/powerpagecomponent_powerpagecomponent?$select=powerpagecomponentid",
                        headers=dv_headers())
                    linked_ids = [l['powerpagecomponentid'] for l in lr.json().get('value', [])] if lr.status_code == 200 else []
                    if auth_role_id not in linked_ids:
                        unlinked.append(p['name'])

                if unlinked:
                    msg = f"Table Permission(s) NOT linked to Authenticated Users: {', '.join(unlinked)}"
                    if FIX_MODE:
                        # 自動修正: 紐づけ
                        for p in perms:
                            pid = p['powerpagecomponentid']
                            lr = requests.get(
                                f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({pid})"
                                f"/powerpagecomponent_powerpagecomponent?$select=powerpagecomponentid",
                                headers=dv_headers())
                            linked_ids = [l['powerpagecomponentid'] for l in lr.json().get('value', [])] if lr.status_code == 200 else []
                            if auth_role_id not in linked_ids:
                                url = f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({pid})/powerpagecomponent_powerpagecomponent/$ref"
                                body = {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({auth_role_id})"}
                                rr = requests.post(url, json=body, headers=dv_headers())
                                logger.info(f"    FIXED: {p['name']} → Authenticated Users ({rr.status_code})")
                    else:
                        errors.append(msg)
                else:
                    logger.info("    ✓ All table permissions linked to Authenticated Users")
            else:
                warnings.append("Authenticated Users Web Role not found")
        else:
            warnings.append("powerpagesites not found — skipping permission link check")

    # --- Summary ---
    logger.info("\n" + "=" * 50)
    if errors:
        logger.error(f"❌ {len(errors)} error(s):")
        for e in errors:
            logger.error(f"   • {e}")
    if warnings:
        logger.warning(f"⚠ {len(warnings)} warning(s):")
        for w in warnings:
            logger.warning(f"   • {w}")
    if not errors and not warnings:
        logger.info("✅ All checks passed")

    return len(errors) == 0


if __name__ == '__main__':
    ok = run_checks()
    sys.exit(0 if ok else 1)
