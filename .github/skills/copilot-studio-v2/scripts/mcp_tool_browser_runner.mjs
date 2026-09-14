import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const TOOL_CONTRACTS = new Map([
  ["copilot-studio-v2-mcp-tool/2026-09-14", { operation: "add-mcp-tool", kind: "McpTool" }],
  ["copilot-studio-v2-connector-tool/2026-09-14", {
    operation: "add-connector-tool", kind: "ConnectorTool",
  }],
]);
const GATEWAY_PATH = /^\/api\/botmanagement\/v1\/environments\/([0-9a-f-]{36})\/bots\/([0-9a-f-]{36})\/content\/botcomponents$/i;
const CONNECTOR_ID = /^\/providers\/Microsoft\.PowerApps\/apis\/shared_[a-z0-9]+$/;
const GATEWAY_HOST = /^[a-z0-9.-]+\.gateway\.prod\.island\.powerapps\.com$/;
const EMPTY_CHANGE_KEYS = [
  "cloudFlowDefinitionChanges",
  "connectorDefinitionChanges",
  "environmentVariableChanges",
  "aIPluginOperationChanges",
  "componentCollectionChanges",
  "dataverseTableSearchChanges",
  "dataverseTableSearchEntityConfigurationChanges",
  "dataverseTableSearchGlossaryConfigurationChanges",
  "dataverseTableSearchEntityColumnSynonymChanges",
  "aIModelChanges",
  "connectedAgentDefinitionChanges",
];
const SAFE_HEADERS = new Set([
  "authorization",
  "x-cci-applicationsource",
  "x-cci-bapenvironmentid",
  "x-cci-cdsbotid",
  "x-cci-routing-tenantid",
  "x-cci-routing-userid",
  "x-cci-tenantid",
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

export function canonicalHash(plan) {
  return createHash("sha256").update(canonicalJson(plan), "utf8").digest("hex");
}

function singleInsert(changes, kind, label) {
  if (!Array.isArray(changes) || changes.length !== 1 || changes[0]?.$kind !== kind) {
    throw new Error(`${label} must contain one ${kind}`);
  }
  return changes[0];
}

export function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Plan must be an object");
  const contract = TOOL_CONTRACTS.get(plan.contract);
  if (!contract || plan.operation !== contract.operation || plan.method !== "PUT") {
    throw new Error("Unsupported tool plan contract");
  }
  if (!GATEWAY_PATH.test(plan.path) || plan.query?.includeWorkflows !== "true") {
    throw new Error("Unexpected gateway path or query");
  }
  const parsedOrigin = new URL(plan.origin);
  if (parsedOrigin.protocol !== "https:"
      || parsedOrigin.pathname !== "/"
      || !GATEWAY_HOST.test(parsedOrigin.hostname)) {
    throw new Error("Gateway origin must be HTTPS");
  }
  const pathIds = GATEWAY_PATH.exec(plan.path);
  if (pathIds[1].toLowerCase() !== plan.environmentId.toLowerCase()
      || pathIds[2].toLowerCase() !== plan.botId.toLowerCase()) {
    throw new Error("Plan IDs do not match gateway path");
  }
  if (!CONNECTOR_ID.test(plan.connectorId) || !/^[0-9a-f]{32}$/i.test(plan.connectionId)) {
    throw new Error("Invalid connector or connection ID");
  }
  for (const key of EMPTY_CHANGE_KEYS) {
    if (JSON.stringify(plan.payload?.[key] ?? []) !== "[]") {
      throw new Error(`Plan contains unrelated changes: ${key}`);
    }
  }

  const component = singleInsert(
    plan.payload?.botComponentChanges, "BotComponentInsert", "botComponentChanges",
  ).component;
  const connection = singleInsert(
    plan.payload?.connectionReferenceChanges,
    "ConnectionReferenceInsert",
    "connectionReferenceChanges",
  ).connectionReference;
  const dialog = component?.dialog;
  if (component?.$kind !== "DialogComponent" || dialog?.$kind !== contract.kind) {
    throw new Error(`Expected a ${contract.kind} DialogComponent`);
  }
  if (connection?.$kind !== "ConnectionReference"
      || dialog.connectorId !== plan.connectorId
      || connection.connectorId !== plan.connectorId
      || connection.connectionId !== plan.connectionId
      || dialog.operationId !== plan.operationId
      || dialog.connectionReference !== plan.connectionReference
      || connection.connectionReferenceLogicalName !== plan.connectionReference
      || component.schemaName !== plan.componentSchemaName
      || plan.payload?.bot?.cdsBotId?.toLowerCase() !== plan.botId.toLowerCase()) {
    throw new Error("Plan summary does not match payload");
  }
  if (plan.readBack?.componentType !== 9
      || plan.readBack?.kind !== contract.kind
      || plan.readBack?.connectorId !== plan.connectorId
      || plan.readBack?.operationId !== plan.operationId
      || plan.readBack?.connectionReference !== plan.connectionReference) {
    throw new Error("Read-back summary does not match tool contract");
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

export async function captureMcpSave(page, capturePath, stageAndSave, timeoutMs = 30000) {
  if (typeof stageAndSave !== "function") throw new Error("stageAndSave callback is required");
  let finish;
  let fail;
  const captured = new Promise((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const context = page.context();
  const matcher = (url) => GATEWAY_PATH.test(new URL(url).pathname);
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== "PUT") {
      await route.continue();
      return;
    }
    try {
      const value = { method: "PUT", url: request.url(), body: request.postDataJSON() };
      await mkdir(dirname(capturePath), { recursive: true });
      await writeFile(capturePath, JSON.stringify(value, null, 2), "utf8");
      await route.abort("aborted");
      finish({ status: "captured-not-sent", capturePath });
    } catch (error) {
      fail(error);
    }
  };
  await context.route(matcher, handler);
  try {
    await stageAndSave();
    const result = await Promise.race([
      captured,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("Timed out waiting for tool save request")), timeoutMs,
      )),
    ]);
    await page.reload();
    return result;
  } finally {
    await context.unroute(matcher, handler);
  }
}

