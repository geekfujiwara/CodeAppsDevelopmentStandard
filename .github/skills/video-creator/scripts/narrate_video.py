"""Add word-timed narration and original-style captions to a clean demo edit."""
import argparse
import asyncio
import hashlib
import json
import math
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from common import ffmpeg, load_font, probe, resolve_font, wrap_text
from subtitle_style import subtitle_image
from verify_narrated_video import verify_video


def run_ffmpeg(args):
    result = subprocess.run(
        [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", *map(str, args)],
        capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr}")
    return result


def normalized(text):
    return "".join(char for char in unicodedata.normalize("NFKC", text).casefold()
                   if char.isalnum())


def read_script(path):
    script = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    maximum = script.get("max_duration", 90)
    if type(maximum) not in (int, float) or not math.isfinite(maximum) or maximum <= 0:
        raise ValueError("max_duration must be a positive finite number.")
    if not re.fullmatch(r"[a-z]{3}", script.get("language", "eng")):
        raise ValueError("language must be a three-letter MP4 language code.")
    voice = script.get("voice", "en-US-AriaNeural")
    if not isinstance(voice, str) or not voice.strip():
        raise ValueError("voice must be a speech-provider voice name.")
    workflow = script.get("workflow", [])
    if not isinstance(workflow, list) or (workflow and (
            not 2 <= len(workflow) <= 6 or
            any(not isinstance(item, dict) or
                any(not isinstance(item.get(key), str) or not item[key].strip()
                    for key in ("name", "purpose")) for item in workflow))):
        raise ValueError("workflow needs two to six named steps with plain-language purposes.")
    scenes = script.get("scenes", [])
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("At least one narration scene is required.")
    cursor = 0.0
    for scene in scenes:
        if not isinstance(scene, dict) or not all(key in scene for key in ("start", "duration", "text")):
            raise ValueError("Each scene needs start, duration, and text.")
        start, duration = scene["start"], scene["duration"]
        if (not all(type(value) in (int, float) and math.isfinite(value)
                    for value in (start, duration)) or duration <= .3 or
                not math.isclose(start, cursor, abs_tol=1e-6)):
            raise ValueError("Scene times must be finite, contiguous, and longer than 0.3 seconds.")
        text = scene["text"]
        if not isinstance(text, str) or not normalized(text) or text != " ".join(text.split()):
            raise ValueError("Scene text must be nonempty, with single spaces and no line breaks.")
        if scene.get("position", "bottom") not in ("top", "bottom"):
            raise ValueError("Caption position must be top or bottom.")
        step = scene.get("step")
        if step is not None and (type(step) is not int or not 1 <= step <= len(workflow)):
            raise ValueError("Scene step must be null or a one-based workflow step number.")
        cursor += duration
    if cursor > maximum:
        raise ValueError(f"Script lasts {cursor:.3f}s, exceeding max_duration={maximum}.")
    return script


def text_groups(text, font):
    words = list(re.finditer(r"\S+", text))
    groups, start = [], 0
    for index, word in enumerate(words):
        begin = words[start].start()
        current = text[begin:word.end()]
        following = text[begin:words[index + 1].end()] if index + 1 < len(words) else current
        sentence = word.group().endswith((".", "?", "!"))
        clause = word.group().endswith(",") and index - start >= 6 and len(words) - index > 4
        too_long = len(wrap_text(following, font, 1920 * .78 - 60)) > 2 or len(following) > 105
        if sentence or clause or too_long or index == len(words) - 1:
            image = subtitle_image(current, font)
            if image.width > 1920 * .78 or image.height > 138:
                raise ValueError(f"Caption cannot fit the original two-line style: {current}")
            groups.append((begin, word.end(), current))
            start = index + 1
    if " ".join(group[2] for group in groups) != text:
        raise ValueError("Caption grouping changed the narration text.")
    return groups


def timed_cues(scene, words, tempo, font):
    text = scene["text"]
    if normalized("".join(word["text"] for word in words)) != normalized(text):
        raise ValueError("Speech word metadata does not match the canonical text.")
    spans, cursor, previous_end = [], 0, 0
    for word in words:
        offset, duration = word["offset"], word["duration"]
        if (not all(isinstance(value, (int, float)) and math.isfinite(value)
                    for value in (offset, duration)) or offset < previous_end or duration <= 0):
            raise ValueError("Speech word boundaries are invalid or overlap.")
        previous_end = offset + duration
        length = len(normalized(word["text"]))
        if length:
            spans.append((cursor, cursor + length, word))
        cursor += length
    if not spans:
        raise ValueError("No spoken words were returned.")
    speech_end = .15 + previous_end / 10_000_000 / tempo
    if speech_end > scene["duration"] - .08:
        raise ValueError("Speech would be clipped by the scene ending; shorten the shared script.")
    cues = []
    for begin, end, content in text_groups(text, font):
        left, right = len(normalized(text[:begin])), len(normalized(text[:end]))
        selected = [word for first, last, word in spans if first < right and last > left]
        start = .15 + selected[0]["offset"] / 10_000_000 / tempo
        finish = .15 + (selected[-1]["offset"] + selected[-1]["duration"]) / 10_000_000 / tempo
        cues.append({
            "start": scene["start"] + max(0, start - .04),
            "end": scene["start"] + min(scene["duration"] - .01, finish + .18),
            "text": content, "position": scene.get("position", "bottom"),
        })
    for cue, following in zip(cues, cues[1:]):
        cue["end"] = min(cue["end"], following["start"] - .01)
    if any(cue["start"] >= cue["end"] for cue in cues):
        raise ValueError("A caption has no display time.")
    return cues


async def synthesize(text, voice, mp3, metadata):
    import edge_tts

    words = []
    partial = mp3.with_suffix(".partial.mp3")
    try:
        with partial.open("wb") as stream:
            async for message in edge_tts.Communicate(text, voice, boundary="WordBoundary").stream():
                if message["type"] == "audio":
                    stream.write(message["data"])
                elif message["type"] == "WordBoundary":
                    words.append({key: message[key] for key in ("text", "offset", "duration")})
        if not words or partial.stat().st_size == 0:
            raise ValueError("The provider returned no audio or word boundaries.")
        if normalized("".join(word["text"] for word in words)) != normalized(text):
            raise ValueError("The provider's word metadata differs from the requested script.")
        partial.replace(mp3)
        metadata.write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        if partial.exists():
            partial.unlink()


async def prepare_scene(index, scene, voice, cache, work, font, allow_online):
    key = hashlib.sha256(f"{voice}|WordBoundary|{scene['text']}".encode()).hexdigest()
    mp3, metadata = cache / f"{key}.mp3", cache / f"{key}.json"
    if not mp3.exists() or not metadata.exists():
        if not allow_online:
            raise PermissionError("Uncached speech needs --allow-online-tts after user consent.")
        await asyncio.wait_for(synthesize(scene["text"], voice, mp3, metadata), timeout=120)
    words = json.loads(metadata.read_text(encoding="utf-8"))
    spoken = probe(str(mp3)).get("duration")
    if not spoken or not math.isfinite(spoken):
        raise ValueError("Cannot determine the speech audio duration.")
    tempo = max(1.0, spoken / (scene["duration"] - .3))
    if tempo > 1.35:
        raise ValueError(f"Scene {index} needs {tempo:.3f}x speech; shorten its canonical text.")
    cues = timed_cues(scene, words, tempo, font)
    wav = work / f"scene-{index:02d}.wav"
    run_ffmpeg(["-i", mp3, "-af",
                f"aresample=48000,asetpts=PTS-STARTPTS,atempo={tempo:.8f},adelay=150:all=1,apad,"
                f"atrim=end_sample={round(scene['duration'] * 48000)},asetpts=PTS-STARTPTS,"
                f"afade=t=out:st={scene['duration'] - .08}:d=0.08",
                "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", wav])
    return {**scene, "tempo": tempo, "cues": cues}, wav


def style_fingerprint(font_path, font):
    image = subtitle_image("Caption style reference.", font)
    return {
        "renderer": "video-creator-pillow",
        "font_sha256": hashlib.sha256(Path(font_path).read_bytes()).hexdigest(),
        "sample_sha256": hashlib.sha256(image.tobytes()).hexdigest(),
        "sample_size": list(image.size),
    }


def compose_video(base, track, scenes, workflow, font_path, font, work, candidate, duration, language):
    from make_demo_cards import ribbon_image

    args = ["-i", base, "-i", track]
    filters, count, previous = [], 0, "0:v"
    for scene in scenes:
        if " ".join(cue["text"] for cue in scene["cues"]) != scene["text"]:
            raise ValueError("Caption text no longer equals the canonical speech script.")
        for cue in scene["cues"]:
            image = subtitle_image(cue["text"], font)
            path = work / f"caption-{count:02d}.png"
            image.save(path)
            args += ["-loop", "1", "-framerate", "30", "-i", path]
            start, end = cue["start"], cue["end"]
            fade = min(.25, (end - start) / 2)
            y = 36 if cue["position"] == "top" else 1080 - image.height - 36
            filters.append(
                f"[{count + 2}:v]format=rgba,fade=t=in:st={start}:d={fade}:alpha=1,"
                f"fade=t=out:st={end - fade}:d={fade}:alpha=1[caption{count}]")
            filters.append(
                f"[{previous}][caption{count}]overlay=x={(1920 - image.width) // 2}:y={y}:"
                f"enable='gte(t,{start})*lt(t,{end})'[sub{count}]")
            previous = f"sub{count}"
            count += 1
    active = [scene for scene in scenes if scene.get("step") is not None]
    if active:
        enabled = "+".join(f"gte(t,{s['start']})*lt(t,{s['start'] + s['duration']})" for s in active)
        filters += [
            f"[{previous}]split=2[full][small]",
            "[small]scale=1752:986,pad=1920:1080:84:94:color=0x101c2c[desk]",
            f"[full][desk]overlay=0:0:enable='{enabled}'[layout]",
        ]
        previous = "layout"
        for step in sorted({scene["step"] for scene in active}):
            path = work / f"workflow-{step}.png"
            ribbon_image(workflow, step, font_path).save(path)
            args += ["-i", path]
            enabled = "+".join(
                f"gte(t,{s['start']})*lt(t,{s['start'] + s['duration']})"
                for s in active if s["step"] == step)
            filters.append(f"[{previous}][{count + 2}:v]overlay=0:0:enable='{enabled}'[ribbon{step}]")
            previous = f"ribbon{step}"
            count += 1
    args += [
        "-filter_complex_threads", "1", "-filter_complex", ";".join(filters),
        "-map", f"[{previous}]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-r", "30", "-c:a", "copy", "-disposition:a:0", "default",
        "-metadata:s:a:0", f"language={language}",
        "-metadata:s:a:0", "handler_name=AI narration",
        "-t", str(duration), "-movflags", "+faststart", candidate,
    ]
    run_ffmpeg(args)


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", type=Path, help="Clean 1920x1080/30fps edit, without burned-in captions")
    parser.add_argument("script", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--work-dir", type=Path, required=True)
    parser.add_argument("--font")
    parser.add_argument("--allow-online-tts", action="store_true")
    parser.add_argument("--accept-style-change", action="store_true")
    args = parser.parse_args()
    if args.output.suffix.lower() != ".mp4":
        raise ValueError("The narrated output must use a new .mp4 filename.")
    if args.output.exists() or args.output.resolve() in (args.base.resolve(), args.script.resolve()):
        raise FileExistsError("Use a new output filename; inputs and prior outputs are never overwritten.")
    script = read_script(args.script)
    info = probe(str(args.base))
    duration = sum(scene["duration"] for scene in script["scenes"])
    if (info.get("width"), info.get("height"), info.get("fps")) != (1920, 1080, 30):
        raise ValueError("This narrated-demo path needs a clean 1920x1080, 30fps base edit.")
    if info.get("duration") is None or abs(info["duration"] - duration) > .06:
        raise ValueError("The clean base and narration timeline must have the same duration.")
    font_path = resolve_font(args.font)
    font = load_font(font_path, 38, "Medium")
    style = style_fingerprint(font_path, font)
    args.work_dir.mkdir(parents=True, exist_ok=True)
    style_file = args.work_dir / "caption-style.json"
    if style_file.exists():
        previous = json.loads(style_file.read_text(encoding="utf-8"))
        if previous != style and not args.accept_style_change:
            raise ValueError("Caption style changed. Restore it, or use --accept-style-change with approval.")
    cache = args.work_dir / "speech-cache"
    cache.mkdir(exist_ok=True)
    for scene in script["scenes"]:
        text_groups(scene["text"], font)
    with tempfile.TemporaryDirectory(prefix="narration-", dir=args.work_dir) as temporary:
        work = Path(temporary)
        scenes, audio = [], []
        for index, scene in enumerate(script["scenes"]):
            prepared, wav = await prepare_scene(
                index, scene, script.get("voice", "en-US-AriaNeural"), cache, work,
                font, args.allow_online_tts)
            scenes.append(prepared)
            audio.append(wav)
        concat = work / "audio.txt"
        concat.write_text("\n".join(
            "file '" + path.resolve().as_posix().replace("'", "'\\''") + "'" for path in audio),
            encoding="utf-8")
        track = work / "narration.m4a"
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", concat,
                    "-af", "loudnorm=I=-14:TP=-1:LRA=9", "-t", str(duration),
                    "-ar", "44100", "-ac", "2", "-c:a", "aac", "-b:a", "160k", track])
        candidate = work / "candidate.mp4"
        compose_video(args.base, track, scenes, script.get("workflow", []),
                      font_path, font, work, candidate, duration, script.get("language", "eng"))
        checks = verify_video(candidate, script.get("max_duration", 90),
                              script.get("language", "eng"), duration)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        candidate.replace(args.output)
    manifest = {**script, "scenes": scenes, "caption_style": style}
    (args.work_dir / "narration-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    style_file.write_text(json.dumps(style, indent=2), encoding="utf-8")
    report = {"output": str(args.output.resolve()), "checks": checks,
              "subtitle_speech_exact_match": True, "caption_style": style}
    (args.work_dir / "delivery-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
