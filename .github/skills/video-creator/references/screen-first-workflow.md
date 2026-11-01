# Screen-first workflow

## Defaults and evidence

Use approved local recordings and real screenshots. Editing permission is not permission to submit new AI tasks, register business records, send mail, schedule meetings, authenticate, scan environments or deploy. Inspect both real content and metadata first. Distinguish requests, preparation, human approval and visible completion; a successful action card alone does not prove its business result.

The preset is 1920x1080, 30 fps, H.264 with silent AAC, without narration or subtitles. Start with a five-second standalone title, then an animated process overview. Put concise headings and the active-step strip above the application. No left explanation panel, bottom instructions, scene numbers, disclaimers or source credits; attribution belongs in files. Insert meaningful transition diagrams and finish with the human/business benefit, without invented measured savings.

For two roles, introduce both after the title, finish the first scenario, then explicitly introduce the second. Use the actual recordings supplied by the user instead of requesting new operations. Missing actions may be described only as clearly labeled operational diagrams if the user agrees; never fabricate the composer, typing, service calls, charts or final application result.

The `two-personas` introduction uses two independent `rows`, each with its own role heading and left-to-right stages. Do not collapse them into a shared assistant hub. For a requested short cut, use [short-demo pacing](short-demos.md) and record the requested bounds in `evidence.duration_range_seconds`; 60-90 seconds is an example, not a forced limit on every video.

## Private job and common scaffold

Use `templates/screen-first`, `templates/two-personas` or `templates/development-story`, each with `scaffold.json`. They are diagram-only **layout previews**, not synthetic application demonstrations. All variables are declared in `references/.env.example`.

GitHub Copilot uses the development standard's existing `update-skills/scripts/scaffold_from_template.py`. For a standalone Cowork ZIP, the same unmodified shared scaffolder is bundled in `scripts/scaffold_from_template.py`; this is not a new video-specific generator. Generate into a separate writable job, not the installed skill:

```text
python <shared-scaffolder> --template <skill>/templates/screen-first --target <job> --var VIDEO_TITLE="Demo" --dry-run
python <shared-scaffolder> --template <skill>/templates/screen-first --target <job> --var VIDEO_TITLE="Demo"
```

Use `--env <answers.env>` for private answers; `--questions` emits unanswered questions. Run the dry run first. The shared generator rejects unresolved placeholders and nonempty targets. `nextSteps` explicitly requires approved captures before production verification. Job `.gitignore` excludes recordings, screenshots, frames, outputs and `.env`.

## Inspect, import and edit

```text
python <skill>/scripts/inspect_video.py <approved.mp4> <job>/work/inspect --every 20 --at 0,40,80
python <skill>/scripts/import_recording.py <approved.mp4> --fps 10 --start 0 --end 53 --output <job>/capture/example-v1.frames.json
```

The importer retains original pixel dimensions, source hashes, original timestamps, sample rate and trim boundaries. It rejects invalid rates/trims and existing output folders. Source durations may include audio or a held tail beyond the last actual video frame; retain the known original timestamps rather than inventing extra captured frames.

Review the **last** native frame of every excerpt. End before the next blank/loading page and hold the readable result. Exclude loading skeletons and onboarding overlays from result-focused cuts. Use `result_region` for critical content: at least 10 RGB standard-deviation levels must remain inside that region in both the native last frame and encoded MP4. A colored header around an empty panel is not enough.

Without edits, source timestamps control playback. `max_gap_seconds` caps every inter-frame duration while retaining all imported frames. If evenly sampled frames are accelerated, disclose excerpting and **playback-speed editing**, not “only waiting was removed.” Diagrams and edited timings are not measured service latency.

Prefer separate trimmed manifests and scene cuts to shortening the entire recording by acceleration. Omit long generation waits and repeated navigation between excerpts, while preserving preparation, approval and completed-result evidence. Inside each chosen excerpt retain all imported samples and their original timestamps.

## Frame the original, not an intermediate

Hold the whole application for 3 seconds, zoom smoothly over 2 seconds, and render every zoom frame directly from the original image. Never upscale a low-resolution capture and call it high resolution. Keep whole relevant headings, buttons, cards and tables plus native context margins. Inspect both overview and detail; 32 output pixels of inner matte on every edge are mandatory throughout motion and pointer placement. Matte padding is not a fix for a clipped source crop.

Use the original blue-gradient arrowhead without a shaft. Do not draw annotation connectors over application screenshots; retain arrows in animated flow diagrams. Product logos, if authorized, retain their original colors and proportions and are not represented as the application's own logo. Bundled conceptual symbols are explicitly not product logos.

## Prepare, render and verify

```text
python <skill>/scripts/prepare_video.py --project <job> --series demo --revision v1 --source
python <skill>/scripts/verify_video.py <job>/work/demo-v1/edit-plan.json --project <job> --plans-only
python <skill>/scripts/render_video.py <job>/work/demo-v1/edit-plan.json <job>/output/demo-v1.mp4 --project <job> --stills 1,8,16 --grid
python <skill>/scripts/render_video.py <job>/work/demo-v1/edit-plan.json <job>/output/demo-v1.mp4 --project <job> --part-seconds 30
python <skill>/scripts/verify_video.py <job>/work/demo-v1/edit-plan.json --project <job> --video <job>/output/demo-v1.mp4
```

For the initial diagram-only starter, add `--layout-preview` to verification. Production verification without that flag requires real captures. Regenerate source and plans if base images change; motion-only changes may reuse an unchanged still-image source. Renderer and asset hashes invalidate stale cached parts. Do not bypass the cache signature. Use `--only-part K` / `--list-parts` for bounded resumable jobs, not competing workers for the same part or simultaneous concatenation.

Verify expected duration within 0.1 seconds, exact format, full decoding, every scene's visible pixels, 32-pixel gutters, source/renderer hashes, fixed recording dimensions, source timestamps and first/middle/last source-frame fidelity (mean RGB error at most 4 for JPEG encoding). Finally review the encoded overview, zoom and result frames, not merely the edit plan. Automated checks do not replace semantic review or actual listening in an explicitly requested audio mode.

Requested duration bounds are checked independently of the 0.1-second plan/encode tolerance. The contact sheet includes the last-second frame of **every** scene, including still-image zooms. Review that final focus state as well as the overview and transition: a mid-scene frame of a seven-second shot can precede the completed zoom. Inspect complete headings/bullets and native context; added matte alone cannot repair a clipped crop.

Complete output before packaging reusable lessons. Share only requested deliverables; public templates must not contain private screenshots, original recordings, cache directories, tenant URLs, record IDs or credentials.