export const captureToolSave = captureMcpSave;

export function validateMcpConfirmObservation(observation) {
  if (observation?.dialogCount !== 1
      || observation.inputsCount < 1
      || observation.confirmCount !== 1
      || observation.confirmDisabled) {
    throw new Error("MCP Confirm dialog is not ready");
  }
  if (observation.gatewayWrites !== 0) {
    throw new Error("MCP Confirm unexpectedly sent a gateway write");
  }
  if (observation.dialogCountAfter !== 0 || observation.saveCount !== 1
      || observation.saveDisabled) {
    throw new Error("MCP Confirm did not enable the agent Save action");
  }
  return observation;
}

export async function confirmMcpToolDialog(page, settleMs = 500) {
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  const observation = {
    dialogCount: await dialog.count(),
    inputsCount: await dialog.getByText("Inputs", { exact: true }).count(),
    confirmCount: await confirm.count(),
    confirmDisabled: true,
    gatewayWrites: 0,
    dialogCountAfter: null,
    saveCount: null,
    saveDisabled: true,
  };
  if (observation.confirmCount === 1) observation.confirmDisabled = await confirm.isDisabled();
  if (observation.dialogCount !== 1 || observation.inputsCount < 1
      || observation.confirmCount !== 1 || observation.confirmDisabled) {
    return validateMcpConfirmObservation(observation);
  }

  const context = page.context();
  const matcher = (url) => GATEWAY_PATH.test(new URL(url).pathname);
  let routeError = null;
  const handler = async (route) => {
    try {
      const request = route.request();
      if (["DELETE", "PATCH", "POST", "PUT"].includes(request.method())) {
        observation.gatewayWrites += 1;
        await route.abort("aborted");
        return;
      }
      await route.continue();
    } catch (error) {
      routeError = error;
    }
  };
  await context.route(matcher, handler);
  try {
    await confirm.click();
    await page.waitForTimeout(settleMs);
  } finally {
    await context.unroute(matcher, handler);
  }
  if (routeError) throw routeError;

  observation.dialogCountAfter = await dialog.count();
  const save = page.getByRole("button", { name: /^Save(?:$| \()/ });
  observation.saveCount = await save.count();
  if (observation.saveCount === 1) observation.saveDisabled = await save.isDisabled();
  return validateMcpConfirmObservation(observation);
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

function toolMatches(component, plan) {
  let data = component?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = Object.fromEntries(data.split(/\r?\n/).flatMap((line) => {
        const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
        return match ? [[match[1], match[2]]] : [];
      }));
    }
  }
  const dialog = data?.dialog ?? data;
  return component?.schemaname === plan.componentSchemaName
    && (dialog?.$kind === plan.readBack.kind || dialog?.kind === plan.readBack.kind)
    && dialog?.connectorId === plan.connectorId
    && dialog?.operationId === plan.operationId
    && dialog?.connectionReference === plan.connectionReference;
}

export function verifyReadBack(body, plan) {
  const rows = body?.value;
  if (!Array.isArray(rows)) throw new Error("Unexpected Dataverse read-back schema");
  const matches = rows.filter((row) => toolMatches(row, plan));
  if (matches.length !== 1) throw new Error(`Expected one exact tool; found ${matches.length}`);
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
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { nonJson: true }; }
  }
  return { status: response.status(), ok: response.ok(), body };
}

