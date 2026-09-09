# API Contract And Evidence

## Verification Boundary

Validated in a new-UI-enabled environment on 2026-09-09:

| Operation | Evidence |
|---|---|
| Create Dataverse workflow in a solution | HTTP 204 and exact clientdata readback |
| New UI discriminator | modernflowtype 0 opened classic fallback; 1 opened Start + Agent canvas |
| Designer validation | Review: Ready to publish, no problems |
| Publish through Dataverse | Active readback, Flow API Started, UI Published |
| Management manual run | HTTP 200, a run and Agent action created |
| Agent output | HTTP 442 runtime policy block; fixed JSON not yet verified |
| New UI network contract capture | Not completed; do not claim network corroboration |

Configuration and inherited ACP allowed the connector while runtime still returned an older policy refresh.
Development continuation during propagation is allowed with user approval. This does not convert a failed run into a successful acceptance test.
This package is an experimental, source-template-based implementation, not a Microsoft-supported new designer authoring SDK.

## Sources

- [Create, read, update, and delete cloud flows](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code): Dataverse workflow category 5, clientdata, connection references, state management.
- [Workflow table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow): category=5 is Modern Flow; modernflowtype=1 is CopilotStudioFlow (0=PowerAutomateFlow, 2=M365CopilotAgentFlow). These values are documented, while the graph contract is an observation.
- [Advanced connector policies](https://learn.microsoft.com/en-us/power-platform/admin/advanced-connector-policies): governance is separate from flow definition validation.
- [Microsoft power-platform-skills](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-automate): create-flow and manage-flows separate creation, publish, run and inspection.
- [Official bundled FlowAgent implementation](https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-automate/server/mcp.mjs): inspected `runFlow`, `triggerFlowRun` and `classicFlowRpRequest`; input-free runs use management `/triggers/{name}/run`. Input-bearing Direct-API triggers require a different transport. The sample does not implement it.

Learn MCP was not available during verification; public documentation was used as fallback. New UI graph details below are environment observations, not guaranteed public contracts.

The cloud-flow article explicitly states that `api.flow.microsoft.com` is **unsupported and subject to breaking changes**.
Its use in the official FlowAgent bundle is evidence of an implementation pattern, not a support guarantee.
Creation/state updates use documented Dataverse APIs; Started checks, run and history in this experimental CLI use the unsupported Flow RP API.
For supported production management, assess the documented Power Automate Management connectors separately.

## Requests

All Python authentication uses `standard/scripts/auth_helper.py`. No independent token cache or credentials.

| API | Request |
|---|---|
| Dataverse | POST `/api/data/v9.2/workflows`, header `MSCRM.SolutionUniqueName` |
| Body fields | workflowid, name, category=5, type=1, modernflowtype=1, primaryentity=none, clientdata as JSON string |
| Publish | PATCH `/workflows({id})`, statecode=1, statuscode=2 |
| Flow management | `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{env}/flows/{id}` |
| Management API version / scope | `2016-11-01` / `https://service.flow.microsoft.com/.default` |
| Manual invocation | POST `.../triggers/manual/run`, empty JSON object, no trigger inputs |
| Status | GET `.../runs`, `.../runs/{run}`, `.../runs/{run}/actions/Agent` |

Runtime definition: `properties.definition.triggers.manual` is Request/Button; `actions.Agent` is OpenApiConnection with `shared_agentnode / InvokeDefinition`.
`body/botDefinition` contains only model and an empty tools array. `body/message` matches graph inlineInstructions.
Designer graph: `triggers.manual.metadata.associatedData.graph`, Start + Agent nodes and one directed edge, with matching `nodeActionMapping` and action metadata.nodeId.
Graph and runtime connectionReferences must match. Existing connected reference must resolve to the embedded connection ID.
Server resource IDs are not cloned. Node IDs are scoped to each separate flow and remain from the trusted source.

## Safety And Limits

- Create is separate from publish and run, each requires a fresh reviewed hash. Target-name collisions stop.
- A second snapshot narrows stale-write risk; these APIs do not provide a transaction across workflows and references. Do not edit the template or target concurrently during apply.
- The create source must be a trusted, reviewed minimal template. Structural checks are not a sandbox for arbitrary imported definitions.
- No automatic retry on ambiguous writes. Preserve the pending report with allocated workflow ID and reconcile before attempting another write.
- Output links may contain SAS credentials. Restrict to the observed environment-specific `environment.api.powerplatformusercontent.com` host, omit bearer and redirects, never log the URL or output body.
- `body.message` is the expected response shape, still awaiting a successful live Agent response. A different successful output schema must be inspected and tested, not silently accepted.
- Model availability, license/credits, connection ownership, new UI rollout and runtime ACP propagation remain environmental prerequisites.

## Existing-Agent Discovery

[Existing Agent node evidence](existing-agent-node.md) records the separate `InvokeAgent` contract and a read-only diagnostic.
The API Hub runtime uses a different audience from connector metadata. Its successful list response, invocation and designer graph
are not yet verified. The diagnostic deliberately does not extend the inline create/publish/run CLI to accept guessed existing-agent definitions.