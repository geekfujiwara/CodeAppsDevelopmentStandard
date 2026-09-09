# Contextual Design Chat

## Interaction Contract

Use the existing design system and keep the live preview beside a compact conversation. Offer a small initial set
of starter commands, then grouped quick replies for layout, connections, maintenance and the selected object.
Categories prevent a large button wall. Use icons for selection/send/stop/Undo and names for natural-language commands.
Preserve an editable textarea for custom requests; do not replace the actual tool with a marketing or instruction page.

Selected-object mode must show the canonical unit and node names. Resolve labels from the current design, not
from a client-supplied description. Persist unitId and nodeId separately, including the unit prefix for same-named
equipment in different modules. Clearing selection disables targeted commands. Whole-design commands explicitly
clear the request selection, even if old history refers to another object.

Freeze the target, full basis and editing version before awaiting identity or submission. Compare again before
submission and application. A selection change invalidates a targeted response, including text-only explanations.
Validate that unrelated units and connections remain byte-equivalent in the parsed domain representation.
If the existing validator locks module internals, offer unit movement/rotation and explanation, not impossible
equipment-internal edits, deletion or unapproved topology changes.

## Honest Waiting Experience

Display real send/accepted/running/validation states, elapsed time and the frozen request target. An indeterminate
activity line or spinner is appropriate. Never simulate hidden chain-of-thought, invent analysis claims, advance
stages based on a timer, show guessed percentages or claim a tool is running without telemetry.
After a longer wait, state only what is known: awaiting output, no draft change, no resubmission.

Use fixed stage grid tracks, tabular elapsed digits, bounded history/reply panels and wrapping labels. Respect
prefers-reduced-motion. Elapsed updates must not cause a screen reader announcement every second. Clear timers
on idle/unmount. Preserve the request receipt when stopping reads, and distinguish local waiting from remote cancellation.
Users may prepare the next input while busy; do not send another billable request while one is unresolved.

## Draft And Save Separation

With explicit approval, a schema/domain-valid candidate may update the editing draft automatically and create
one Undo entry. Shared save and publishing remain explicit commands. On failure retain the original design,
explain the failure, and do not silently apply a partial candidate. Keep knowledge routing independent.

## Verification

- Pure tests: every quick reply is nonempty, bounded and uniquely labeled; target ID resolves; forged labels are
  ignored; wrong-unit/same-node selections fail; changed base/selection rejects; unrelated changes fail.
- Transport tests: immutable scope, identity change after await, duplicate submission locks, GET-only resume,
  terminal versus indeterminate results, abort/unmount and bounded reads.
- Visible public browser: record baseline -> selected command -> real waiting states -> expected coordinate change
  -> Undo -> Redo -> still unsaved. Validate responses against the actual submitted basis.
- Responsive checks: desktop/mobile screenshots, settled layout widths, long names, category controls, send button,
  reduced motion, and nonblank canvas pixels. A resized nonvisible tab can leave layout/animation stale; distinguish
  that from an actual narrow-screen defect and verify on a visible page before claiming acceptance.
- Use the same confirmed Edge profile in VS Code integrated browser. Do not install standalone Playwright or
  Playwright MCP. Preserve existing user drafts and do not reload a pending request merely to update assets.

See [worker integration](../../agent-flows/references/conversation-worker.md) for server ownership, claims and receipts.