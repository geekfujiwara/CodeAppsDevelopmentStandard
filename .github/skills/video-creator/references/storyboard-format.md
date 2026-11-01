# Storyboard contract

`storyboard.json` maps arbitrary lowercase series names to `name`, `title_card` (`title`, `lead`, `icon`), `eyebrow`, `steps`, optional `evidence` and `scenes`. The preparer inserts the five-second title. Each following scene supplies explicit `title`, `lead`, `caption` (metadata only), `duration` and optional one-based `step`.

Use exactly one content form:

- `columns`: 2-4 columns, 1-3 nodes each. Nodes have `label`, `detail`, optional `icon` and `hub`. Adjacent columns are connected; independent template choices belong in the same column, not falsely in sequence.
- `rows`: exactly two objects with distinct nonempty `role` names and `steps` of 2-4 nodes each. Stage nodes use the same fields as `columns`. Headers and dividers identify upper/lower workflows; only adjacent stages in the same row are connected. Use this for the two-persona introduction, not a shared hub joining unrelated roles.
- `shot`: an approved image relative to the private job's `capture/`. `crop` and optional `overview` are `[left, top, right, bottom]` in original pixels. `camera` defaults to `{"overview_seconds":3,"zoom_seconds":2}`. `pointer.from` / `pointer.point` are normalized **inside the inset content**.
- `recording`: a `.frames.json` manifest relative to `capture/`. Optional `crop`, `overview`, `camera`, `max_gap_seconds` and `result_region` apply. Scene duration must cover edited playback plus the two-second initial hold.

`ref` and `prompt` are rejected: inherited project narratives and reconstructed application screens are not permitted.

```json
{
  "title": "実際の結果を確認する",
  "lead": "実録画の抜粋です。再生速度を編集しています。",
  "step": 3,
  "recording": "example-v1.frames.json",
  "duration": 22,
  "max_gap_seconds": 0.034,
  "result_region": [90, 170, 1420, 710],
  "caption": "Actual observed result; origin and trim are in the private manifest."
}
```

Coordinates in this schema example are not known safe crops for your app. Measure the actual native capture; keep context around complete content and reject out-of-bounds result regions.

Recording manifests contain `provenance`, `duration` and increasing `frames` with `path`, `at` and actual `size`. Frame paths may be absolute or relative to the manifest. MP4 imports also include `source`, `source_sha256`, `source_info`, `trim`, `sample_fps` and per-frame `source_at`. The source hash is streamed, not loaded entirely into memory.

`evidence.required_recordings` lists required manifest basenames. `observed`, `not_observed` and `not_observed_presentation` document the semantic boundary. These metadata assertions are not proof by themselves; inspect footage and review the final MP4. If an action is missing, ask whether to show a labeled operational diagram, omit it or wait for additional footage.

Optional `evidence.duration_range_seconds`, for example `[60, 90]`, supplies inclusive positive finite ordered bounds in seconds. The preparer checks the complete planned duration **including the inserted title** before generating work files; the verifier checks both plan and actual delivered MP4. Omitting the field preserves longer-demo behavior. Do not use the padded still-image source MP4's duration as the delivery duration. See [short-demo cuts and pacing](short-demos.md).

Installed assets use safe lowercase icon keys. User-authorized icons in the job's `capture/icons/` take precedence; missing icons fail explicitly rather than silently replacing a product logo with another product.
