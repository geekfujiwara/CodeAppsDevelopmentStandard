# ${VIDEO_TITLE}

This is a private video job, not a skill installation. Keep approved recordings in `inputs/`, captured images and `.frames.json` manifests in `capture/`, and final MP4s in `output/`. These folders and `.env` are excluded from Git.

`storyboard.json` starts with explicitly labeled diagrams only. Render this initial layout with `--layout-preview` verification; it is not evidence of application execution. Add actual `shot` or `recording` scenes before production verification. Use a new revision/output name instead of replacing an original source.

Use the installed skill's absolute script path:

```text
python <skill>/scripts/prepare_video.py --project <job> --series demo --revision v1 --source
python <skill>/scripts/verify_video.py <job>/work/demo-v1/edit-plan.json --project <job> --plans-only --layout-preview
python <skill>/scripts/render_video.py <job>/work/demo-v1/edit-plan.json <job>/output/demo-v1.mp4 --project <job> --part-seconds 30
python <skill>/scripts/verify_video.py <job>/work/demo-v1/edit-plan.json --project <job> --video <job>/output/demo-v1.mp4 --layout-preview
```

Remove `--layout-preview` after adding approved actual captures. See the installed skill's `references/screen-first-workflow.md` and `references/storyboard-format.md` for scene shapes, crop margins, trims and evidence checks.
