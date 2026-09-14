import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CONTRACT = "copilot-studio-standard-mcp-tool/2026-09-14";
const PATH = /^\/api\/botmanagement\/v1\/environments\/([0-9a-f-]{36})\/bots\/([0-9a-f-]{36})\/content\/botcomponents$/i;
const CONNECTOR_ID = /^\/providers\/Microsoft\.PowerApps\/apis\/shared_[a-z0-9]+$/;
const GATEWAY_HOST = /^[a-z0-9.-]+\.gateway\.prod\.island\.powerapps\.com$/;
const EMPTY_CHANGE_KEYS = [
  "cloudFlowDefinitionChanges", "connectorDefinitionChanges", "environmentVariableChanges",
  "aIPluginOperationChanges", "componentCollectionChanges", "dataverseTableSearchChanges",
  "dataverseTableSearchEntityConfigurationChanges", "dataverseTableSearchGlossaryConfigurationChanges",
  "dataverseTableSearchEntityColumnSynonymChanges", "aIModelChanges", "connectedAgentDefinitionChanges",
];
const SAFE_HEADERS = new Set([
  "authorization", "x-cci-applicationsource", "x-cci-bapenvironmentid", "x-cci-cdsbotid",
  "x-cci-routing-tenantid", "x-cci-routing-userid", "x-cci-tenantid",
]);

