"""サンプル間取り図（1F / 2F）を生成する。解析器（src/lib/floorplan-analyzer.ts）の動作確認用。

壁は太線、窓は壁の途切れ + 細い二重線、ドアは途切れ + 細い円弧、家具・文字・寸法線は細線で描く
（解析器のモルフォロジー処理で細線が除去されることを確認するため）。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PPM = 80  # px / m
M = 70  # 余白 px
W, D = 9.1, 7.28
T = 0.15
OUT = Path(__file__).resolve().parents[1] / "public" / "samples"
FONT = ImageFont.truetype("C:/Windows/Fonts/meiryo.ttc", 15)
FONT_S = ImageFont.truetype("C:/Windows/Fonts/meiryo.ttc", 12)


def px(v: float) -> int:
    return int(round(M + v * PPM))


class Plan:
    def __init__(self) -> None:
        self.img = Image.new("RGB", (px(W) + M, px(D) + M + 10), "white")
        self.d = ImageDraw.Draw(self.img)

    def hwall(self, z: float, x0: float, x1: float, gaps=()):
        """水平壁（z 固定）。gaps = [(中心x, 幅, 種類)]"""
        cur = x0
        for cx, w, kind in sorted(gaps):
            a, b = cx - w / 2, cx + w / 2
            self.d.rectangle([px(cur), px(z), px(a), px(z + T)], fill="black")
            self.symbol(kind, a, b, z, horizontal=True)
            cur = b
        self.d.rectangle([px(cur), px(z), px(x1), px(z + T)], fill="black")

    def vwall(self, x: float, z0: float, z1: float, gaps=()):
        cur = z0
        for cz, w, kind in sorted(gaps):
            a, b = cz - w / 2, cz + w / 2
            self.d.rectangle([px(x), px(cur), px(x + T), px(a)], fill="black")
            self.symbol(kind, a, b, x, horizontal=False)
            cur = b
        self.d.rectangle([px(x), px(cur), px(x + T), px(z1)], fill="black")

    def symbol(self, kind: str, a: float, b: float, fixed: float, horizontal: bool):
        line = "#444"
        if kind == "window":
            for off in (0.05, 0.10):
                if horizontal:
                    self.d.line([px(a), px(fixed + off), px(b), px(fixed + off)], fill=line, width=1)
                else:
                    self.d.line([px(fixed + off), px(a), px(fixed + off), px(b)], fill=line, width=1)
        elif kind == "door":
            r = (b - a) * PPM
            if horizontal:
                box = [px(a) - r, px(fixed) - r, px(a) + r, px(fixed) + r]
                self.d.arc(box, 270, 360, fill=line, width=1)
                self.d.line([px(a), px(fixed), px(a), px(fixed) - r], fill=line, width=1)
            else:
                box = [px(fixed) - r, px(a) - r, px(fixed) + r, px(a) + r]
                self.d.arc(box, 0, 90, fill=line, width=1)
                self.d.line([px(fixed), px(a), px(fixed) + r, px(a)], fill=line, width=1)

    def label(self, x: float, z: float, text: str, sub: str = ""):
        self.d.text((px(x), px(z)), text, fill="#222", font=FONT, anchor="mm")
        if sub:
            self.d.text((px(x), px(z) + 18), sub, fill="#555", font=FONT_S, anchor="mm")

    def thin_rect(self, x0, z0, x1, z1):
        self.d.rectangle([px(x0), px(z0), px(x1), px(z1)], outline="#666", width=1)

    def dims(self, title: str):
        # 寸法線（細線）とタイトル
        y = px(D) + 30
        self.d.line([px(0), y, px(W), y], fill="#777", width=1)
        for x in (0, W):
            self.d.line([px(x), y - 6, px(x), y + 6], fill="#777", width=1)
        self.d.text(((px(0) + px(W)) // 2, y + 12), f"{int(W * 1000):,}", fill="#555", font=FONT_S, anchor="mm")
        x = px(W) + 30
        self.d.line([x, px(0), x, px(D)], fill="#777", width=1)
        self.d.text((M, 25), title, fill="#111", font=FONT, anchor="lm")
        self.d.text((px(W) - 10, 25), "N ↑", fill="#111", font=FONT, anchor="rm")

    def save(self, name: str):
        OUT.mkdir(parents=True, exist_ok=True)
        self.img.save(OUT / name)
        print("wrote", OUT / name)


def floor1():
    p = Plan()
    # 外壁
    p.hwall(0, 0, W, [(0.9, 0.8, "window"), (5.8, 1.6, "window")])
    p.hwall(D - T, 0, W, [(0.95, 0.85, "door"), (4.5, 1.8, "window"), (7.3, 1.8, "window")])
    p.vwall(0, T, D - T, [(4.6, 0.9, "window")])
    p.vwall(W - T, T, D - T, [(2.8, 1.2, "window")])
    # 間仕切り
    p.vwall(2.73, T, D - T, [(4.9, 0.8, "door")])
    p.hwall(3.64, T, 2.73, [(0.9, 0.75, "door")])
    p.vwall(1.82, T, 3.64, [(2.7, 0.7, "door")])
    # 家具・設備（細線）
    p.thin_rect(4.2, 0.4, 7.4, 1.05)  # キッチン
    p.thin_rect(5.0, 3.0, 6.6, 4.0)  # ダイニングテーブル
    p.thin_rect(0.35, 0.35, 1.6, 1.9)  # 浴槽
    p.thin_rect(3.2, 5.5, 5.2, 6.4)  # ソファ
    for i in range(6):  # 階段
        p.d.line([px(1.9), px(4.2 + i * 0.2), px(2.65), px(4.2 + i * 0.2)], fill="#777", width=1)
    p.label(5.9, 5.0, "LDK", "20.5帖")
    p.label(0.9, 2.3, "浴室")
    p.label(2.27, 1.6, "洗面")
    p.label(1.36, 6.3, "玄関")
    p.label(1.0, 4.6, "ホール")
    p.dims("1F 間取り図（サンプル）")
    p.save("floorplan-1f.png")


def floor2():
    p = Plan()
    p.hwall(0, 0, W, [(2.2, 1.2, "window"), (6.8, 1.2, "window")])
    p.hwall(D - T, 0, W, [(2.2, 1.6, "window"), (6.8, 1.6, "window")])
    p.vwall(0, T, D - T, [(1.6, 0.9, "window"), (5.9, 0.9, "window")])
    p.vwall(W - T, T, D - T, [(1.6, 0.9, "window"), (5.9, 0.9, "window")])
    p.hwall(3.185, T, W - T, [(3.6, 0.8, "door"), (5.6, 0.8, "door")])
    p.hwall(4.55, T, W - T, [(3.6, 0.8, "door"), (5.6, 0.8, "door")])
    p.vwall(4.55, T, 3.185)
    p.vwall(4.55, 4.55 + T, D - T)
    p.thin_rect(0.4, 0.4, 2.4, 2.4)  # ベッド
    p.thin_rect(6.0, 0.4, 7.4, 2.4)
    p.label(2.2, 1.6, "主寝室", "8帖")
    p.label(6.8, 1.6, "洋室1", "8帖")
    p.label(2.2, 5.9, "洋室2", "6帖")
    p.label(6.8, 5.9, "洋室3", "6帖")
    p.label(1.5, 3.85, "廊下")
    p.dims("2F 間取り図（サンプル）")
    p.save("floorplan-2f.png")


if __name__ == "__main__":
    floor1()
    floor2()
