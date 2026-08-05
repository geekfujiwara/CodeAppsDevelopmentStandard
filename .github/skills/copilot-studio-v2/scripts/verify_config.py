"""configuration（bots の JSON 文字列カラム）を PATCH する前の恒久チェック。

configuration を丸ごと上書きすると model / instructions / memory / greeting などが
まとめて消える。set_*.py はすべて GET → deep-merge → PATCH で更新するが、
マージ漏れを見逃さないよう **送信直前に** 更新前後を突き合わせる。

set_instructions.py / set_model.py / set_prompts.py から呼ばれ、正常系でも毎回動作する。
"""
from __future__ import annotations

# 更新対象として明示されない限り保持されるべきキー（agentSettings 配下）
GUARDED_SETTINGS = ("model", "instructions", "enableMemory", "greetingText", "conversationStarters")
# BotConfiguration の直下で保持されるべきキー
GUARDED_ROOT = ("$kind", "recognizer", "channels")


def assert_intact(before: dict, after: dict, *, changing: str) -> None:
    """更新対象 `changing` 以外の設定が欠落していないことを検証する。

    changing: 今回意図的に書き換えるキー（"instructions" / "model" / "prompts"）。
    """
    changed = {"prompts": ("greetingText", "conversationStarters")}.get(changing, (changing,))
    lost = [k for k in GUARDED_ROOT if k in before and k not in after]
    lost += [
        f"agentSettings.{k}"
        for k in GUARDED_SETTINGS
        if k not in changed
        and k in before.get("agentSettings", {})
        and k not in after.get("agentSettings", {})
    ]
    if lost:
        raise SystemExit(
            "❌ configuration のマージに失敗しています（PATCH 中止）。消えるキー: "
            + ", ".join(lost)
            + "\n   丸ごと上書きせず GET → deep-merge → PATCH になっているか確認してください。"
        )
