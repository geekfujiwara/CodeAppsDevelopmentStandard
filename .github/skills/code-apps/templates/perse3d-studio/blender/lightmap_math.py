"""ライトマップの後処理（bpy 非依存。通常の Python でテストできる）"""
from __future__ import annotations

import numpy as np


def masked_blur(a: np.ndarray, radius: int) -> np.ndarray:
    """UV の島（値 > 0 の画素）の中だけで箱ぼかしをかける。島の外は 0 のまま、島の縁は暗くならない（重みで割る）"""
    mask = (a > 0).astype(np.float32)

    def box(x: np.ndarray) -> np.ndarray:
        k = 2 * radius + 1
        for axis in (0, 1):
            c = np.cumsum(np.pad(x, [(radius + 1, radius) if i == axis else (0, 0) for i in range(2)], mode="edge"), axis=axis)
            x = (np.take(c, range(k, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - k), axis=axis)) / k
        return x

    num = box(a * mask)
    den = box(mask)
    out = np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0.0)
    return np.where(mask > 0, out, 0.0).astype(np.float32)
