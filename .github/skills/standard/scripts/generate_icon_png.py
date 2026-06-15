"""
PNG アイコン生成スクリプト — テーマ非依存の汎用プレースホルダー（4 点スパークル）

★ 本スクリプトはニュートラルな既定アイコンを生成する。
  テーマごとにモチーフ・配色を差し替えて使うこと（→ standard/references/icon-creation.md のアイコン画像提案フロー）。

Teams チャネル要件:
  - colorIcon: 192x192 PNG (< 100KB)
  - outlineIcon: 32x32 PNG (白い透明背景)
  - iconbase64: 任意サイズ PNG (data: prefix なし、生 Base64)
"""
import io
import base64
import math
from PIL import Image, ImageDraw


def _sparkle_points(cx: float, cy: float, radius: float, waist: float):
    """中心 (cx, cy) の 4 点スパークル（きらめき）ポリゴン座標を返す。"""
    return [
        (cx, cy - radius),
        (cx + waist, cy - waist),
        (cx + radius, cy),
        (cx + waist, cy + waist),
        (cx, cy + radius),
        (cx - waist, cy + waist),
        (cx - radius, cy),
        (cx - waist, cy - waist),
    ]


def draw_agent_icon(size: int, transparent_bg: bool = False, outline_only: bool = False) -> Image.Image:
    """テーマ非依存の汎用アイコン（角丸背景 + 4 点スパークル）を描画する。

    テーマ固有のアイコンにする場合は、この関数のモチーフ（スパークル）を
    目的に合わせた図形に差し替える（→ icon-creation.md）。
    """
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size  # shorthand

    if not transparent_bg:
        # 角丸正方形の背景（ブランドカラーに合わせて変更可）
        bg_color = (30, 41, 59, 255)  # #1e293b
        corner_r = int(s * 0.2)
        draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner_r, fill=bg_color)

    cx, cy = s / 2, s / 2

    if outline_only:
        # outlineIcon: 白い線画のみ（背景透明）
        main = _sparkle_points(cx, cy, s * 0.34, s * 0.09)
        draw.polygon(main, outline=(255, 255, 255, 255))
    else:
        # メインスパークル（白）
        main = _sparkle_points(cx, cy, s * 0.30, s * 0.08)
        draw.polygon(main, fill=(255, 255, 255, 240))
        # サブスパークル（アクセント・小）
        sub = _sparkle_points(s * 0.74, s * 0.28, s * 0.10, s * 0.028)
        draw.polygon(sub, fill=(251, 191, 36, 255))  # #fbbf24

    return img



def generate_icons():
    """3 種類の PNG アイコンを生成し、Base64 エンコードして返す"""
    
    # 1. iconbase64 用 (240x240)
    icon_main = draw_agent_icon(240, transparent_bg=False)
    
    # 2. colorIcon 用 (192x192)
    icon_color = draw_agent_icon(192, transparent_bg=False)
    
    # 3. outlineIcon 用 (32x32, 白い透明背景)
    icon_outline = draw_agent_icon(32, transparent_bg=True, outline_only=True)
    
    results = {}
    for name, img in [("main", icon_main), ("color", icon_color), ("outline", icon_outline)]:
        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        png_bytes = buf.getvalue()
        b64 = base64.b64encode(png_bytes).decode('ascii')
        results[name] = {
            'base64': b64,
            'size_bytes': len(png_bytes),
            'dimensions': img.size,
        }
        print(f"  {name}: {img.size[0]}x{img.size[1]}, {len(png_bytes)} bytes, base64 len={len(b64)}")
    
    return results


if __name__ == "__main__":
    print("=== PNG アイコン生成テスト ===")
    icons = generate_icons()
    
    # プレビュー用に PNG ファイル保存
    for name in ["main", "color", "outline"]:
        buf = base64.b64decode(icons[name]['base64'])
        with open(f"icon_{name}.png", 'wb') as f:
            f.write(buf)
        print(f"  Saved: icon_{name}.png ({icons[name]['size_bytes']} bytes)")
    
    # サイズ確認
    for name, info in icons.items():
        ok = "OK" if info['size_bytes'] < 100_000 else "TOO LARGE"
        print(f"  {name}: {info['size_bytes']:,} bytes [{ok}]")
