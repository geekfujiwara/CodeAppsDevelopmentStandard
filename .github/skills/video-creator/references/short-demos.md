# Short demos with independent role flows

Apply the user's requested length, not a universal short-video limit. Preserve longer demos and earlier outputs. Do not send new business operations or request new recordings when approved footage already contains the needed evidence.

## Budget before selecting clips

For a 60-90 second request, one possible budget is:

| Section | Seconds | Content |
|---|---:|---|
| Title | 5 | Automatically inserted by the preparer |
| Two-role introduction | 8 | Independent upper/lower role flows |
| First role | 32 | Collection, draft, confirmation and completed result, in separate cuts |
| Second role | 24 | Analysis, complete advice section and completed support artifact |
| Human benefit | 6 | Qualitative benefit, not invented measured savings |
| Optional capability illustration | 6 | Only if needed and explicitly labeled as unrecorded |

This example totals 75 seconds, or 81 with the optional illustration. Adjust to the actual evidence and reading time. Set `evidence.duration_range_seconds` to the requested inclusive bounds, such as `[60, 90]`. The complete plan and **actual delivery MP4** must both pass; the source MP4 may be longer because of still-image padding. Leave a little encoding headroom at the upper limit rather than relying on timing tolerance.

## Cut at meaningful boundaries

Inspect original footage, then import separate short intervals with `import_recording.py --start ... --end ... --fps ... --output ...`. Use distinct new manifest names and scenes. Cut out long generation waits, repeated navigation and irrelevant panels between excerpts. Do not imply that a cut from a request to a completed screen is continuous execution.

Inside each excerpt retain all imported samples, source hashes, original timestamps and trim boundaries. `max_gap_seconds` is optional and affects every interval, not only waiting; disclose playback-speed editing if used. Budget the two-second initial hold plus edited playback and enough completed-result reading time. For short cuts, do not lose confirmation or completion just to fit the target.

Keep observed evidence separate from unrecorded capabilities. Additional diagrams must be explicitly labeled and authorized; do not portray missing actions as completed CRM operations.

## Independent role rows

Use the existing `two-personas` template. Its introductory `rows` content contains two distinct role names and 2-4 ordered stages per row:

```json
"rows": [
  {"role": "Contributor", "steps": [
    {"label": "Gather", "detail": "Approved sources"},
    {"label": "Confirm", "detail": "Scope and content"},
    {"label": "Record", "detail": "Observed completion"}
  ]},
  {"role": "Reviewer", "steps": [
    {"label": "Analyze", "detail": "Same period and evidence"},
    {"label": "Advise", "detail": "Questions and support"},
    {"label": "Discuss", "detail": "Readable artifact"}
  ]}
]
```

Role headings and dividers stay separate. The preparer generates arrows only between adjacent stages within one role; no cross-row execution edges or common assistant hub. Complete the first role's scenario before transitioning to the next.

## Inspect the completed focus, not just the midpoint

A seven-second still with three seconds of overview and two seconds of zoom is not fully zoomed at its midpoint. Check native crops and final encoded overview, transition and last-second frames. `verify_video.py` includes each scene's last-second frame in the contact sheet, including still-image advice shots, and checks screen gutters at the final focus as well as intermediate phases.

Keep entire headings, sentences, buttons, cards and relevant bullet sections with whitespace in the **native crop**. Start/end between complete sections, not inside the neighboring sentence. The 32-output-pixel inner matte is still mandatory, but cannot repair clipped native content. Use `result_region` for critical recorded results and end before loading/navigation.

The numeric checks prove timing, pixels, provenance and gutters, not the meaning or completeness of text. Review final focus images visually; regenerate previews after crop edits and never deliver stale previews. Package only generalized code, templates and lessons after the output is verified, never the private footage or crop coordinates measured for one application.
