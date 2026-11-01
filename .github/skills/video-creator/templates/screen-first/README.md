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

For a requested short cut, add `duration_range_seconds` (for example `[60, 90]`) inside the series' `evidence`, including the inserted five-second title in the budget. The diagram-only starter is not a finished short demo: add approved excerpts before setting production bounds. Prefer separate trimmed manifests over accelerating the whole recording. For two personas, keep independent role rows in the introduction. Review the final encoded focus frame of each still/recording, not only its midpoint; see `references/short-demos.md` in the installed skill.
