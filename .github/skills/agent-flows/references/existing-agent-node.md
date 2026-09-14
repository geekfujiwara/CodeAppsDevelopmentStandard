# Existing Agent Node: Discovery And Evidence

## Choose The Correct Route

Microsoft Learn distinguishes these supported product experiences:

- Standard harness: the Microsoft Copilot Studio connector in a Power Automate cloud flow.
- GitHub Copilot harness: an existing Agent node in a Copilot Studio Workflow.
- Web app iframe embedding is available for GitHub Copilot harness agents. That does not establish programmatic message delivery, user authorization or Code Apps CSP compatibility.

Sources verified on 2026-09-09 using web retrieval because Learn MCP was unavailable:
[Call agents](https://learn.microsoft.com/en-us/power-automate/call-copilot-studio-agent),
[Available channels](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/publication-channels-overview).
Do not turn one connector's harness rejection into a blanket claim that all automation or embedding is unsupported.

## Observed API Contract

These details came from authenticated connector metadata, not from a published authoring SDK.
The documented Workflow experience does not guarantee support for direct API Hub calls.

| Concern | Observed contract |
|---|---|
| Metadata | GET `https://api.powerapps.com/providers/Microsoft.PowerApps/apis/shared_agentnode` |
| Metadata parameters | `api-version=2016-11-01`, `$filter=environment eq '<environment-id>'` |
| Metadata authentication | `https://service.powerapps.com/.default` |
| Runtime base | `properties.primaryRuntimeUrl`; environment-specific HTTPS API Hub host |
| Runtime authentication | `https://apihub.azure.com/.default` |
| ListAgents | GET `/{connectionId}/powerautomate/agentnodes/agents` relative to runtime base |
| InvokeAgent | POST `/{connectionId}/powerautomate/agentnodes/conversations` relative to runtime base |
| InvokeAgent input | `agentId`, `prompt`; optional `isHitlEscalationEnabled` and `outputSchema` |
| InvokeAgent output schema | HTTP 201 with `result`, `structuredOutput`, `files` |
| Inline alternative | `InvokeDefinition`, with `body/botDefinition` and `body/message`; not the existing bot |

The ListAgents dynamic-values metadata names `agents/agentId/agentName`, while its referenced response type names `entities`.
An actual successful list response remains unverified. Do not invent mappings for unknown entity shapes.

## Read-Only Diagnostic

Configure `ENV_ID`, `DATAVERSE_URL`, `AGENT_FLOW_BOT_ID`, `AGENT_FLOW_BOT_NAME` and
`AGENT_FLOW_CONNECTION_REFERENCE` using `.env` and the standard auth helper. Do not reuse the shared bot-ID file for a newly created agent.

```powershell
python .github/skills/agent-flows/scripts/inspect_agent_node.py --report-file .local/agent-flow/discovery.json
```

The script verifies the exact Dataverse bot ID, display name and cliagent template; resolves one Agent node connection reference;
checks the observed Swagger operations; validates the environment-bound runtime host; then performs ListAgents with the API Hub audience.
It sends only GET requests, never invokes an agent, modifies policies, publishes a flow or changes credentials.

| Result | Meaning |
|---|---|
| `target-verified` (exit 0) | Exactly one list entry matches the expected bot ID or schema name and display name |
| `runtime-policy-blocked` (exit 2) | HTTP 442 at the recorded stage; no automatic retry or policy modification |
| `contract-mismatch` (exit 2) | Identity, host, metadata or list shape differs; stop rather than guess |
| `http-error` / `request-failed` (exit 2) | HTTP or transport failure; sanitized report without response body |

Every result retains `agentInvoked: false` and `runtimeValidated: false`.
Reports omit names, IDs, tokens, response text and signed file URLs. Existing report files are not overwritten.
`resolve_agent()` rejects duplicate matches, multiple collection shapes, pagination and unknown response formats.
`validate_runtime_url()` rejects other environments, credentials, query strings, fragments and unobserved hosts.

## Approval-Bound Smoke Invocation

After `target-verified`, create a separate one-time smoke plan. The nonce must be unique for the test.

```powershell
python .github/skills/agent-flows/scripts/invoke_agent_node.py plan `
	--nonce <unique-smoke-nonce> `
	--output .local/agent-flow/invoke-plan.json

python .github/skills/agent-flows/scripts/invoke_agent_node.py apply `
	--plan .local/agent-flow/invoke-plan.json `
	--expected-hash <approved-hash>
```

The plan binds the environment, Dataverse origin, bot identity/schema and ETag, connection-reference identity and ETag,
environment-bound runtime URL/path, exact prompt, disabled HITL, output schema and expected nonce JSON. Apply repeats all discovery
and ListAgents checks before one POST. The prompt prohibits tools, knowledge, browsing, files, messages and data changes.

The authenticated Swagger declares HTTP 201, but live `InvokeAgent` returned HTTP 202 on 2026-09-14. No transcript containing the
nonce was available in the immediate independent Dataverse read-back. Therefore 202 is `accepted-unverified` and exit 2; do not
retry the same plan or call it a completed run. Only HTTP 201 with exact `structuredOutput`, no unknown response fields and an empty
`files` array is `output-verified`. This direct API remains experimental and does not replace the supported Workflow designer path.

## Verification Boundary

The corrected API Hub audience initially reached HTTP 442 at ListAgents. After policy propagation, the same read-only diagnostic
returned the observed `agents` collection with `agentId` equal to the bot schema name and uniquely verified the target.
That proves current target enumeration for the tested connection, not successful agent execution. A later smoke POST returned 202,
which conflicts with the Swagger-declared 201 and had no immediate transcript evidence.
Policy configuration readback, runtime policy evaluation, publish acceptance and business output are separate gates.
If another session owns governance, report the stage and status without changing or repeatedly rechecking its settings.

Before adding an invocation path:

1. Verify a real ListAgents response and identify the intended bot without guessing its ID.
2. Verify the existing-agent designer graph independently of inline graph settings.
3. Review the exact prompt, intended side effects and connection owner. Disable human escalation when email notification is not authorized.
4. Treat HTTP 200/201 as transport evidence only. Inspect run completion, actual response and generated artifacts separately.
5. Validate downloaded candidate bytes with the domain validator. A file count, attachment hash, success-shaped message or local mock test is not evidence of cloud execution.
6. Keep timeouts indeterminate and reconcile before retrying. Do not substitute an inline agent silently.

## Reproducible Agent Delivery

Keep each agent's desired configuration and resulting bot ID separate. Verify uploaded skill bytes by download and SHA-256,
preserve unrelated MCP components and confirm a repeated application is a no-op before calling it reproducible.
One agent's no-op does not prove the process works for a second agent. A second existing-agent check must remain non-destructive.

Agent instructions must make validation claims conditional on executing the actual candidate validator successfully.
Distinguish validation not run, validation failed, and validation passed. Preserve baseline identifiers and locked structure;
do not fabricate output logs or claim persistence without successful writes and readback. These instructions require domain tests,
not just string-matching tests. Keep human adoption separate from candidate generation.