const asciiJson = (value) => JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) =>
  `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${asciiJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return asciiJson(value);
};

export const canonicalHash = (plan) => {
  const normalized = structuredClone(plan);
  normalized.payload.changeToken = "<runtime-change-token>";
  normalized.payload.connectionReferenceChanges[0].connectionReference.id =
    "<runtime-connection-reference-id>";
  return createHash("sha256").update(canonicalJson(normalized), "utf8").digest("hex");
};

export function planFromCapture(url, payload) {
  const parsed = new URL(url);
  const pathIds = PATH.exec(parsed.pathname);
  const component = payload?.botComponentChanges?.[0]?.component;
  const action = component?.dialog?.action;
  const operation = action?.operationDetails;
  const connection = payload?.connectionReferenceChanges?.[0]?.connectionReference;
  if (!pathIds || !component || !action || !operation || !connection) {
    throw new Error("Fresh Standard tool request is incomplete");
  }
  return validatePlan({
    contract: CONTRACT,
    operation: "add-standard-mcp-tool",
    origin: parsed.origin,
    method: "PUT",
    path: parsed.pathname,
    environmentId: pathIds[1],
    botId: pathIds[2],
    connectorId: connection.connectorId,
    operationId: operation.operationId,
    connectionId: connection.connectionId,
    connectionReference: action.connectionReference,
    componentSchemaName: component.schemaName,
    componentDisplayName: component.displayName,
    payload,
    readBack: {
      componentType: 9,
      dialogKind: "TaskDialog",
      actionKind: "InvokeExternalAgentTaskAction",
      operationDetailsKind: "ModelContextProtocolMetadata",
      operationId: operation.operationId,
      connectionReference: action.connectionReference,
    },
  });
}

function singleInsert(changes, kind, label) {
  if (!Array.isArray(changes) || changes.length !== 1 || changes[0]?.$kind !== kind) {
    throw new Error(`${label} must contain one ${kind}`);
  }
  return changes[0];
}

export function validatePlan(plan) {
  if (plan?.contract !== CONTRACT || plan.operation !== "add-standard-mcp-tool" || plan.method !== "PUT") {
    throw new Error("Unsupported Standard tool plan contract");
  }
  const origin = new URL(plan.origin);
  const pathIds = PATH.exec(plan.path);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || !GATEWAY_HOST.test(origin.hostname) || !pathIds) {
    throw new Error("Unexpected Standard gateway target");
  }
  if (pathIds[1].toLowerCase() !== plan.environmentId.toLowerCase()
      || pathIds[2].toLowerCase() !== plan.botId.toLowerCase()) {
    throw new Error("Plan IDs do not match gateway path");
  }
  for (const key of EMPTY_CHANGE_KEYS) {
    if (JSON.stringify(plan.payload?.[key] ?? []) !== "[]") {
      throw new Error(`Plan contains unrelated changes: ${key}`);
    }
  }
  if (typeof plan.payload?.changeToken !== "string" || !plan.payload.changeToken) {
    throw new Error("A non-empty changeToken is required");
  }

  const component = singleInsert(
    plan.payload?.botComponentChanges, "BotComponentInsert", "botComponentChanges",
  ).component;
  const dialog = component?.dialog;
  const action = dialog?.action;
  const operation = action?.operationDetails;
  const connection = singleInsert(
    plan.payload?.connectionReferenceChanges,
    "ConnectionReferenceInsert",
    "connectionReferenceChanges",
  ).connectionReference;
  if (component?.$kind !== "DialogComponent" || dialog?.$kind !== "TaskDialog"
      || action?.$kind !== "InvokeExternalAgentTaskAction"
      || operation?.$kind !== "ModelContextProtocolMetadata" || operation.knownTools?.length !== 0
      || action.connectionProperties?.$kind !== "ConnectionProperties"
      || action.connectionProperties?.mode !== "Invoker") {
    throw new Error("Payload is not the observed Standard MCP tool contract");
  }
  if (connection?.$kind !== "ConnectionReference" || !CONNECTOR_ID.test(connection.connectorId)
      || !/^[0-9a-f-]{36}$/i.test(connection.id)
      || !/^[0-9a-f]{32}$/i.test(connection.connectionId)
      || connection.connectorId !== plan.connectorId || connection.connectionId !== plan.connectionId
      || connection.connectionReferenceLogicalName !== plan.connectionReference
      || action.connectionReference !== plan.connectionReference
      || operation.operationId !== plan.operationId
      || component.schemaName !== plan.componentSchemaName) {
    throw new Error("Plan summary does not match payload");
  }
  const expectedReadBack = {
    componentType: 9,
    dialogKind: "TaskDialog",
    actionKind: "InvokeExternalAgentTaskAction",
    operationDetailsKind: "ModelContextProtocolMetadata",
    operationId: plan.operationId,
    connectionReference: plan.connectionReference,
  };
  if (JSON.stringify(plan.readBack) !== JSON.stringify(expectedReadBack)) {
    throw new Error("Read-back summary does not match Standard tool contract");
  }
  return plan;
}

export async function loadApprovedPlan(planPath, expectedHash) {
  const plan = validatePlan(JSON.parse(await readFile(planPath, "utf8")));
  if (!expectedHash || canonicalHash(plan) !== expectedHash) {
    throw new Error("Plan changed or approval hash is missing");
  }
  return plan;
}

export async function captureStandardToolSave(
  page, capturePath, stageAndAdd, cancelAfterCapture, timeoutMs = 30000,
) {
  if (typeof stageAndAdd !== "function" || typeof cancelAfterCapture !== "function") {
    throw new Error("stageAndAdd and cancelAfterCapture callbacks are required");
  }
  let finish;
  let fail;
  const captured = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const context = page.context();
  const matcher = (url) => PATH.test(new URL(url).pathname);
  let capture = null;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") {
      await route.continue();
      return;
    }
    try {
      if (!capture) {
        capture = { method: "PUT", url: request.url(), body: request.postDataJSON() };
        await mkdir(dirname(capturePath), { recursive: true });
        await writeFile(capturePath, JSON.stringify(capture, null, 2), "utf8");
        finish({ status: "captured-not-sent", capturePath });
      }
      await route.abort("aborted");
    } catch (error) {
      fail(error);
    }
  };
  await context.route(matcher, handler);
  try {
    await stageAndAdd();
    const result = await Promise.race([
      captured,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Timed out waiting for Standard tool save request")), timeoutMs,
      )),
    ]);
    await cancelAfterCapture();
    return result;
  } finally {
    await context.unroute(matcher, handler);
  }
}

export async function releaseApprovedToolSave(
  page, approvedPlan, expectedHash, stageAndAdd, cancelAfterFailure, timeoutMs = 30000,
) {
  validatePlan(approvedPlan);
  if (!expectedHash || canonicalHash(approvedPlan) !== expectedHash) {
    throw new Error("Approved plan changed or approval hash is missing");
  }
  if (typeof stageAndAdd !== "function" || typeof cancelAfterFailure !== "function") {
    throw new Error("stageAndAdd and cancelAfterFailure callbacks are required");
  }

  let finish;
  let fail;
  const released = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const context = page.context();
  const matcher = (url) => PATH.test(new URL(url).pathname);
  let rejected = false;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") {
      await route.continue();
      return;
    }
    try {
      const freshPlan = planFromCapture(request.url(), request.postDataJSON());
      if (canonicalHash(freshPlan) !== expectedHash) {
        rejected = true;
        await route.abort("aborted");
        fail(new Error("Fresh Standard tool request differs from the approved intent"));
        return;
      }
      await route.continue();
      const response = await request.response();
      if (!response?.ok()) {
        fail(new Error(`Standard tool save failed: HTTP ${response?.status()}`));
        return;
      }
      finish({ status: "sent-approved", writeStatus: response.status(), freshPlan });
    } catch (error) {
      rejected = true;
      await route.abort("aborted").catch(() => {});
      fail(error);
    }
  };
  await context.route(matcher, handler);
  try {
    await stageAndAdd();
    return await Promise.race([
      released,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Timed out waiting for Standard tool save request")), timeoutMs,
      )),
    ]);
  } catch (error) {
    if (rejected) await cancelAfterFailure();
    throw error;
  } finally {
    await context.unroute(matcher, handler);
  }
}

function inheritedHeaders(request) {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers())) {
    if (SAFE_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "authorization")) {
    throw new Error("Authenticated browser request was not captured");
  }
  return headers;
}

function dataMatches(data, plan) {
  if (typeof data !== "string") return false;
  try {
    const parsed = JSON.parse(data);
    const action = (parsed.dialog ?? parsed)?.action;
    return action?.$kind === plan.readBack.actionKind
      && action?.connectionReference === plan.connectionReference
      && action?.operationDetails?.$kind === plan.readBack.operationDetailsKind
      && action?.operationDetails?.operationId === plan.operationId;
  } catch {
    return data.includes(`kind: ${plan.readBack.dialogKind}`)
      && data.includes(`kind: ${plan.readBack.actionKind}`)
      && data.includes(`kind: ${plan.readBack.operationDetailsKind}`)
      && data.includes(`operationId: ${plan.operationId}`)
      && data.includes(`connectionReference: ${plan.connectionReference}`);
  }
}

function toolMatches(component, plan) {
  return component?.schemaname === plan.componentSchemaName && dataMatches(component.data, plan);
}

export function verifyReadBack(body, plan) {
  const rows = body?.value;
  if (!Array.isArray(rows)) throw new Error("Unexpected Dataverse read-back schema");
  const matches = rows.filter((row) => toolMatches(row, plan));
  if (matches.length !== 1) throw new Error(`Expected one exact Standard tool; found ${matches.length}`);
  return matches[0];
}

async function withInheritedHeaders(page, matcher, headers, action) {
  const handler = async (route) => route.continue({
    headers: { ...route.request().headers(), ...headers },
  });
  await page.route(matcher, handler);
  try {
    return await action();
  } finally {
    await page.unroute(matcher, handler);
  }
}

async function navigateJson(page, url, headers) {
  const response = await withInheritedHeaders(page, url, headers, () => page.goto(url));
  const text = await response.text();
  return { status: response.status(), ok: response.ok(), body: text ? JSON.parse(text) : null };
}

async function readApprovedPlanMatches(page, plan) {
  validatePlan(plan);
  const originalUrl = page.url();
  const pageTarget = /\/environments\/([0-9a-f-]{36})\/bots\/([0-9a-f-]{36})\//i.exec(
    new URL(originalUrl).pathname,
  );
  if (new URL(originalUrl).origin !== "https://copilotstudio.microsoft.com" || !pageTarget
      || pageTarget[1].toLowerCase() !== plan.environmentId.toLowerCase()
      || pageTarget[2].toLowerCase() !== plan.botId.toLowerCase()) {
    throw new Error("Open the exact approved Standard agent in Copilot Studio first");
  }

  const dataverseSeed = page.waitForRequest((request) => /\/api\/data\/v9\.2\/bots/i.test(request.url()));
  await page.reload();
  const dataverseRequest = await dataverseSeed;
  try {
    const dataverseHeaders = inheritedHeaders(dataverseRequest);
    const dataverseOrigin = new URL(dataverseRequest.url()).origin;
    const filter = encodeURIComponent(`_parentbotid_value eq ${plan.botId} and componenttype eq 9`);
    const readUrl = `${dataverseOrigin}/api/data/v9.2/botcomponents`
      + `?$select=botcomponentid,schemaname,name,data&$filter=${filter}`;
    const readBack = await navigateJson(page, readUrl, dataverseHeaders);
    if (!readBack.ok) throw new Error(`Standard MCP tool read-back failed: HTTP ${readBack.status}`);
    const matches = readBack.body?.value?.filter((row) => toolMatches(row, plan)) ?? [];
    if (matches.length > 1) throw new Error("Multiple exact Standard MCP tools already exist");
    return { count: matches.length, status: readBack.status };
  } finally {
    await page.goto(originalUrl);
  }
}

export async function runApprovedPlan(
  page, planPath, expectedHash, stageAndAdd, cancelAfterFailure, reportPath = null,
) {
  const plan = await loadApprovedPlan(planPath, expectedHash);
  const before = await readApprovedPlanMatches(page, plan);
  let result;
  if (before.count === 1) {
    result = { status: "already-present", writeStatus: null, readBackStatus: before.status };
  } else {
    const released = await releaseApprovedToolSave(
      page, plan, expectedHash, stageAndAdd, cancelAfterFailure,
    );
    const after = await readApprovedPlanMatches(page, released.freshPlan);
    if (after.count !== 1) throw new Error(`Expected one exact Standard tool; found ${after.count}`);
    result = {
      status: "added-verified",
      writeStatus: released.writeStatus,
      readBackStatus: after.status,
    };
  }
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");
  }
  return result;
}