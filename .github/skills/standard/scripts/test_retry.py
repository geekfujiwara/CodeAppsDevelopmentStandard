"""retry_metadata のテスト"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests

# まず直接 try/except テスト
def fake():
    r = requests.Response()
    r.status_code = 400
    r._content = b'{"error":{"code":"0x80044363","message":"same name already exists"}}'
    r.encoding = "utf-8"
    r.url = "https://test.example.com/api"
    raise requests.exceptions.HTTPError("400 Client Error", response=r)

print("=== Direct try/except test ===")
try:
    fake()
except requests.HTTPError as e:
    print(f"  Caught! type={type(e).__name__}")
    err = str(e) + (e.response.text if e.response else "")
    print(f"  err contains 0x80044363: {'0x80044363' in err}")
    print(f"  err[:200]: {err[:200]}")

print("\n=== retry_metadata test ===")
from setup_dataverse import retry_metadata
try:
    result = retry_metadata(fake, "test-entity")
    print(f"  OK: result={result}")
except Exception as e:
    print(f"  FAIL: {type(e).__module__}.{type(e).__name__}: {e}")
