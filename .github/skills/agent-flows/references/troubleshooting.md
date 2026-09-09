# Troubleshooting

## Classic Experience Instead Of New Workflow

Cause observed: `modernflowtype` defaulted to 0. `category=5` and graph metadata alone are insufficient.
Permanent guard: `workflow_body` sets modernflowtype=1 and `validate_workflow` verifies it in every lifecycle operation.
Do not copy resourceid/resourcecontainer from another flow. Repair only an explicitly identified test resource.

## Runtime 442 After Review Passes

Record configuration readback, inherited group policy, run ID, Agent status and runtime policy refresh timestamp.
`classify_output` returns runtime-policy-blocked even when deployment and Review succeeded.
Allow implementation to continue under explicit user approval while propagation is pending; keep runtime acceptance pending.
Do not add more connectors, disable DLP/ACP or reapply policies automatically. Retest once after propagation is confirmed or at an agreed checkpoint.
Persistent divergence belongs in a support case. Setting save, new UI Review and runtime execution are three different checks.

## Template Or Readback Rejected

`validate_client` checks graph/runtime instruction, model, connection and mapping parity, empty tools, no web/human assistance and the input-free trigger.
`validate_workflow` checks name, category, type, modernflowtype, state and clientdata.
Do not bypass these checks for a richer workflow. Discover the new node contract and implement a separately tested adapter.

## Write Failed Or Timed Out

The report is saved as write-request-pending before a request. A failed response is failed-or-unverified, not proof that nothing happened.
Read the allocated resource ID/name or run history before another action. Reports are not overwritten; no automatic POST retries.
Existing flows are never deleted to achieve idempotency. Concurrent source edits require a fresh dry-run and reviewed hash.

## Accepted Run Is Not An Answer

The management endpoint may return an empty HTTP 200 body. Use run history and explicit run ID, not the response alone.
`classify_output` requires successful run and action plus parsed JSON equality; boolean and number differences are rejected.
Output mismatch is not repaired by stripping markdown or inventing missing fields.
Code Apps inputs must not be sent using this input-free smoke transport.