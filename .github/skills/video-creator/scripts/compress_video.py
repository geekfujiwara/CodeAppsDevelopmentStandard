#!/usr/bin/env python3
"""動画圧縮ヘルパー（ffmpeg。ffprobe があれば使い、無ければ ffmpeg -i の出力を解析する）。

使い方の例:
  python compress_video.py input.mp4 --info                # 情報だけ表示（圧縮しない。ffprobe 不要）
  python compress_video.py input.mov                       # 標準プリセット（CRF 28）
  python compress_video.py input.mp4 --target-mb 20        # 20MB 以下を狙う 2-pass
  python compress_video.py input.mp4 --preset 高画質
  python compress_video.py input.mp4 --target-mb 50 --screen --no-audio
  python compress_video.py input.mp4 --max-short-side 720 --fps 15 --allow-below-floor  # 明示指示時のみ

品質下限（既定）: 短辺 1080（1920x1080 / 1080x1920）・30fps。アスペクト比は常に維持。
  - 元が下限を超える（4K, 1440p, 60fps など）→ 短辺 1080・30fps まで縮小/間引き
  - 元が下限以下（720p, 24fps など）→ 元のまま（拡大・fps 増加はしない）
  - 下限未満（--max-short-side < 1080 / --fps < 30）は --allow-below-floor 指定時のみ許可
  - 目標サイズモードでも下限は維持し、ビットレートだけを下げる（自動で解像度/fps を落とさない）

出力は MP4 のみ。既定の出力名は <元のファイル名>_compressed.mp4。
最後に結果を JSON で標準出力へ書き出す（報告表の材料）。
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

def _ffmpeg():
    p = shutil.which("ffmpeg")
    if p:
        return p
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys.exit("ffmpeg が見つかりません。ffmpeg をインストールしてください。")


FFMPEG = _ffmpeg()
PRESETS = {"高画質": 23, "high": 23, "標準": 28, "standard": 28, "最小": 32, "small": 32}
SAFETY = 0.95          # 目標サイズに対する安全マージン
MIN_VIDEO_KBPS = 100   # 2-pass で使う映像ビットレートの絶対下限
FLOOR_SHORT_SIDE = 1080  # 既定の解像度下限（短辺）: 1920x1080 / 1080x1920
FLOOR_FPS = 30           # 既定の fps 下限
# 短辺 1080・30fps で実用的な画質を保つ映像ビットレートの目安（kbps）。これ未満は画質劣化を警告
FLOOR_QUALITY_KBPS = 1500


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    """ffprobe で情報を取得。ffprobe が無い環境では ffmpeg -i の出力を解析する。"""
    info = {"size_bytes": os.path.getsize(path), "duration": 0.0, "width": 0, "height": 0,
            "fps": 0.0, "bitrate_kbps": 0, "vcodec": "", "acodec": "", "has_audio": False,
            "rotation": 0}
    if shutil.which("ffprobe"):
        r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                 "-show_streams", path])
        if r.returncode == 0:
            d = json.loads(r.stdout)
            fmt = d.get("format", {})
            info["duration"] = float(fmt.get("duration") or 0)
            info["bitrate_kbps"] = int(int(fmt.get("bit_rate") or 0) / 1000)
            for s in d.get("streams", []):
                if s.get("codec_type") == "video" and not info["vcodec"]:
                    info["vcodec"] = s.get("codec_name", "")
                    info["width"], info["height"] = s.get("width", 0), s.get("height", 0)
                    num, _, den = (s.get("avg_frame_rate") or "0/1").partition("/")
                    info["fps"] = round(float(num) / float(den or 1), 2) if float(den or 1) else 0.0
                    rot = (s.get("tags") or {}).get("rotate")
                    for sd in s.get("side_data_list") or []:
                        if "rotation" in sd:
                            rot = sd["rotation"]
                    info["rotation"] = int(float(rot or 0)) % 360
                elif s.get("codec_type") == "audio" and not info["acodec"]:
                    info["acodec"] = s.get("codec_name", "")
                    info["has_audio"] = True
            return _display_dims(info)
    r = run([FFMPEG, "-hide_banner", "-i", path])
    t = r.stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", t)
    if m:
        info["duration"] = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])
    m = re.search(r"bitrate: (\d+) kb/s", t)
    if m:
        info["bitrate_kbps"] = int(m[1])
    m = re.search(r"Video: (\w+).*?, (\d{2,5})x(\d{2,5})", t)
    if m:
        info["vcodec"], info["width"], info["height"] = m[1], int(m[2]), int(m[3])
    m = re.search(r"([\d.]+) fps", t)
    if m:
        info["fps"] = float(m[1])
    m = re.search(r"Audio: (\w+)", t)
    if m:
        info["acodec"], info["has_audio"] = m[1], True
    m = re.search(r"rotation of (-?[\d.]+) degrees", t) or re.search(r"rotate\s*:\s*(-?\d+)", t)
    if m:
        info["rotation"] = int(float(m[1])) % 360
    return _display_dims(info)


def _display_dims(info):
    """回転メタデータ付き（スマホ縦動画など）は表示上の幅・高さに合わせる（ffmpeg は自動回転する）。"""
    if info.get("rotation") in (90, 270):
        info["width"], info["height"] = info["height"], info["width"]
    return info


def build_filters(info, max_short, fps_cap):
    """短辺基準で縮小（横・縦・その他の比率に対応、アスペクト比維持・偶数化）。拡大はしない。"""
    vf = []
    short = min(info["width"], info["height"])
    if max_short and short > max_short:
        c = int(max_short) // 2 * 2
        # 入力の向きに依存しない式（自動回転後の iw/ih で判定）。短辺を c、長辺は比率から偶数化
        vf.append(f"scale=w='if(gte(iw,ih),trunc(iw*{c}/ih/2)*2,{c})'"
                  f":h='if(gte(iw,ih),{c},trunc(ih*{c}/iw/2)*2)'")
    else:
        vf.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")  # 元の解像度のまま偶数化のみ
    if fps_cap and info["fps"] > fps_cap:            # fps は下げるだけ（増やさない）
        vf.append(f"fps={fps_cap:g}")
    vf.append("format=yuv420p")
    return ",".join(vf)


def encode(src, dst, info, args, video_kbps=None):
    codec = "libx265" if args.codec == "h265" else "libx264"
    common = ["-vf", build_filters(info, args.max_short_side, args.fps), "-c:v", codec,
              "-preset", args.speed]
    if args.screen and codec == "libx264":
        common += ["-tune", "stillimage" if args.static else "animation"]
    if codec == "libx265":
        common += ["-tag:v", "hvc1"]
    audio = ["-an"] if (args.no_audio or not info["has_audio"]) else \
        ["-c:a", "aac", "-b:a", f"{args.audio_kbps}k", "-ac", "2"]
    tail = ["-movflags", "+faststart", "-map_metadata", "-1"]

    if video_kbps is None:  # CRF モード
        crf = PRESETS[args.preset]
        if codec == "libx265":
            crf = min(crf + 4, 51)  # x265 は同等画質で CRF が高め
        cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", src] + common + \
              ["-crf", str(crf)] + audio + tail + [dst]
        r = run(cmd)
        if r.returncode:
            sys.exit(f"ffmpeg エラー: {r.stderr.strip()[-800:]}")
        return
    # 2-pass（目標サイズモード）
    rate = ["-b:v", f"{video_kbps}k", "-maxrate", f"{int(video_kbps * 1.5)}k",
            "-bufsize", f"{video_kbps * 2}k"]
    with tempfile.TemporaryDirectory() as tmp:
        log = os.path.join(tmp, "pass")
        if codec == "libx265":
            p1 = ["-x265-params", f"pass=1:stats={log}.log"]
            p2 = ["-x265-params", f"pass=2:stats={log}.log"]
        else:
            p1 = ["-pass", "1", "-passlogfile", log]
            p2 = ["-pass", "2", "-passlogfile", log]
        r = run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", src] + common +
                rate + p1 + ["-an", "-f", "mp4", os.devnull])
        if r.returncode:
            sys.exit(f"ffmpeg pass1 エラー: {r.stderr.strip()[-800:]}")
        r = run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", src] + common +
                rate + p2 + audio + tail + [dst])
        if r.returncode:
            sys.exit(f"ffmpeg pass2 エラー: {r.stderr.strip()[-800:]}")


def main():
    ap = argparse.ArgumentParser(description="動画を MP4 (H.264/H.265) に圧縮する")
    ap.add_argument("input")
    ap.add_argument("output", nargs="?", help="既定: <元の名前>_compressed.mp4")
    ap.add_argument("--target-mb", type=float, help="目標ファイルサイズ (MB)。指定時は 2-pass")
    ap.add_argument("--preset", default="標準", choices=list(PRESETS), help="CRF プリセット")
    ap.add_argument("--max-short-side", "--max-height", dest="max_short_side", type=int,
                    default=FLOOR_SHORT_SIDE,
                    help="短辺の上限（既定 1080 = 1920x1080 / 1080x1920）。縦動画も短辺で判定。"
                         "1080 未満は --allow-below-floor が必要（--max-height は互換用の別名で短辺として扱う）")
    ap.add_argument("--fps", type=float, default=FLOOR_FPS,
                    help="フレームレート上限（既定 30）。30 未満は --allow-below-floor が必要")
    ap.add_argument("--allow-below-floor", action="store_true",
                    help="ユーザーが明示的に指示した場合のみ: 1080p / 30fps 未満への縮小を許可")
    ap.add_argument("--no-audio", action="store_true", help="音声を削除")
    ap.add_argument("--audio-kbps", type=int, default=128, help="AAC ビットレート (96-128 推奨)")
    ap.add_argument("--codec", default="h264", choices=["h264", "h265"])
    ap.add_argument("--screen", action="store_true", help="画面録画向けチューニング")
    ap.add_argument("--static", action="store_true", help="--screen と併用: 静止画中心のスライド録画")
    ap.add_argument("--speed", default="medium", help="x264/x265 preset (slow/medium/fast)")
    ap.add_argument("--max-retries", type=int, default=2)
    ap.add_argument("--info", action="store_true", help="圧縮せず、サイズ・解像度・fps・長さを JSON で表示するだけ（ffprobe 不要）")
    args = ap.parse_args()
    if args.info:
        if not os.path.isfile(args.input):
            sys.exit(f"入力ファイルが見つかりません: {args.input}")
        print(json.dumps(probe(args.input), ensure_ascii=False, indent=2))
        return

    below = []
    if args.max_short_side is not None and args.max_short_side < FLOOR_SHORT_SIDE:
        below.append(f"--max-short-side {args.max_short_side}（下限 {FLOOR_SHORT_SIDE}）")
    if args.fps is not None and args.fps < FLOOR_FPS:
        below.append(f"--fps {args.fps:g}（下限 {FLOOR_FPS}）")
    if below and not args.allow_below_floor:
        sys.exit("品質下限（短辺 1080 = 1920x1080 / 1080x1920・30fps）を下回る指定です: " + "、".join(below) +
                 "。ユーザーの明示的な指示がある場合のみ --allow-below-floor を付けて実行してください。")
    if args.max_short_side is not None and args.max_short_side <= 0:
        sys.exit("--max-short-side は正の整数で指定してください。")
    if args.fps is not None and args.fps <= 0:
        sys.exit("--fps は正の値で指定してください。")

    if not os.path.isfile(args.input):
        sys.exit(f"入力ファイルが見つかりません: {args.input}")
    base = os.path.splitext(os.path.basename(args.input))[0]
    out = args.output or os.path.join(os.path.dirname(args.input) or ".", f"{base}_compressed.mp4")
    if not out.lower().endswith(".mp4"):
        out = os.path.splitext(out)[0] + ".mp4"
    if os.path.abspath(out) == os.path.abspath(args.input):
        sys.exit("出力先が入力と同じです。別名を指定してください。")

    src = probe(args.input)
    if src["duration"] <= 0:
        sys.exit("動画の長さを取得できませんでした（壊れたファイル、または動画ではない可能性）。")

    notes, attempts, quality_warning = [], 0, None
    if below:
        notes.append("ユーザー指示により品質下限（1080p / 30fps）未満を許可: " + "、".join(below))
    if args.target_mb:
        audio_k = 0 if (args.no_audio or not src["has_audio"]) else args.audio_kbps
        total_kbits = args.target_mb * 8 * 1000 * SAFETY  # MB=10^6 bytes 基準
        video_kbps = int(total_kbits / src["duration"] - audio_k)
        floor_kept = not args.allow_below_floor
        if floor_kept and video_kbps < FLOOR_QUALITY_KBPS:
            quality_warning = (f"目標サイズに対する映像ビットレートが約 {max(video_kbps, 0)} kbps で、"
                               "1080p / 30fps を維持すると画質が劣化する可能性があります。解像度・fps は維持し、"
                               "ビットレートのみ下げています。1080p / 30fps 未満への縮小は、ユーザーの指示がある場合のみ可能です"
                               "（音声削除 --no-audio も有効）。")
            notes.append(quality_warning)
        if video_kbps < MIN_VIDEO_KBPS:
            notes.append(f"映像ビットレートが {video_kbps} kbps と低すぎるため {MIN_VIDEO_KBPS} kbps で試行"
                         "（目標サイズに届かない可能性あり）。")
            video_kbps = MIN_VIDEO_KBPS
        while True:
            attempts += 1
            encode(args.input, out, src, args, video_kbps)
            size_mb = os.path.getsize(out) / 1e6
            if size_mb <= args.target_mb or attempts > args.max_retries:
                break
            video_kbps = max(MIN_VIDEO_KBPS, int(video_kbps * args.target_mb / size_mb * 0.92))
            notes.append(f"目標超過 ({size_mb:.2f}MB) のため {video_kbps} kbps で再エンコード")
    else:
        attempts = 1
        encode(args.input, out, src, args)

    dst = probe(out)
    target_ok = (dst["size_bytes"] / 1e6 <= args.target_mb) if args.target_mb else None
    dur_ok = abs(dst["duration"] - src["duration"]) <= max(1.0, src["duration"] * 0.01)
    playable = run([FFMPEG, "-v", "error", "-i", out, "-t", "5", "-f", "null", "-"]).returncode == 0
    if dst["size_bytes"] >= src["size_bytes"]:
        notes.append("出力が元より大きくなりました。元動画は既に十分圧縮されています（--preset 最小、--no-audio を検討。1080p / 30fps 未満への縮小はユーザーの指示がある場合のみ）。")

    result = {
        "input": args.input, "output": out, "mode": "target_size" if args.target_mb else "crf",
        "preset": None if args.target_mb else args.preset, "target_mb": args.target_mb,
        "before": src, "after": dst,
        "before_mb": round(src["size_bytes"] / 1e6, 2), "after_mb": round(dst["size_bytes"] / 1e6, 2),
        "reduction_pct": round((1 - dst["size_bytes"] / src["size_bytes"]) * 100, 1),
        "checks": {"target_size_ok": target_ok, "duration_ok": dur_ok, "playable": playable},
        "floor": {"short_side": FLOOR_SHORT_SIDE, "fps": FLOOR_FPS,
                  "allow_below_floor": bool(args.allow_below_floor),
                  "applied_max_short_side": args.max_short_side, "applied_fps_cap": args.fps},
        "resolution_before": f"{src['width']}x{src['height']} / {src['fps']:g}fps",
        "resolution_after": f"{dst['width']}x{dst['height']} / {dst['fps']:g}fps",
        "quality_warning": quality_warning,
        "attempts": attempts, "notes": notes,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if target_ok is False or not dur_ok or not playable:
        sys.exit(2)


if __name__ == "__main__":
    main()
