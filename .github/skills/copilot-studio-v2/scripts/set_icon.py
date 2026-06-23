"""
Copilot Studio v2 (cliagent) エージェントにアイコンを API で登録する。
================================================================================
Pillow でアイコン PNG を生成し、3 か所へ登録する:
  - bots.iconbase64                         … 240x240（生 base64。data: 接頭辞なし）
  - applicationmanifestinformation.teams.colorIcon   … 192x192
  - applicationmanifestinformation.teams.outlineIcon … 32x32（白・透明背景）

★ハマりどころ: bots を PATCH する際は name 列を必ず含める（無いと 0x80040265 エラー）。

アイコン意匠（汎用）: 角丸の単色背景＋中央に頭文字（ICON_TEXT）。任意で右下にアクセントの
丸バッジを描く。色・頭文字は .env で差し替え可能。独自意匠にしたい場合は draw_icon() を
プロジェクト側で上書きする（references/icon-and-publish.md 参照）。

.env パラメータ:
  AGENT_BOTID / AGENT_SCHEMA   対象エージェント（未指定なら agent_botid.txt）
  ICON_TEXT                    頭文字（既定: エージェント名の先頭1文字）
  ICON_BG_COLOR                背景色 HEX（既定: #2563EB）
  ICON_ACCENT_COLOR            アクセント色 HEX（既定: 空＝バッジ無し）

実行: python set_icon.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

ICON_TEXT = os.getenv("ICON_TEXT", "").strip()
BG_HEX = os.getenv("ICON_BG_COLOR", "#2563EB").strip()
ACCENT_HEX = os.getenv("ICON_ACCENT_COLOR", "").strip()
WHITE = (255, 255, 255, 255)


def _hex_rgba(h: str, default=(37, 99, 235)) -> tuple:
    h = (h or "").lstrip("#")
    if len(h) == 6:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    return (*default, 255)


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)  # Pillow >= 10
    except TypeError:
        return ImageFont.load_default()


def draw_icon(size: int, text: str, *, transparent_bg: bool = False, outline_only: bool = False) -> Image.Image:
    """角丸背景＋中央頭文字＋任意のアクセントバッジ。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size
    bg = _hex_rgba(BG_HEX)
    accent = _hex_rgba(ACCENT_HEX, default=(34, 197, 94)) if ACCENT_HEX else None
    fg = WHITE

    if not (transparent_bg or outline_only):
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=bg)

    # 中央の頭文字
    glyph = (text or "A")[:2]
    font = _font(int(s * (0.5 if len(glyph) == 1 else 0.38)))
    try:
        bbox = d.textbbox((0, 0), glyph, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        tx = (s - tw) / 2 - bbox[0]
        ty = (s - th) / 2 - bbox[1] - s * 0.02
    except Exception:
        tw = th = s * 0.4
        tx, ty = (s - tw) / 2, (s - th) / 2
    if outline_only:
        d.text((tx, ty), glyph, font=font, fill=fg, stroke_width=max(1, int(s * 0.03)), stroke_fill=fg)
    else:
        d.text((tx, ty), glyph, font=font, fill=fg)

    # 右下アクセントバッジ
    if accent and not outline_only:
        r = s * 0.20
        bx, by = s * 0.76, s * 0.76
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=accent, outline=WHITE, width=max(1, int(s * 0.02)))
        chk = [(bx - r * 0.45, by + r * 0.02), (bx - r * 0.08, by + r * 0.38), (bx + r * 0.50, by - r * 0.40)]
        d.line(chk, fill=fg, width=max(2, int(s * 0.05)), joint="curve")

    return img


def to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def resolve_bot() -> str:
    bot = os.getenv("AGENT_BOTID", "").strip()
    if bot and re.fullmatch(r"[0-9a-fA-F-]{36}", bot):
        return bot
    schema = os.getenv("AGENT_SCHEMA", "").strip()
    if schema:
        res = api_get(f"bots?$select=botid&$filter=schemaname eq '{schema}'").get("value")
        if res:
            return res[0]["botid"]
    bf = Path("agent_botid.txt")
    if bf.exists():
        return bf.read_text(encoding="utf-8").strip()
    print("Error: AGENT_BOTID / AGENT_SCHEMA / agent_botid.txt のいずれかが必要です。", file=sys.stderr)
    sys.exit(1)


def set_icon(sess, bot_id: str, text: str | None = None) -> None:
    name = api_get(f"bots({bot_id})?$select=name")["name"]
    text = (text or ICON_TEXT or name[:1]).upper()
    icon_main = to_b64(draw_icon(240, text))
    icon_color = to_b64(draw_icon(192, text))
    icon_outline = to_b64(draw_icon(32, text, transparent_bg=True, outline_only=True))

    r = sess.patch(f"{API}/bots({bot_id})", json={"name": name, "iconbase64": icon_main})
    print(f"  iconbase64(240): {r.status_code}")

    bd = api_get(f"bots({bot_id})?$select=name,applicationmanifestinformation")
    ami = json.loads(bd.get("applicationmanifestinformation") or "{}")
    teams = ami.setdefault("teams", {})
    teams["colorIcon"] = icon_color
    teams["outlineIcon"] = icon_outline
    teams.setdefault("accentColor", BG_HEX)
    r = sess.patch(f"{API}/bots({bot_id})",
                   json={"name": name, "applicationmanifestinformation": json.dumps(ami)})
    print(f"  Teams colorIcon/outlineIcon: {r.status_code}")


def main() -> None:
    bot_id = resolve_bot()
    sess = get_session()
    print(f"アイコン登録: bot={bot_id}")
    set_icon(sess, bot_id)
    print("✅ 完了")


if __name__ == "__main__":
    main()
