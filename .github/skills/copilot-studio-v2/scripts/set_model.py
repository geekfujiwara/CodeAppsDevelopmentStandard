"""既存の cliagent エージェントのモデル系列（series）を変更する。

configuration は 1 つの JSON 文字列カラムなので、GET → deep-merge → PATCH で更新する
（丸ごと上書きすると instructions / channels / skills 設定が消える）。
bots の PATCH は name カラムを同送しないと 0x80040265 で失敗する。

.env パラメータ:
  AGENT_BOTID          対象 botid（省略時は cwd の agent_botid.txt）
  AGENT_MODEL_SERIES   モデル選択（既定: Auto。固定モデルは明示指定）
  AGENT_AUTO_MODEL_CONFIG_FILE  UI で Auto を保存して取得した構成 JSON

実行:
  python set_model.py                     # .env の AGENT_MODEL_SERIES を適用
  python set_model.py claude-opus-5       # 引数で直接指定
  python set_model.py --show              # 現在値の確認のみ
  python set_model.py --capture-auto <file> --confirm-ui-auto  # UI 保存済み Auto の読取
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402
from verify_config import assert_intact  # noqa: E402
from model_policy import apply_model, resolve_model  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

# 実機で設定して UI の Model ドロップダウンに正常表示されることを確認した値
# 現行の命名規則はベンダーのモデル ID そのまま（小文字 + ハイフン）
VERIFIED_SERIES = ("claude-opus-5",)
# 旧命名。作成自体は通るが UI で「モデルは廃止されました」と表示される
DEPRECATED_SERIES = ("Sonnet46", "Sonnet5", "Opus5", "GPT4o")


def resolve_bot_id() -> str:
    bot_id = os.getenv("AGENT_BOTID", "").strip()
    if bot_id:
        return bot_id
    path = Path("agent_botid.txt")
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    sys.exit("AGENT_BOTID が未設定で agent_botid.txt もありません。")


def main() -> None:
    args = [a for a in sys.argv[1:] if a]
    show_only = "--show" in args
    positional = [a for a in args if not a.startswith("--")]

    bot_id = resolve_bot_id()
    bot = api_get(f"bots({bot_id})?$select=name,configuration")
    config = json.loads(bot["configuration"])
    current_model = config.get("agentSettings", {}).get("model")
    current = (current_model or {}).get("series")
    print(f"対象: {bot['name']} ({bot_id})")
    print(f"現在のモデル系列: {current}")
    if current in DEPRECATED_SERIES:
        print("  ⚠️ 旧命名です。UI で「モデルは廃止されました」と表示されます。")

    if show_only:
        return

    if "--capture-auto" in args:
        i = args.index("--capture-auto")
        if "--confirm-ui-auto" not in args or i + 1 >= len(args) or args[i + 1].startswith("--"):
            sys.exit("--capture-auto <file> --confirm-ui-auto が必要です。UI で Auto を保存した対象 Bot だけを指定してください。")
        destination = Path(args[i + 1])
        record = {"selection": "Auto", "model": current_model}
        with destination.open("x", encoding="utf-8") as stream:
            json.dump(record, stream, ensure_ascii=False, indent=2)
        print(f"Auto の UI 保存構成を記録しました: {destination}（変更・公開なし）")
        return

    series = positional[0] if positional else os.getenv("AGENT_MODEL_SERIES", "").strip() or "Auto"
    try:
        desired_model = resolve_model(series, os.getenv("AGENT_AUTO_MODEL_CONFIG_FILE", ""))
    except (ValueError, OSError) as exc:
        sys.exit(str(exc))
    if desired_model == current_model:
        print("変更なし。")
        return
    if series.casefold() != "auto" and series not in VERIFIED_SERIES:
        print(f"  ℹ️ '{series}' は未検証の値です。設定後に UI の Model 表示を確認してください。")

    settings = config.setdefault("agentSettings", {})
    # Preserve unrelated model options when changing an explicit series.
    if series.casefold() != "auto":
        desired_model = {**(current_model or {}), **desired_model}
    apply_model(settings, desired_model)
    assert_intact(json.loads(bot["configuration"]), config, changing="model")
    body = {"name": bot["name"], "configuration": json.dumps(config, ensure_ascii=False)}
    r = get_session().patch(f"{API}/bots({bot_id})", json=body)
    if r.status_code not in (200, 204):
        print("更新失敗:", r.status_code, r.text[:1000], file=sys.stderr)
        sys.exit(1)

    after = json.loads(api_get(f"bots({bot_id})?$select=configuration")["configuration"])
    if after.get("agentSettings", {}).get("model") != desired_model:
        sys.exit("モデル設定の読み戻しが一致しません。公開せず UI を確認してください。")
    print(f"✅ モデル選択を更新: {current_model} → {desired_model}（選択: {series}）")
    print("   反映には再公開が必要です: python publish_agent.py")


if __name__ == "__main__":
    main()
