"""
PNG アイコン生成 — ニュースレポーター（📊 新聞 + メール配信モチーフ）

Teams チャネル要件:
  - colorIcon: 192x192 PNG (< 100KB)
  - outlineIcon: 32x32 PNG (白い透明背景)
  - iconbase64: 任意サイズ PNG (data: prefix なし、生 Base64)
"""
import io
import base64
from PIL import Image, ImageDraw


def draw_news_icon(size: int, transparent_bg: bool = False, outline_only: bool = False) -> Image.Image:
    """ニュースレポーターアイコンを描画（折りたたまれた新聞 + 稲妻 + メール）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size

    if not transparent_bg:
        # 背景: 濃い青のグラデーション風
        corner_r = int(s * 0.2)
        draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner_r, fill=(15, 23, 42, 255))
        # 薄い青のオーバーレイ（右下）
        for i in range(int(s * 0.3)):
            alpha = int(40 * (i / (s * 0.3)))
            draw.line([(s - i, s - 1), (s - 1, s - i)], fill=(30, 64, 175, alpha), width=1)

    cx, cy = s / 2, s / 2
    color_white = (255, 255, 255, 255) if not outline_only else (255, 255, 255, 230)
    color_accent = (59, 130, 246, 255)   # #3b82f6 明るい青
    color_amber = (251, 191, 36, 255)     # #fbbf24 アンバー

    if outline_only:
        # アウトラインは白い新聞アイコンのシンプルな形
        m = s * 0.15
        draw.rounded_rectangle([m, m + s * 0.05, s - m, s - m - s * 0.05],
                               radius=int(s * 0.08), outline=color_white, width=max(1, int(s * 0.06)))
        # 見出し線
        lm = s * 0.28
        draw.line([(lm, cy - s * 0.08), (s - lm, cy - s * 0.08)], fill=color_white, width=max(1, int(s * 0.05)))
        draw.line([(lm, cy + s * 0.08), (s - lm, cy + s * 0.08)], fill=color_white, width=max(1, int(s * 0.04)))
    else:
        # ── 新聞の紙面（メインの白い長方形） ──
        paper_l = s * 0.18
        paper_r = s * 0.82
        paper_t = s * 0.20
        paper_b = s * 0.78
        draw.rounded_rectangle([paper_l, paper_t, paper_r, paper_b],
                               radius=int(s * 0.04), fill=(241, 245, 249, 240))

        # ── ヘッダー帯（青いグラデーション風） ──
        header_b = paper_t + s * 0.14
        draw.rounded_rectangle([paper_l, paper_t, paper_r, header_b],
                               radius=int(s * 0.04), fill=color_accent)
        # 角丸の下部を四角く塗る
        draw.rectangle([paper_l, paper_t + s * 0.06, paper_r, header_b], fill=color_accent)

        # ── ヘッダーテキスト風の白い線 ──
        hl_y = paper_t + s * 0.07
        draw.line([(paper_l + s * 0.06, hl_y), (paper_r - s * 0.06, hl_y)],
                  fill=color_white, width=max(1, int(s * 0.025)))

        # ── 記事本文の行（灰色の線） ──
        line_color = (148, 163, 184, 180)  # slate-400
        line_start_x = paper_l + s * 0.06
        line_end_x = paper_r - s * 0.06
        line_y_base = header_b + s * 0.06
        line_gap = s * 0.065
        for i in range(5):
            y = line_y_base + i * line_gap
            end_x = line_end_x if i < 4 else line_end_x - s * 0.15
            if y < paper_b - s * 0.04:
                draw.line([(line_start_x, y), (end_x, y)],
                          fill=line_color, width=max(1, int(s * 0.015)))

        # ── 稲妻アクセント（右下に小さく） ──
        bx = s * 0.72
        by = s * 0.58
        bs = s * 0.14  # bolt size
        bolt_points = [
            (bx, by),
            (bx - bs * 0.4, by + bs * 0.55),
            (bx - bs * 0.1, by + bs * 0.55),
            (bx - bs * 0.3, by + bs),
            (bx + bs * 0.15, by + bs * 0.40),
            (bx - bs * 0.1, by + bs * 0.40),
        ]
        draw.polygon(bolt_points, fill=color_amber)

        # ── 📊 グラフアクセント（左下に小さく） ──
        gx = paper_l + s * 0.08
        gy = paper_b - s * 0.06
        bar_w = max(2, int(s * 0.03))
        bar_heights = [s * 0.06, s * 0.10, s * 0.08, s * 0.13]
        for i, bh in enumerate(bar_heights):
            x = gx + i * (bar_w + max(1, int(s * 0.015)))
            bar_color = color_accent if i % 2 == 0 else (96, 165, 250, 220)
            draw.rectangle([x, gy - bh, x + bar_w, gy], fill=bar_color)

    return img


def to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def generate_news_icons() -> dict:
    """ニュースアイコンを 3 サイズ生成して dict で返す"""
    main_img = draw_news_icon(240)
    color_img = draw_news_icon(192)
    outline_img = draw_news_icon(32, transparent_bg=True, outline_only=True)

    return {
        "main": {
            "base64": to_base64(main_img),
            "dimensions": "240x240",
            "size_bytes": len(to_base64(main_img)),
        },
        "color": {
            "base64": to_base64(color_img),
            "dimensions": "192x192",
            "size_bytes": len(to_base64(color_img)),
        },
        "outline": {
            "base64": to_base64(outline_img),
            "dimensions": "32x32",
            "size_bytes": len(to_base64(outline_img)),
        },
    }


if __name__ == "__main__":
    icons = generate_news_icons()
    for k, v in icons.items():
        print(f"{k}: {v['dimensions']}, {v['size_bytes']} chars base64")
    # プレビュー画像を保存
    main_img = draw_news_icon(240)
    main_img.save("news_icon_preview.png")
    print("Saved news_icon_preview.png")
