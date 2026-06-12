"""
初回バックフィル: 既存 conversationtranscript → geek_conversationsummary
================================================================
全トランスクリプトをパースして集計テーブルに書き込む。
transcriptid で冪等（既存レコードはスキップ）。
"""
import sys, os, json, time
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auth_helper import api_get, api_post, get_token, DATAVERSE_URL

PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek").strip()

OUTCOME_MAP = {
    "Resolved": 100000000,
    "Abandoned": 100000001,
    "Escalated": 100000002,
    "None": 100000003,
}

def get_entity_set_name(logical_name):
    meta = api_get(f"EntityDefinitions(LogicalName='{logical_name}')?$select=EntitySetName")
    return meta["EntitySetName"]

def fetch_all_transcripts():
    rows = []
    url = "conversationtranscripts?$select=conversationtranscriptid,name,conversationstarttime,metadata,content"
    res = api_get(url)
    rows.extend(res.get("value", []))
    # OData paging
    while "@odata.nextLink" in res:
        next_url = res["@odata.nextLink"].replace(f"{DATAVERSE_URL}/api/data/v9.2/", "")
        res = api_get(next_url)
        rows.extend(res.get("value", []))
    return rows

def parse_transcript(r):
    """1件のトランスクリプトをパースしてサマリー dict を返す"""
    meta = {}
    try:
        meta = json.loads(r.get("metadata") or "{}")
    except Exception:
        pass

    content = {}
    try:
        content = json.loads(r.get("content") or "{}")
    except Exception:
        pass

    acts = content.get("activities", [])
    ts_list = []
    user_msgs = 0
    bot_msgs = 0
    tool_events = 0
    outcome = None
    channel = None
    first_user_text = None
    tool_servers = set()

    for a in acts:
        tms = a.get("timestampMs")
        if tms:
            ts_list.append(tms)
        ch = a.get("channelId")
        if ch and not channel:
            channel = ch
        if a.get("valueType") == "ConversationInfo":
            outcome = (a.get("value") or {}).get("lastSessionOutcome")
        atype = a.get("type")
        if atype == "message":
            role = (a.get("from") or {}).get("role")
            if role == 1:
                user_msgs += 1
                if first_user_text is None:
                    first_user_text = (a.get("text") or "")[:4000]
            else:
                bot_msgs += 1
        if atype == "event":
            tool_events += 1
            val = a.get("value") or {}
            srv = (((val.get("initializationResult") or {}).get("serverInfo")) or {}).get("name")
            if srv:
                tool_servers.add(srv)

    dur = round((max(ts_list) - min(ts_list)) / 1000.0, 1) if ts_list else 0

    return {
        f"{PREFIX}_name": (r.get("name") or "")[:200],
        f"{PREFIX}_transcriptid": r.get("conversationtranscriptid", ""),
        f"{PREFIX}_botname": (meta.get("BotName") or "")[:200],
        f"{PREFIX}_botid": (meta.get("BotId") or "")[:100],
        f"{PREFIX}_starttime": r.get("conversationstarttime"),
        f"{PREFIX}_outcome": OUTCOME_MAP.get(outcome or "None", 100000003),
        f"{PREFIX}_channel": (channel or "")[:100],
        f"{PREFIX}_usermsgcount": user_msgs,
        f"{PREFIX}_botmsgcount": bot_msgs,
        f"{PREFIX}_tooleventcount": tool_events,
        f"{PREFIX}_durationsec": dur,
        f"{PREFIX}_toolservers": ", ".join(sorted(tool_servers))[:500],
        f"{PREFIX}_firstusertext": first_user_text or "",
    }


def main():
    print("=== Backfill: conversationtranscript -> geek_conversationsummary ===")
    eset = get_entity_set_name(f"{PREFIX}_conversationsummary")
    print(f"  Target EntitySet: {eset}")

    # 既存レコードの transcriptid を取得（冪等チェック用）
    existing = api_get(f"{eset}?$select={PREFIX}_transcriptid")
    existing_ids = {r[f"{PREFIX}_transcriptid"] for r in existing.get("value", [])}
    print(f"  Existing summaries: {len(existing_ids)}")

    transcripts = fetch_all_transcripts()
    print(f"  Transcripts to process: {len(transcripts)}")

    created = 0
    skipped = 0
    for r in transcripts:
        tid = r.get("conversationtranscriptid", "")
        if tid in existing_ids:
            skipped += 1
            continue
        summary = parse_transcript(r)
        try:
            api_post(eset, summary)
            created += 1
            print(f"    Created: {summary[f'{PREFIX}_botname']} | {summary[f'{PREFIX}_starttime']}")
        except Exception as e:
            print(f"    ERROR: {tid}: {e}")
        time.sleep(0.5)  # throttle

    print(f"\n  Done: created={created}, skipped={skipped}, total={len(transcripts)}")


if __name__ == "__main__":
    main()
