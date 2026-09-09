# Code Apps And Existing Bot Integration

## Implementation Sequence

1. Keep the existing app and v1 channel available. Develop the new path behind a disabled-by-default feature setting.
2. Code Apps creates a user-owned Dataverse request with a server-generated ID, client correlation key, base design revision/hash, operation, bounded input JSON and Pending status.
3. A Dataverse-triggered flow claims the request using a conditional update. Duplicate events must not start duplicate billable Agent calls or overwrite a completed result.
4. Invoke the chosen engine and persist a terminal result through a separate result table or a server-validated transition. An inline Agent is not an existing v2 bot.
5. The app reads only authorized results, supports bounded polling/cancellation/timeouts and ignores stale responses after navigation or base design changes.
6. Parse the response through the app's existing design schema and domain validators. AI output is a proposal; adoption remains an explicit user action.

## Required Existing V2 Bot Proof

The new designer offers a separate Copilot node. Capture its selected-bot connector operation, bot schema name, inputs and output shape from a dedicated draft.
Verify the exact existing bot with a fixed response and then its skill/MCP execution. Do not infer that `InvokeDefinition` calls that bot, or that classic `ExecuteCopilotAsyncV2` supports the new architecture.
Until this contract is verified, implement and test the request/result adapter independently; do not substitute another model silently.

## Security And Acceptance

- Request CreatedBy comes from Dataverse, never a client-supplied identity. Client correlation keys require an alternate key including requester scope.
- Restrict request payload operations and sizes server-side. Ordinary users must not set Completed/result/engine identity fields.
- A maker-owned connector runs with maker permissions, not requester permissions. Filter/authorize data retrieval for the requester or restrict the operation to the submitted design payload. This must be proven before enabling real knowledge retrieval.
- Results need explicit sharing/ownership matching the requesting user. Test with a second ordinary user that cross-user reads and writes fail.
- Conditional state transitions, retries, cancellation, timeouts and late completion must have deterministic behavior. UI cancellation alone does not cancel remote processing.
- Design results must preserve locked modules, specified boundary/exclusions, base revision and output limits. No automatic adoption, saving, email or resource changes by the AI.
- Acceptance gates: Dataverse round-trip, duplicate delivery, failure/timeout, stale response, ordinary-user authorization, exact existing bot/skill invocation, desktop/mobile workflow, explicit adoption.

The bundled CLI currently automates only the manual inline smoke lifecycle. Dataverse trigger generation, request tables, existing-bot invocation and app deployment are not claimed as implemented by this skill.