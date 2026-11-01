# Troubleshooting and permanent checks

| Symptom | Cause | Permanent check / action |
|---|---|---|
| Japanese MP4 filename breaks on Windows | System code page cannot decode FFmpeg metadata | `video_media.py` explicitly decodes UTF-8; the Unicode trim test does not rely on UTF-8 process mode |
| Frames from an earlier import appear in a new clip | Existing destination reused | Importer rejects both existing manifest and frame folder; use a new revision/name |
| Caption says “completed” but last screen is white | Excerpt includes the following navigation/loading page | Review the last actual frame, cut earlier and hold the result; `result_region` checks native and encoded content rather than the outer heading |
| Text/card touches the zoom frame | Tight native crop or missing inner spacing | Whole target plus native context; verify 32 output pixels on all sides at overview/intermediate/detail phases |
| Old result remains after editing | Stale source base or cached parts | Regenerate the still source when base images change; source/renderer hashes and cache signature must match |
| Resized screenshot looks blurry | Source was already downscaled | Capture a genuinely larger original, record saved dimensions and sample original pixels on every frame |
| Timeline is too short | Playback plus initial hold not covered | Preparation validates `duration >= playback + 2`; reject nonpositive/nonfinite gaps |
| “Only waiting was removed” is inaccurate | Uniform sampling accelerated all playback intervals | Describe excerpting and playback-speed editing; never claim measured latency |
| Required action is absent from source | A capability was mistaken for an observed action | Ask whether to omit, obtain more footage or show an explicitly labeled operational diagram |
| Missing sibling checkout or font | Installed skill location was hardcoded | Derive package paths from script location; separate `--project`; bundle immutable Noto Sans JP with OFL |
| CLI request lacks safety restrictions | `code.cmd` truncated a multiline prompt | Submit one single-line argument, inspect actual prompt, stop before continuing if scope differs |
| Browser upload appears successful but no file exists | Opaque/no-CORS response hid receiver failure | Approved loopback CORS, explicit HTTP success and returned saved dimensions |
| Empty starter is mistaken for a finished demo | Diagrams have no genuine captures | `--layout-preview` is explicit; production verification requires actual captures |
| Short cut is still over the requested limit | Entire recording accelerated instead of selecting key moments, or title omitted from budget | Use independent trimmed excerpts; `prepare_video.validate_duration` runs before generation and `verify_video` checks actual MP4 bounds, not padded source duration |
| Two roles appear to depend on one shared hub | Multi-row columns connect all adjacent nodes across roles | `prepare_video.build_role_rows` creates only adjacent same-role edges; the `two-personas` template uses distinct role headers and rows |
| Advice text is clipped despite a passing midpoint preview | Seven-second scene midpoint occurs during zoom; native crop starts inside another sentence | Inspect complete native sections and their surrounding whitespace; gutter verification and encoded contact sheet now include the last-second focus of every screen/still scene; semantic review remains required |
| Four-second calibration clip reports a false gutter failure | Exact matte colors compared during the final 0.45-second fade | `verify_plan` clamps gutter sample times before the fade; encoded calibration regression covers this successful short-clip path |

Run `python -B -m unittest discover -s <skill>/scripts -p "test_*.py"`. Tests cover the numeric gutter threshold, pointer inset, blank result panel with a nonblank heading, Unicode trim/source provenance, no overwrite, original legacy editing/compression/narration, independent role edges, optional inclusive duration bounds, rejection before work creation, actual MP4 duration and final-scene contact-sheet coverage. Optional capture utilities require the actual authorized platform; syntax checks are not recording proof.
