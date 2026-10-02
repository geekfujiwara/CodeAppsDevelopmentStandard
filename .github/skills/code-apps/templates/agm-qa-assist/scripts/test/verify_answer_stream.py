"""回答案の生成（ストリーム）を、アプリと同じ経路で確かめる。

1. コネクタのランタイム経由で GetAnswerTicket（利用者の委任 = on-behalf-of 接続）→ チケットと呼び出し先
2. Code Apps のオリジンで CORS の事前確認（OPTIONS）が通るか
3. チケットで POST /answer/stream → 最初の差分までの時間・全体の時間・本文の数値が根拠にあるか

チケットは表示しない。使い方: python scripts/test/verify_answer_stream.py [--mode draft|search] [--question "..."]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))
APP_ORIGIN = "https://<環境 ID の 16 進>.environment.api.powerplatformusercontent.com"


def load_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def numbers(text: str) -> set[str]:
    t = unicodedata.normalize("NFKC", text).replace(",", "")
    return {m.replace(" ", "") for m in re.findall(r"\d+(?:\.\d+)?\s*(?:億円|百万円|万円|円|%|ポイント|倍|名|人|件|社|か月|期|株)", t)}


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="draft", choices=["draft", "search"])
    parser.add_argument("--question", default="配当についてですが、来年以降も増配が続くのか、それから自社株買いの20億円というのは配当の代わりなのか、そこを確認したいです。")
    parser.add_argument("--qa", default="QA-002,QA-004")
    parser.add_argument("--ir", default="IR-003,IR-011,IR-001")
    args = parser.parse_args()
    load_env()
    import requests  # noqa: PLC0415
    from auth_helper import get_token  # noqa: PLC0415
    from _common import connection as connection_of, runtime_url  # noqa: PLC0415

    connection, connector = connection_of("AGM_SPEECH_CONNREF")
    runtime = runtime_url(connector)
    t0 = time.perf_counter()
    res = requests.get(f"{runtime}/{connection}/answer/ticket", headers={"Authorization": f"Bearer {get_token('https://apihub.azure.com/.default')}"}, timeout=60)
    ticket_ms = round((time.perf_counter() - t0) * 1000)
    res.raise_for_status()
    ticket = res.json()
    from _common import app_origin  # noqa: PLC0415

    APP_ORIGIN = app_origin()  # noqa: N806
    print(f"[ticket] {res.status_code} {ticket_ms} ms / endpoint={ticket['endpoint']} / {ticket['expiresInSeconds']} 秒有効（値は表示しない）")

    pre = requests.options(ticket["endpoint"], headers={"Origin": APP_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"}, timeout=30)
    print(f"[cors] OPTIONS {pre.status_code} allow-origin={pre.headers.get('Access-Control-Allow-Origin')} allow-headers={pre.headers.get('Access-Control-Allow-Headers')}")

    demo = ROOT / "data" / "demo"
    qa_all = {q["id"]: q for q in json.loads((demo / "qa-master.json").read_text(encoding="utf-8"))}
    ir_all = {d["id"]: d for d in json.loads((demo / "ir-documents.json").read_text(encoding="utf-8"))}
    qa = [qa_all[i] for i in args.qa.split(",") if i in qa_all]
    ir = [ir_all[i] for i in args.ir.split(",") if i in ir_all]
    body = {"mode": args.mode, "question": args.question, "qa": qa, "ir": ir}
    t0 = time.perf_counter()
    first = None
    text = ""
    done = {}
    with requests.post(ticket["endpoint"], json=body, headers={"Authorization": f"Ticket {ticket['ticket']}", "Origin": APP_ORIGIN}, stream=True, timeout=120) as r:
        print(f"[stream] {r.status_code} content-type={r.headers.get('Content-Type')} allow-origin={r.headers.get('Access-Control-Allow-Origin')}")
        chunks = 0
        for raw in r.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            event = json.loads(raw[5:])
            if event["type"] == "delta":
                first = first or round((time.perf_counter() - t0) * 1000)
                chunks += 1
                text += event["text"]
            elif event["type"] == "start":
                print(f"[stream] モデル: {event.get('model')}")
            elif event["type"] == "meta":
                print(f"[stream] サーバー内訳: トークン取得 {event['tokenMs']} ms / Azure OpenAI の応答開始 {event['headersMs']} ms")
            elif event["type"] in ("done", "error"):
                done = event
    total = round((time.perf_counter() - t0) * 1000)
    print(f"[stream] 最初の差分 {first} ms（クライアント計測）/ 全体 {total} ms / 差分 {chunks} 回 / サーバー計測 {done}")
    print("----- 生成された本文 -----")
    print(text)
    source = " ".join([q["answer"] for q in qa] + [d["text"] for d in ir])
    unknown = sorted(numbers(text) - numbers(source))
    cited = sorted(set(re.findall(r"\[((?:QA|IR)-\d+)\]", text)))
    print("----- 検査 -----")
    print(f"根拠に無い数値: {unknown or 'なし'} / 引用した ID: {cited}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
