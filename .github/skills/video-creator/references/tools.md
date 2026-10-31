# Component index and compatibility

All source tools are reusable offline unless explicitly marked otherwise. Use their `--help` before execution. New screen-first jobs never depend on a sibling developer checkout. Python requirements: [requirements.txt](../scripts/requirements.txt). Shared module: [common.py](../scripts/common.py), [project_paths.py](../scripts/project_paths.py), [video_media.py](../scripts/video_media.py). Parameters: [.env.example](.env.example).

## Screen-first

- [prepare_video.py](../scripts/prepare_video.py), [motion_design.py](../scripts/motion_design.py), [render_video.py](../scripts/render_video.py), [verify_video.py](../scripts/verify_video.py): storyboard, original-source animation, stock-renderer adapter and final-output validation.
- [import_recording.py](../scripts/import_recording.py): UTF-8 native MP4 import, trim, timestamps, hash and overwrite protection.
- [scaffold_from_template.py](../scripts/scaffold_from_template.py): unchanged common scaffolder, bundled for standalone Cowork use.
- [screen-first manifest](../templates/screen-first/scaffold.json), [storyboard](../templates/screen-first/storyboard.json), [job README](../templates/screen-first/README.md), [job exclusions](../templates/screen-first/.gitignore).
- [two-personas manifest](../templates/two-personas/scaffold.json), [storyboard](../templates/two-personas/storyboard.json).
- [development-story manifest](../templates/development-story/scaffold.json), [storyboard](../templates/development-story/storyboard.json).
- Optional existing-session capture: [capture_receiver.py](../scripts/capture_receiver.py), [browser-capture.js](../scripts/browser-capture.js), [capture_desktop.ps1](../scripts/capture_desktop.ps1). See [platform boundaries](platforms.md); never start a new browser.
- [test_motion_design.py](../scripts/test_motion_design.py), [test_capture_receiver.py](../scripts/test_capture_receiver.py): thresholds, evidence, templates, source import and reliable capture reception.

## Existing editing and compression, preserved

- [workflow](workflow.md), [editing guidelines](editing-guidelines.md), [legacy plan format](plan-format.md).
- [inspect_video.py](../scripts/inspect_video.py), [images_to_source.py](../scripts/images_to_source.py), [render_preview.py](../scripts/render_preview.py), [compress_video.py](../scripts/compress_video.py), [test_video_creator.py](../scripts/test_video_creator.py).
- [empty plan](../assets/templates/edit-plan.template.json), [editing example](../assets/templates/edit-plan.example.json), [still-image example](../assets/templates/kamishibai-plan.example.json). Examples are fictional layout data, not actual application evidence.
- Compression: preserve aspect ratio, source resolution if below 1080, and native fps if below 30; no upscaling. Use `--screen`, optional `--static`, preset or explicit `--target-mb`. Check `target_size_ok`, `duration_ok`, `playable` and warnings. Never lower the quality floor without approval; retain explicit H.265/audio-removal gates.
- [build_hyperframes.py](../scripts/build_hyperframes.py) and [notes](hyperframes-notes.md): explicit request only; never imply unexecuted steps succeeded.

## Optional narration, not the default

- [workflow](business-demo-workflow.md), [make_demo_cards.py](../scripts/make_demo_cards.py), [narrate_video.py](../scripts/narrate_video.py), [subtitle_style.py](../scripts/subtitle_style.py), [verify_narrated_video.py](../scripts/verify_narrated_video.py), [test_narration.py](../scripts/test_narration.py).
- [narration dependencies](../scripts/requirements-narration.txt), [fictional script](../assets/templates/business-demo.example.json).
- [existing-CDP recording adapter](../assets/templates/record-demo.mjs), [package manifest](../assets/templates/record-demo.package.json).
- Online TTS sends script text outside the workstation; require separate explicit permission and `--allow-online-tts`. Use the single script as the audio/subtitle source; preserve requested subtitle style, word timing and 150ms lead-in. Stop above 1.35x speech acceleration or missing speech. Verify the encoded audio rather than treating cached generation as listening.

## Assets and rights

- [provenance](../assets/provenance.json), [fonts](fonts.md), [unaltered Noto Sans JP](../assets/fonts/NotoSansJP-VariableFont_wght.ttf), [OFL](../assets/fonts/OFL.txt).
- Original conceptual icons: [assistant](../assets/icons/assistant.png), [calendar](../assets/icons/calendar.png), [database](../assets/icons/database.png), [conversation](../assets/icons/conversation.png), [code](../assets/icons/code.png). Recreate in an authorized writable folder with [make_assets.py](../scripts/make_assets.py) `--output <folder>`.
- Authorized GitHub Primer icon: [Copilot PNG](../assets/icons/github-copilot.png), [source SVG](../assets/icons/github-copilot.svg), [MIT notice](../assets/icons/LICENSE-Octicons.txt). No product endorsement, recoloring, altered proportions or redistribution of other unverified logos.
- The only bundled font is immutable and audited with its OFL notice. Do not add arbitrary third-party fonts.
