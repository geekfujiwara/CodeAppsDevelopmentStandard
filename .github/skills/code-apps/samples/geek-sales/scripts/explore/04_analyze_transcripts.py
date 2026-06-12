"""Step 4: 全トランスクリプトを解析し、分析可能な指標を抽出（結果はJSONに出力）"""
import sys, json
from pathlib import Path
from collections import Counter, defaultdict
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from auth_helper import api_get

OUT = Path(__file__).resolve().parent / "analysis_result.json"

def fetch_all_transcripts():
    rows, url = [], (
        "conversationtranscripts?$select=name,conversationstarttime,metadata,content,createdon&$top=200"
    )
    res = api_get(url)
    rows.extend(res.get("value", []))
    return rows

def analyze():
    rows = fetch_all_transcripts()
    summary = {
        "total_transcripts": len(rows),
        "per_bot": defaultdict(lambda: {"count":0, "outcomes":Counter(), "user_msgs":0, "bot_msgs":0,
                                         "tool_events":0, "durations":[], "sample_user_texts":[]}),
        "outcomes_total": Counter(),
        "channels": Counter(),
        "event_names": Counter(),
        "tool_servers": Counter(),
    }
    convo_records = []
    for r in rows:
        meta = {}
        try:
            meta = json.loads(r.get("metadata") or "{}")
        except Exception:
            pass
        bot = meta.get("BotName", "unknown")
        b = summary["per_bot"][bot]
        b["count"] += 1
        content = {}
        try:
            content = json.loads(r.get("content") or "{}")
        except Exception:
            pass
        acts = content.get("activities", [])
        ts_list = []
        user_texts = []
        outcome = None
        for a in acts:
            atype = a.get("type")
            tms = a.get("timestampMs")
            if tms: ts_list.append(tms)
            ch = a.get("channelId")
            if ch: summary["channels"][ch]+=1
            if a.get("valueType") == "ConversationInfo":
                outcome = (a.get("value") or {}).get("lastSessionOutcome")
            if atype == "message":
                role = (a.get("from") or {}).get("role")
                if role == 1:
                    b["user_msgs"]+=1
                    t = a.get("text")
                    if t: user_texts.append(t)
                else:
                    b["bot_msgs"]+=1
            if atype == "event":
                b["tool_events"]+=1
                ename = a.get("name")
                if ename: summary["event_names"][ename]+=1
                val = a.get("value") or {}
                srv = (((val.get("initializationResult") or {}).get("serverInfo")) or {}).get("name")
                if srv: summary["tool_servers"][srv]+=1
        if outcome:
            b["outcomes"][outcome]+=1
            summary["outcomes_total"][outcome]+=1
        if ts_list:
            dur = (max(ts_list)-min(ts_list))/1000.0
            b["durations"].append(round(dur,1))
        for t in user_texts[:1]:
            if len(b["sample_user_texts"]) < 5:
                b["sample_user_texts"].append(t[:120])
        convo_records.append({
            "bot": bot, "start": r.get("conversationstarttime"),
            "outcome": outcome, "user_msgs": len(user_texts),
            "activities": len(acts),
            "duration_sec": round((max(ts_list)-min(ts_list))/1000.0,1) if ts_list else None,
        })

    # Counter/defaultdict を通常dictへ
    out = {
        "total_transcripts": summary["total_transcripts"],
        "outcomes_total": dict(summary["outcomes_total"]),
        "channels": dict(summary["channels"]),
        "event_names": dict(summary["event_names"]),
        "tool_servers": dict(summary["tool_servers"]),
        "per_bot": {},
        "conversations": convo_records,
    }
    for bot, b in summary["per_bot"].items():
        durs = b["durations"]
        out["per_bot"][bot] = {
            "count": b["count"],
            "outcomes": dict(b["outcomes"]),
            "user_msgs": b["user_msgs"],
            "bot_msgs": b["bot_msgs"],
            "tool_events": b["tool_events"],
            "avg_duration_sec": round(sum(durs)/len(durs),1) if durs else None,
            "sample_user_texts": b["sample_user_texts"],
        }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    # コンソールには要約のみ(ASCII安全)
    print(f"total_transcripts={out['total_transcripts']}")
    print(f"outcomes={out['outcomes_total']}")
    print(f"channels={out['channels']}")
    print(f"tool_servers={out['tool_servers']}")
    print(f"bots={len(out['per_bot'])}")
    print(f"-> {OUT}")

if __name__ == "__main__":
    analyze()
