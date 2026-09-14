import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  canonicalHash,
  confirmMcpToolDialog,
  loadInitialToolApprovals,
  loadApprovedPlan,
  validateMcpConfirmObservation,
  validateInitialToolApprovals,
  validatePlan,
  verifyReadBack,
} from "../scripts/mcp_tool_browser_runner.mjs";

const syntheticGuid = (digit) => [8, 4, 4, 4, 12].map((length) => digit.repeat(length)).join("-");
const environmentId = syntheticGuid("1");
const botId = syntheticGuid("2");
const connectorId = "/providers/Microsoft.PowerApps/apis/shared_microsoftlearndocsmcpserver";
const connectionReference = "sample_agent.cr.shared_microsoftlearn.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function plan() {
  const component = {
    $kind: "DialogComponent",
    schemaName: "sample_agent.tool.learn",
    displayName: "Microsoft Learn Docs MCP Server",
    dialog: {
      $kind: "McpTool",
      connectorId,
      operationId: "microsoft_docs_search",
      connectionReference,
      authMode: "Invoker",
    },
  };
  return {
    contract: "copilot-studio-v2-mcp-tool/2026-09-14",
    operation: "add-mcp-tool",
    origin: "https://example.gateway.prod.island.powerapps.com",
    method: "PUT",
    path: `/api/botmanagement/v1/environments/${environmentId}/bots/${botId}/content/botcomponents`,
    query: { includeWorkflows: "true" },
    environmentId,
    botId,
    connectorId,
    operationId: "microsoft_docs_search",
    connectionId: "a".repeat(32),
    connectionReference,
    componentSchemaName: component.schemaName,
    componentDisplayName: component.displayName,
    payload: {
      botComponentChanges: [{ $kind: "BotComponentInsert", component }],
      connectionReferenceChanges: [{
        $kind: "ConnectionReferenceInsert",
        connectionReference: {
          $kind: "ConnectionReference",
          connectorId,
          connectionId: "a".repeat(32),
          connectionReferenceLogicalName: connectionReference,
        },
      }],
      bot: { cdsBotId: botId },
    },
    readBack: {
      componentType: 9,
      kind: "McpTool",
      connectorId,
      operationId: "microsoft_docs_search",
      connectionReference,
    },
  };
}

test("validates the observed MCP contract", () => {
  assert.equal(validatePlan(plan()).operation, "add-mcp-tool");
});

test("canonical hash matches Python for non-ASCII values", () => {
  assert.equal(
    canonicalHash({ label: "公開", a: 1 }),
    "31df002d712a1505df7ae9aef407de26bfa3ef5c3a1d56e1816cc26d63d2b3f8",
  );
});

test("rejects payload drift", () => {
  const value = plan();
  value.payload.botComponentChanges[0].component.dialog.operationId = "other";
  assert.throws(() => validatePlan(value), /summary does not match payload/);
});

test("rejects read-back summary drift", () => {
  const value = plan();
  value.readBack.kind = "ConnectorTool";
  assert.throws(() => validatePlan(value), /Read-back summary/);
});

test("rejects unrelated changes", () => {
  const value = plan();
  value.payload.cloudFlowDefinitionChanges = [{ $kind: "CloudFlowInsert" }];
  assert.throws(() => validatePlan(value), /unrelated changes/);
});

test("rejects an unobserved gateway", () => {
  const value = plan();
  value.origin = "https://example.invalid";
  assert.throws(() => validatePlan(value), /Gateway origin/);
});

test("checks approval hash before browser execution", async () => {
  const value = plan();
  const path = join(tmpdir(), `mcp-plan-${process.pid}.json`);
  await writeFile(path, JSON.stringify(value), "utf8");
  await assert.rejects(loadApprovedPlan(path, "wrong"), /approval hash/);
});

test("accepts the observed local-only MCP Confirm transition", () => {
  const observation = {
    dialogCount: 1,
    inputsCount: 2,
    confirmCount: 1,
    confirmDisabled: false,
    gatewayWrites: 0,
    dialogCountAfter: 0,
    saveCount: 1,
    saveDisabled: false,
  };
  assert.equal(validateMcpConfirmObservation(observation), observation);
});

