"""Step 3: 実データのサンプリング"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from auth_helper import api_get

def dump_transcripts():
    print("="*70)
    print("■ conversationtranscript サンプル（3件）")
    res = api_get(
        "conversationtranscripts?$top=3"
        "&$select=name,conversationstarttime,schematype,schemaversion,metadata,content"
    )
    for r in res.get("value", []):
        print(f"\n--- name={r.get('name')} | start={r.get('conversationstarttime')} | bot={r.get('bot_conversationtranscriptidname')}")
        print(f"    schematype={r.get('schematype')} schemaversion={r.get('schemaversion')}")
        md = r.get("metadata")
        if md:
            print(f"    metadata: {md[:500]}")
        content = r.get("content") or ""
        try:
            parsed = json.loads(content)
            print(f"    content(JSON keys): {list(parsed.keys()) if isinstance(parsed, dict) else type(parsed)}")
            print(f"    content(先頭1500字):\n{json.dumps(parsed, ensure_ascii=False, indent=1)[:1500]}")
        except Exception:
            print(f"    content(raw 800字): {content[:800]}")

def dump_messages():
    print("\n"+"="*70)
    print("■ agentconversationmessage サンプル（6件）")
    res = api_get("agentconversationmessages?$top=6")
    for r in res.get("value", []):
        print(f"\n--- sender={r.get('messagesender')} | regarding={r.get('_regardingobjectid_value')} | {r.get('createdon')}")
        print(f"    name: {r.get('name')}")
        print(f"    message: {(r.get('message') or '')[:400]}")
        ctx = r.get("messagecontext")
        if ctx:
            print(f"    context: {ctx[:300]}")

def dump_bots():
    print("\n"+"="*70)
    print("■ bot（エージェント）一覧 上位20件")
    res = api_get(
        "bots?$top=20&$orderby=modifiedon desc"
        "&$select=name,schemaname,statecode,createdon,modifiedon,publishedon,language"
    )
    for r in res.get("value", []):
        print(f"  {r.get('name'):40s} | state={r.get('statecode')} | published={r.get('publishedon')}")

def main():
    dump_transcripts()
    dump_messages()
    dump_bots()

if __name__ == "__main__":
    main()