async function sameOriginWrite(page, seedUrl, url, headers, payload) {
  const origin = new URL(url).origin;
  return withInheritedHeaders(page, (target) => new URL(target).origin === origin, headers, async () => {
    const seed = await page.goto(seedUrl);
    if (!seed?.ok()) throw new Error(`Gateway session seed failed: HTTP ${seed?.status()}`);
    return page.evaluate(async ({ target, body }) => {
      const response = await fetch(target, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let responseBody = null;
      if (text) {
        try { responseBody = JSON.parse(text); } catch { responseBody = { nonJson: true }; }
      }
      return { status: response.status, ok: response.ok, body: responseBody };
    }, { target: url, body: payload });
  });
}

export async function executeApprovedPlan(page, plan) {
  validatePlan(plan);
  const originalUrl = page.url();
  if (new URL(originalUrl).origin !== "https://copilotstudio.microsoft.com") {
    throw new Error("Open the target agent in Copilot Studio first");
  }

  const gatewaySeed = page.waitForRequest((request) =>
    request.url().startsWith(plan.origin) && request.url().includes("/api/botmanagement/v1/"));
  const dataverseSeed = page.waitForRequest((request) =>
    /\/api\/data\/v9\.2\/bots/i.test(request.url()));
  await page.reload();
  const [gatewayRequest, dataverseRequest] = await Promise.all([gatewaySeed, dataverseSeed]);
  try {
    const gatewayHeaders = inheritedHeaders(gatewayRequest);
    const dataverseHeaders = inheritedHeaders(dataverseRequest);
    const dataverseOrigin = new URL(dataverseRequest.url()).origin;
    const filter = encodeURIComponent(
      `_parentbotid_value eq ${plan.botId} and componenttype eq 9`,
    );
    const readUrl = `${dataverseOrigin}/api/data/v9.2/botcomponents`
      + `?$select=botcomponentid,schemaname,name,data&$filter=${filter}`;

    const before = await navigateJson(page, readUrl, dataverseHeaders);
    if (!before.ok) throw new Error(`MCP preflight read failed: HTTP ${before.status}`);
    const existing = before.body?.value?.filter((row) => toolMatches(row, plan)) ?? [];
    if (existing.length > 1) throw new Error("Multiple exact MCP tools already exist");
    if (existing.length === 1) {
      return { status: "already-present", writeStatus: null, readBackStatus: before.status };
    }

    const writeUrl = `${plan.origin}${plan.path}?includeWorkflows=true`;
    const write = await sameOriginWrite(
      page, gatewayRequest.url(), writeUrl, gatewayHeaders, plan.payload,
    );
    if (!write.ok) throw new Error(`MCP tool write failed: HTTP ${write.status}`);

    const after = await navigateJson(page, readUrl, dataverseHeaders);
    if (!after.ok) throw new Error(`MCP read-back failed: HTTP ${after.status}`);
    verifyReadBack(after.body, plan);
    return { status: "added-verified", writeStatus: write.status, readBackStatus: after.status };
  } finally {
    await page.goto(originalUrl);
  }
}

export async function runApprovedPlan(page, planPath, expectedHash, reportPath = null) {
  const plan = await loadApprovedPlan(planPath, expectedHash);
  const result = await executeApprovedPlan(page, plan);
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(result, null, 2), "utf8");
  }
  return result;
}

export function validateInitialToolApprovals(approvals) {
  if (!Array.isArray(approvals) || approvals.length === 0) {
    throw new Error("Initial tool approvals must be a non-empty array");
  }
  const keys = new Set();
  let target = null;
  for (const approval of approvals) {
    if (!approval?.planPath || !approval?.expectedHash) {
      throw new Error("Each initial tool approval requires planPath and expectedHash");
    }
    const current = `${approval.environmentId ?? ""}/${approval.botId ?? ""}`.toLowerCase();
    if (target === null) target = current;
    if (current && target && current !== target) {
      throw new Error("Initial tool approvals must target one environment and bot");
    }
    const key = `${approval.connectorId ?? ""}/${approval.operationId ?? ""}`.toLowerCase();
    if (key !== "/" && keys.has(key)) throw new Error("Duplicate initial tool approval");
    if (key !== "/") keys.add(key);
  }
  return approvals;
}

export async function loadInitialToolApprovals(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.contract !== "copilot-studio-v2-initial-tools/2026-09-14") {
    throw new Error("Unsupported initial tool manifest contract");
  }
  const loaded = [];
  for (const approval of manifest.approvals ?? []) {
    const planPath = resolve(dirname(manifestPath), approval.planPath);
    const plan = await loadApprovedPlan(planPath, approval.expectedHash);
    loaded.push({
      ...approval,
      environmentId: plan.environmentId,
      botId: plan.botId,
      connectorId: plan.connectorId,
      operationId: plan.operationId,
      plan,
    });
  }
  return validateInitialToolApprovals(loaded);
}

export async function runInitialToolProvisioning(page, manifestPath, reportPath = null) {
  const approvals = await loadInitialToolApprovals(manifestPath);
  const results = [];
  for (const approval of approvals) {
    results.push({
      connectorId: approval.connectorId,
      operationId: approval.operationId,
      ...(await executeApprovedPlan(page, approval.plan)),
    });
  }
  const report = { status: "verified", tools: results };
  if (reportPath) {
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  }
  return report;
}