test("rejects MCP Confirm gateway writes and incomplete transitions", () => {
  const observed = {
    dialogCount: 1,
    inputsCount: 1,
    confirmCount: 1,
    confirmDisabled: false,
    gatewayWrites: 0,
    dialogCountAfter: 0,
    saveCount: 1,
    saveDisabled: false,
  };
  assert.throws(
    () => validateMcpConfirmObservation({ ...observed, gatewayWrites: 1 }),
    /unexpectedly sent a gateway write/,
  );
  assert.throws(
    () => validateMcpConfirmObservation({ ...observed, saveDisabled: true }),
    /did not enable/,
  );
});

test("confirms through the observed dialog and removes the exact route", async () => {
  let dialogCount = 1;
  let registered = null;
  let removed = null;
  const confirm = {
    count: async () => 1,
    isDisabled: async () => false,
    click: async () => { dialogCount = 0; },
  };
  const dialog = {
    count: async () => dialogCount,
    getByText: () => ({ count: async () => 2 }),
    getByRole: () => confirm,
  };
  const save = { count: async () => 1, isDisabled: async () => false };
  const context = {
    route: async (matcher, handler) => { registered = { matcher, handler }; },
    unroute: async (matcher, handler) => { removed = { matcher, handler }; },
  };
  const page = {
    context: () => context,
    getByRole: (role) => role === "dialog" ? dialog : save,
    waitForTimeout: async () => {},
  };

  const result = await confirmMcpToolDialog(page, 0);
  assert.equal(result.gatewayWrites, 0);
  assert.equal(result.saveDisabled, false);
  assert.equal(registered.matcher, removed.matcher);
  assert.equal(registered.handler, removed.handler);
});

test("requires exactly one matching read-back row", () => {
  const value = plan();
  const data = JSON.stringify({
    $kind: "McpTool",
    connectorId,
    operationId: value.operationId,
    connectionReference,
  });
  assert.equal(verifyReadBack({ value: [{ schemaname: value.componentSchemaName, data }] }, value).data, data);
  assert.throws(() => verifyReadBack({ value: [] }, value), /found 0/);
});

test("accepts the observed YAML scalar read-back", () => {
  const value = plan();
  const data = [
    "kind: McpTool",
    `connectorId: ${connectorId}`,
    `operationId: ${value.operationId}`,
    `connectionReference: ${connectionReference}`,
  ].join("\n");
  assert.equal(verifyReadBack({ value: [{ schemaname: value.componentSchemaName, data }] }, value).data, data);
});

test("validates a captured ConnectorTool contract", () => {
  const value = plan();
  value.contract = "copilot-studio-v2-connector-tool/2026-09-14";
  value.operation = "add-connector-tool";
  value.payload.botComponentChanges[0].component.dialog.$kind = "ConnectorTool";
  value.readBack.kind = "ConnectorTool";
  assert.equal(validatePlan(value).operation, "add-connector-tool");
});

test("rejects duplicate initial tool approvals", () => {
  const approval = {
    planPath: "one.json",
    expectedHash: "abc",
    environmentId,
    botId,
    connectorId,
    operationId: "microsoft_docs_search",
  };
  assert.throws(
    () => validateInitialToolApprovals([approval, { ...approval, planPath: "two.json" }]),
    /Duplicate initial tool approval/,
  );
});

test("prevalidates every initial tool plan before browser execution", async () => {
  const first = plan();
  const second = plan();
  second.payload.botComponentChanges[0].component.schemaName = "sample_agent.tool.other";
  second.componentSchemaName = "sample_agent.tool.other";
  second.payload.botComponentChanges[0].component.dialog.operationId = "other_operation";
  second.operationId = "other_operation";
  second.readBack.operationId = "other_operation";
  const firstPath = join(tmpdir(), `initial-tool-one-${process.pid}.json`);
  const secondPath = join(tmpdir(), `initial-tool-two-${process.pid}.json`);
  const manifestPath = join(tmpdir(), `initial-tools-${process.pid}.json`);
  await writeFile(firstPath, JSON.stringify(first), "utf8");
  await writeFile(secondPath, JSON.stringify(second), "utf8");
  await writeFile(manifestPath, JSON.stringify({
    contract: "copilot-studio-v2-initial-tools/2026-09-14",
    approvals: [
      { planPath: firstPath.split(/[\\/]/).pop(), expectedHash: canonicalHash(first) },
      { planPath: secondPath.split(/[\\/]/).pop(), expectedHash: "wrong" },
    ],
  }), "utf8");
  await assert.rejects(loadInitialToolApprovals(manifestPath), /approval hash/);
});