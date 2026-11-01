# Platform-specific execution

## Copilot Cowork

Prefer recordings/screenshots attached by the user or existing authorized files. Installed skills can be read-only; run scripts by their absolute installed paths and place all inputs, frames, plans, previews and MP4s in a separate writable job. The standalone ZIP includes the existing shared `scaffold_from_template.py` unchanged so it does not depend on a sibling developer checkout or another installed skill.

Do not assume VS Code browser tools, Windows desktop APIs or interactive terminals are available in Cowork. Do not install or launch a standalone browser to fill a footage gap. If no authorized capture facility is available, use existing attachments or ask for an additional recording. Windows/CDP capture utilities are optional tools for an already approved external recording environment, not a required Cowork step.

Check authorized organizational presentation rules, successful examples, brand/media rights and audience needs at runtime. Do not copy private business records into the reusable template. Deliver the requested MP4 only; plans, contact sheets and ZIPs are internal unless requested. External uploads, sharing and online TTS require separate explicit approval.

## GitHub Copilot in VS Code

Use the standard repository's quickstart and common `update-skills` scaffolder. For a development-story video, start with the actual single-line request `<public-standard-url> クイックスタートして`, with all command/authentication/deployment restrictions **inside the same CLI argument**. Windows `code.cmd` may truncate multiline prompts; visually confirm what was submitted, and stop immediately if restrictions were omitted.

Capture actual Skill acquisition and the source commit, requirements derived from manuals/Teams transcripts with evidence and acceptance criteria, common template scaffold, only needed customizations, and actual local build/test results. If the selected app has a companion plugin, show both template choices separately; other published templates are alternatives, not sequential prerequisites. Local build success is not deployment or end-user operation success.

For web capture use only the already-shared VS Code integrated browser, with the user's selected profile and approved page. `browser-capture.js` receives that existing page object; no new browser is launched. Use an approved loopback relay and `capture_receiver.py --project <job>`. Never relax application CSP or transfer cookies/tokens. Confirm returned saved dimensions.

`capture_desktop.ps1 -WorkspaceTitle <approved-window-title> -Project <job> -Name vscode-v1` targets the actual VS Code window. Still capture may use target-window PrintWindow if foreground activation is blocked. Inspect Chromium captures for blank/stale output. Optional window-title recording never falls back to an unrelated desktop.

Capture permission is not permission for CRM writes, environment scans, authentication or deployment. No fresh business operations are needed to rebuild from saved captures.
