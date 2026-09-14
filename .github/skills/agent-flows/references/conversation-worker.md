# User-Owned Conversation Worker

## Architecture And Consent

Keep the existing knowledge assistant and tools unchanged. Add an independently enabled design operation:
Code Apps authenticated request creation -> Dataverse insert trigger -> unique result claim -> existing bot
InvokeAgent -> persisted result -> bounded client reads -> independent domain validation -> editing draft.
Obtain approval for the chosen bot, connectors, request payload, permitted users and draft auto-apply behavior.
Changing to a tool-free draft bot is an architectural choice, not a silent model fallback.

Design-only execution can be limited to supplied JSON. A maker-owned tool connection must never be presented as
requester-scoped knowledge access. Enable knowledge and design separately after their own acceptance tests.
Run environment, classic DLP and inherited ACP checks before implementation. Do not broaden policy after an
indeterminate runtime failure merely because configuration checks passed.

## Worker Contract

1. Create user-owned request and result tables with active alternate keys. A globally unique turn UUID avoids
   reliance on an unsupported system CreatedBy key. Give callers request Create/Read and result Read only.
   Inspect actual role privileges after role creation and after any broad role generator runs.
2. Persist immutable conversationId, turnId, integer version, allowlisted operation, exact basis and selection.
   Fence untrusted business JSON, cap serialized UTF-8 payloads, and bound history independently.
3. Read the request from Dataverse. Before claiming, compare server CreatedBy with owner and any approved
   allowlist. Resolve an exact enabled account once, record its systemuserid, and distinguish it from Entra objectId.
   Never read requester identity from prompt JSON. Single-user acceptance does not prove multi-user isolation.
4. Insert the result with a unique request lookup (and optionally the same UUID primary key) and caller ownership.
   Invoke only on Claim Succeeded; retain the claim on ambiguous failure. Concurrency=1 alone is insufficient.
   Use a fixed bot schema and connection reference. Do not let request data select the engine or enable HITL.
5. Disable connector auto-retries for a billable invocation. Persist running receipt before invoking, and persist
   agent conversation ID/diagnostic on incomplete or timed-out output. A transport timeout is not a terminal failure.
   Local wait cancellation stops reads, not remote execution. Resume the same receipt; never create a replacement
   request merely because the response was lost. Reconciliation is a separate GET-only path, not an automatic retry.
6. Accept only Completed plus a nonempty bounded result. Persist caller ownership and exact scope into the result.
   The app checks request ID, full scope, identity and editing version again after every asynchronous boundary.
   A successful connector action without a verified reply is not successful generation.

The scope may be represented either inside one result envelope or in immutable typed result columns with a bounded
JSON payload column. Both are valid only when the worker and every inspector use the same representation. For the
typed-column form, verify request lookup, owner, conversationId, turnId, version and baseHash from columns before
parsing the payload; keep the payload limited to domain output such as summary/candidate/error. Do not run the
envelope-only `inspect_conversation.py` unchanged against this form and interpret its rejection as a worker failure.

`conversation_contract.py` supplies pure validation functions and is used by the normal lifecycle CLI and
`inspect_conversation.py`. These are application/diagnostic guards, not a Dataverse server plugin or an authorization
enforcement layer. Implement equivalent pre-claim checks in the worker; prove row permissions separately.

## Updating And Publishing

- Keep the worker stopped while changing its known definition. Bind the plan to environment, solution, full
  definition, connection references, bot identity, state and ETag. Re-read immediately before a narrow PATCH.
- Require top-level `clientdata.schemaVersion=1.0.0.0` (guarded by `validate_envelope`), category=5, type=1 and the
  target new-UI discriminator. Runtime definitions and designer graph metadata are distinct acceptance gates.
- ParseJson keyword support is narrower than arbitrary JSON Schema implementations. If `pattern` is rejected,
  use supported length/type fields plus explicit UUID shape checks before Claim; do not simply remove validation.
- Exact If-Match is the default concurrency guard. A 412 requires re-reading and a new decision, never blind retry.
  An explicitly approved stopped-workflow snapshot mode can use If-Match:* only to prevent accidental creation.
  It does NOT provide atomic version conflict protection; a read/write race remains. Do not describe it as CAS.
- Verify actual `solutioncomponents` membership for both flow and bot. A solution header or local `.env` value
  alone is not proof. If missing, plan an explicit AddSolutionComponent for only the intended component and
  verify membership, preserving other solution membership and existing bots/tools.
- Validate expected stopped definition before publish, then verify Active/Started and an identified run.
  A blank new-UI graph cannot be reported as a verified designer canvas even if the runtime succeeds.

## Diagnostics And Test Matrix

Configure logical names, entity sets, approved systemuserid and operation in the local `.env` using the skill example.
Run `inspect_conversation.py --request-id <accepted-request-id>` from the project with its configured auth_helper.
Use the cached common authentication; do not print tokens or full prompts/results. The command only reads, emits
sanitized status/byte count, exits 2 when no result exists and 1 when unverified. It does not retry or reconcile a
remote conversation. Domain schema, geometry and requested-change correctness remain separate checks.

Test duplicate create/claim, every scope mismatch, changed identity, changed base and selection, extra fields,
oversized UTF-8, empty replies, multiple JSON blocks, late completion, request submission ambiguity, stopped reads,
receipt resumption and result ownership. Verify exact preserved structures and unchanged unrelated objects.
Test successful replies against the request's actual basis, not a bundled sample that may differ from the UI draft.

Public acceptance uses normal visible-browser clicks and the latest deployed asset hash. Record request/run identity,
selected object, baseline coordinates, changed coordinates, Undo/Redo and unsaved state. Scripted event dispatch is
useful for local inspection but is not equivalent to visible-user acceptance. Test desktop/mobile layout and canvas
pixels separately. Keep tenant-specific reports, emails, IDs and `.env` outside the public PR.

## Evidence Boundaries

This pattern has been exercised with a user-owned Dataverse round trip, a separately approved tool-free existing
bot, domain-validated complete design JSON, public-host draft auto-apply and Undo/Redo. The published CLI's pure
guards and GET-only inspection also ran against an existing successful request. This does not establish every
tenant's connector contract, remote Python execution trace, all mobile workflows, ordinary-user isolation,
knowledge retrieval authorization, automatic reconciliation or shared-save acceptance.

## Official References

- [Cloud flows using code](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code): workflow
  table lifecycle, clientdata example, and explicit unsupported status of api.flow.microsoft.com.
- [Conditional operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api): exact ETag concurrency versus existing-only If-Match:*.
- [AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent): explicit solution inclusion.

These pages were checked through Web retrieval because Learn MCP was unavailable. Observed Agent node runtime
paths and new designer metadata are implementation observations, not a promise of supported public APIs.