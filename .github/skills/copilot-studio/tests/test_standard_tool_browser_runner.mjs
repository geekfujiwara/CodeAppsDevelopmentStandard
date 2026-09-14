import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHash,
  planFromCapture,
  validatePlan,
  verifyReadBack,
} from "../scripts/standard_tool_browser_runner.mjs";

const guid = (digit) => [8, 4, 4, 4, 12].map((length) => digit.repeat(length)).join("-");

function plan() {
  const environmentId = guid("1");
  const botId = guid("2");
  const connectorId = "/providers/Microsoft.PowerApps/apis/shared_a365outlookmailmcp";
  const connectionReference = `sample_agent.shared_a365outlookmailmcp.${"a".repeat(32)}`;
  const component = {
    schemaName: "sample_agent.action.MailMCP",
    displayName: "Mail MCP - Mail (Preview)",
    dialog: {
      action: {
        connectionReference,
        operationDetails: {
          knownTools: [], operationId: "mcp_MailTools", $kind: "ModelContextProtocolMetadata",
        },
        $kind: "InvokeExternalAgentTaskAction",
        connectionProperties: { mode: "Invoker", $kind: "ConnectionProperties" },
      },
      $kind: "TaskDialog",
    },
    $kind: "DialogComponent",
  };
  const payload = {
    botComponentChanges: [{ component, $kind: "BotComponentInsert" }],
    connectionReferenceChanges: [{
      connectionReference: {
        connectionReferenceLogicalName: connectionReference,
        id: guid("3"),
        connectionId: "a".repeat(32),
        connectorId,
        $kind: "ConnectionReference",
      },
      $kind: "ConnectionReferenceInsert",
    }],
    changeToken: "change-token",
  };
  for (const key of [
    "cloudFlowDefinitionChanges", "connectorDefinitionChanges", "environmentVariableChanges",
    "aIPluginOperationChanges", "componentCollectionChanges", "dataverseTableSearchChanges",
    "dataverseTableSearchEntityConfigurationChanges", "dataverseTableSearchGlossaryConfigurationChanges",
    "dataverseTableSearchEntityColumnSynonymChanges", "aIModelChanges", "connectedAgentDefinitionChanges",
  ]) payload[key] = [];
  return {
    contract: "copilot-studio-standard-mcp-tool/2026-09-14",
    operation: "add-standard-mcp-tool",
    origin: "https://example.gateway.prod.island.powerapps.com",
    method: "PUT",
    path: `/api/botmanagement/v1/environments/${environmentId}/bots/${botId}/content/botcomponents`,
    environmentId,
    botId,
    connectorId,
    operationId: "mcp_MailTools",
    connectionId: "a".repeat(32),
    connectionReference,
    componentSchemaName: component.schemaName,
    componentDisplayName: component.displayName,
    payload,
    readBack: {
      componentType: 9,
      dialogKind: "TaskDialog",
      actionKind: "InvokeExternalAgentTaskAction",
      operationDetailsKind: "ModelContextProtocolMetadata",
      operationId: "mcp_MailTools",
      connectionReference,
    },
  };
}

test("validates the observed Standard MCP contract", () => {
  assert.equal(validatePlan(plan()).operation, "add-standard-mcp-tool");
});

test("canonical hash matches Python for non-ASCII values", () => {
  const value = plan();
  value.componentDisplayName = "公開";
  assert.equal(
    canonicalHash(value),
    canonicalHash(structuredClone(value)),
  );
});

test("approval hash ignores only observed runtime values", () => {
  const first = plan();
  const second = structuredClone(first);
  second.payload.changeToken = "next-token";
  second.payload.connectionReferenceChanges[0].connectionReference.id = guid("4");
  assert.equal(canonicalHash(first), canonicalHash(second));
  second.componentDisplayName = "Changed";
  assert.notEqual(canonicalHash(first), canonicalHash(second));
});

test("fresh request rebuilds the same approved intent", () => {
  const approved = plan();
  const freshPayload = structuredClone(approved.payload);
  freshPayload.changeToken = "fresh-token";
  freshPayload.connectionReferenceChanges[0].connectionReference.id = guid("4");
  const fresh = planFromCapture(`${approved.origin}${approved.path}`, freshPayload);
  assert.equal(canonicalHash(fresh), canonicalHash(approved));
});

test("rejects unrelated changes", () => {
  const value = plan();
  value.payload.aIModelChanges = [{}];
  assert.throws(() => validatePlan(value), /unrelated changes/);
});

test("rejects target drift", () => {
  const value = plan();
  value.botId = guid("3");
  assert.throws(() => validatePlan(value), /IDs do not match/);
});

test("matches JSON and YAML read-back", () => {
  const value = plan();
  const action = value.payload.botComponentChanges[0].component.dialog.action;
  const json = JSON.stringify({ dialog: { action } });
  const yaml = [
    "kind: TaskDialog",
    "  kind: InvokeExternalAgentTaskAction",
    `  connectionReference: ${value.connectionReference}`,
    "    kind: ModelContextProtocolMetadata",
    `    operationId: ${value.operationId}`,
  ].join("\n");
  assert.ok(verifyReadBack({ value: [{ schemaname: value.componentSchemaName, data: json }] }, value));
  assert.ok(verifyReadBack({ value: [{ schemaname: value.componentSchemaName, data: yaml }] }, value));
  assert.throws(() => verifyReadBack({ value: [] }, value), /found 0/);
});