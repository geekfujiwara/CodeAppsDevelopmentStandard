"""
PNG アイコン生成スクリプト — シールド＋ライトニング（パターン A）

Teams チャネル要件:
  - colorIcon: 192x192 PNG (< 100KB)
  - outlineIcon: 32x32 PNG (白い透明背景)
  - iconbase64: 任意サイズ PNG (data: prefix なし、生 Base64)
"""
import io
import base64
import math
from PIL import Image, ImageDraw

def draw_shield_bolt(size: int, transparent_bg: bool = False, outline_only: bool = False) -> Image.Image:
    """シールド＋ライトニングアイコンを描画する"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    s = size  # shorthand
    margin = s * 0.08
    
    if not transparent_bg:
        # 濃紺グラデーション風の角丸背景
        # Pillow の rounded_rectangle を使用
        bg_color = (30, 41, 59, 255)  # #1e293b
        corner_r = int(s * 0.2)
        draw.rounded_rectangle(
            [0, 0, s - 1, s - 1],
            radius=corner_r,
            fill=bg_color
        )
    
    # シールド座標
    cx, cy = s / 2, s / 2
    shield_top = s * 0.16
    shield_bottom = s * 0.86
    shield_left = s * 0.28
    shield_right = s * 0.72
    shield_mid_y = s * 0.52
    
    # シールドパス（ポリゴン近似）
    shield_points = []
    # 上部: 頂点
    shield_points.append((cx, shield_top))
    # 右上のカーブ
    shield_points.append((shield_right, shield_top + s * 0.10))
    # 右側ストレート
    shield_points.append((shield_right, shield_mid_y))
    # 右下のカーブ（下に絞る）
    shield_points.append((shield_right - s * 0.02, shield_mid_y + s * 0.12))
    shield_points.append((cx + s * 0.12, shield_bottom - s * 0.10))
    # 底部頂点
    shield_points.append((cx, shield_bottom))
    # 左下のカーブ
    shield_points.append((cx - s * 0.12, shield_bottom - s * 0.10))
    shield_points.append((shield_left + s * 0.02, shield_mid_y + s * 0.12))
    # 左側ストレート
    shield_points.append((shield_left, shield_mid_y))
    # 左上のカーブ
    shield_points.append((shield_left, shield_top + s * 0.10))
    
    if outline_only:
        # アウトラインのみ（白、透明背景）
        draw.polygon(shield_points, outline=(255, 255, 255, 255), fill=None)
        # 稲妻（白）
        bolt_color = (255, 255, 255, 255)
    else:
        # シールド塗りつぶし
        shield_color = (226, 232, 240, 240)  # #e2e8f0 with slight transparency
        draw.polygon(shield_points, fill=shield_color, outline=(148, 163, 184, 100))
        bolt_color = (251, 191, 36, 255)  # #fbbf24
    
    # ライトニングボルト
    bolt_cx = cx
    bolt_top = shield_top + s * 0.14
    bolt_bottom = shield_bottom - s * 0.12
    bolt_mid = (bolt_top + bolt_bottom) / 2
    
    bolt_points = [
        (bolt_cx + s * 0.05, bolt_top),       # 右上
        (bolt_cx - s * 0.10, bolt_mid),         # 左中
        (bolt_cx + s * 0.02, bolt_mid),         # 中点上
        (bolt_cx - s * 0.05, bolt_bottom),      # 左下
        (bolt_cx + s * 0.12, bolt_mid - s * 0.02),  # 右中
        (bolt_cx + s * 0.00, bolt_mid - s * 0.02),  # 中点下
    ]
    draw.polygon(bolt_points, fill=bolt_color)
    
    return img


def generate_icons():
    """3 種類の PNG アイコンを生成し、Base64 エンコードして返す"""
    
    # 1. iconbase64 用 (240x240)
    icon_main = draw_shield_bolt(240, transparent_bg=False)
    
    # 2. colorIcon 用 (192x192)
    icon_color = draw_shield_bolt(192, transparent_bg=False)
    
    # 3. outlineIcon 用 (32x32, 白い透明背景)
    icon_outline = draw_shield_bolt(32, transparent_bg=True, outline_only=True)
    
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
