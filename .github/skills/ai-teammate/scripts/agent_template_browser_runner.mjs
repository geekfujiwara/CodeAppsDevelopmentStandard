import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ORIGIN = "https://admin.cloud.microsoft";
const CONTRACT = "m365-agent-template-upload/2026-09-14";
const UPLOAD_PATH = "/fd/addins/api/apps/uploadCustomApp";
const UPLOAD_QUERY = "workloads=AzureActiveDirectory,WXPO,MetaOS,SharePoint";
const TENANT_PATH = "/api/tenantauthorization/GetTenantInfoV2";
const FINALIZE_PATH = "/fd/addins/api/v2/actionableApps";
const READ_BACK_PATH = "/fd/addins/api/agents";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TITLE_ID = /^T_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_HEADER_NAMES = new Set([
  "ajaxsessionkey",
  "x-admin-portal-flight",
  "x-adminapp-request",
  "x-ms-mac-appid",
  "x-ms-mac-hostingapp",
  "x-ms-mac-target-app",
  "x-ms-mac-version",
  "x-usage-origin",
]);

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${asciiJson(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return asciiJson(value);
}

export function canonicalHash(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} fields do not match the observed contract`);
  }
}

function validatePackage(packageInfo) {
  assertExactKeys(
    packageInfo,
    ["sha256", "size", "manifestId", "version", "title", "agenticUserTemplateId", "blueprintId"],
    "package",
  );
  if (!/^[0-9a-f]{64}$/.test(packageInfo.sha256)) throw new Error("package sha256 is invalid");
  if (!Number.isSafeInteger(packageInfo.size) || packageInfo.size <= 0) throw new Error("package size is invalid");
  if (!GUID.test(packageInfo.manifestId) || !GUID.test(packageInfo.blueprintId)) {
    throw new Error("package identifiers are invalid");
  }
  if (!/^\d+\.\d+\.\d+$/.test(packageInfo.version)) throw new Error("package version is invalid");
  if (![packageInfo.title, packageInfo.agenticUserTemplateId].every((value) => typeof value === "string" && value)) {
    throw new Error("package text identity is invalid");
  }
}

export function validateStagePlan(plan) {
  assertExactKeys(
    plan,
    ["contract", "origin", "operation", "tenantId", "package", "upload", "tenantRead", "finalize", "readBack"],
    "stage plan",
  );
  if (plan.contract !== CONTRACT || plan.origin !== ORIGIN || plan.operation !== "agent-template-stage") {
    throw new Error("stage operation mismatch");
  }
  if (!GUID.test(plan.tenantId)) throw new Error("tenantId is invalid");
  validatePackage(plan.package);
  assertExactKeys(plan.upload, ["method", "path", "query", "fieldName", "contentType"], "upload");
  if (
    plan.upload.method !== "POST" ||
    plan.upload.path !== UPLOAD_PATH ||
    plan.upload.query !== UPLOAD_QUERY ||
    plan.upload.fieldName !== "AppFile" ||
    plan.upload.contentType !== "application/x-zip-compressed"
  ) throw new Error("upload contract mismatch");
  assertExactKeys(plan.finalize, ["method", "path", "command", "workload"], "finalize");
  if (
    plan.tenantRead !== TENANT_PATH ||
    plan.finalize.method !== "POST" ||
    plan.finalize.path !== FINALIZE_PATH ||
    plan.finalize.command !== "FINALIZEPACKAGE" ||
    plan.finalize.workload !== "MetaOS" ||
    plan.readBack !== READ_BACK_PATH
  ) throw new Error("finalize contract mismatch");
  return plan;
}

export function buildFinalizePlan(stagePlan, stageBody) {
  validateStagePlan(stagePlan);
  const detail = stageBody?.appDetail;
  if (stageBody?.statusCode !== "Success" || !detail || typeof detail !== "object") {
    throw new Error("staging response did not report success");
  }
  const requiredFields = [
    "manifestId", "currentVersion", "title", "agentBlueprintClientId", "workload",
    "isDeployed", "titleIdToLog", "mosOperationId",
  ];
  if (requiredFields.some((field) => !(field in detail))) {
    throw new Error("staging response is missing required identity fields");
  }
  const expected = stagePlan.package;
  if (
    detail.manifestId?.toLowerCase() !== expected.manifestId.toLowerCase() ||
    detail.currentVersion !== expected.version ||
    detail.title !== expected.title ||
    detail.agentBlueprintClientId?.toLowerCase() !== expected.blueprintId.toLowerCase()
  ) throw new Error("staging response identity mismatch");
  if (detail.workload !== "MetaOS" || detail.isDeployed !== false) {
    throw new Error("staging response state mismatch");
  }
  if (!TITLE_ID.test(detail.titleIdToLog) || !GUID.test(detail.mosOperationId)) {
    throw new Error("staging response operation identifiers are invalid");
  }
  return {
    contract: CONTRACT,
    origin: ORIGIN,
    operation: "agent-template-finalize",
    tenantId: stagePlan.tenantId,
    package: expected,
    method: "POST",
    path: FINALIZE_PATH,
    payload: {
      Apps: [{
        AppId: detail.titleIdToLog,
        Command: "FINALIZEPACKAGE",
        Workload: "MetaOS",
        Version: expected.version,
        MosOperationId: detail.mosOperationId,
      }],
    },
    readBack: READ_BACK_PATH,
  };
}

export function validateFinalizePlan(plan) {
  assertExactKeys(
    plan,
    ["contract", "origin", "operation", "tenantId", "package", "method", "path", "payload", "readBack"],
    "finalize plan",
  );
  if (
    plan.contract !== CONTRACT ||
    plan.origin !== ORIGIN ||
    plan.operation !== "agent-template-finalize" ||
    plan.method !== "POST" ||
    plan.path !== FINALIZE_PATH ||
    plan.readBack !== READ_BACK_PATH ||
    !GUID.test(plan.tenantId)
  ) throw new Error("finalize plan contract mismatch");
  validatePackage(plan.package);
  assertExactKeys(plan.payload, ["Apps"], "finalize payload");
  if (!Array.isArray(plan.payload.Apps) || plan.payload.Apps.length !== 1) {
    throw new Error("finalize payload must contain one app");
  }
  const app = plan.payload.Apps[0];
  assertExactKeys(app, ["AppId", "Command", "Workload", "Version", "MosOperationId"], "finalize app");
  if (
    !TITLE_ID.test(app.AppId) ||
    app.Command !== "FINALIZEPACKAGE" ||
    app.Workload !== "MetaOS" ||
    app.Version !== plan.package.version ||
    !GUID.test(app.MosOperationId)
  ) throw new Error("finalize app contract mismatch");
  return plan;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadApprovedStagePlan(planPath, packagePath, expectedHash) {
  const plan = validateStagePlan(await loadJson(planPath));
  if (!expectedHash || canonicalHash(plan) !== expectedHash) throw new Error("approved stage plan hash mismatch");
  const bytes = await readFile(packagePath);
  if (bytes.length !== plan.package.size || createHash("sha256").update(bytes).digest("hex") !== plan.package.sha256) {
    throw new Error("package does not match approved stage plan");
  }
  return { plan, bytes };
}

export async function loadApprovedFinalizePlan(planPath, expectedHash) {
  const plan = validateFinalizePlan(await loadJson(planPath));
  if (!expectedHash || canonicalHash(plan) !== expectedHash) throw new Error("approved finalize plan hash mismatch");
  return plan;
}

function pickSessionHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).filter(([name]) => SESSION_HEADER_NAMES.has(name.toLowerCase())),
  );
}

// Same two-stage capture as admin/scripts/m365_portal_browser_runner.mjs: a hidden tab gets no
// request events and may serve the reload from cache, so fall back to hooking the page's own calls.
async function sessionHeaders(page, timeoutMs) {
  try {
    const seed = page.waitForRequest(
      (request) => request.url().startsWith(`${ORIGIN}/fd/addins/api/`) && request.method() === "GET",
      { timeout: timeoutMs },
    );
    await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
    const headers = pickSessionHeaders(await (await seed).allHeaders());
    if (headers.ajaxsessionkey) return headers;
  } catch {
    // fall through to the in-page hook
  }
  await page.evaluate((headerNames) => {
    window.__m365SeedHeaders = null;
    if (window.__m365SeedHooked) return;
    window.__m365SeedHooked = true;
    const keep = (url, entries) => {
      if (window.__m365SeedHeaders || !String(url).includes("/fd/addins/api/")) return;
      const picked = {};
      for (const [name, value] of entries) if (headerNames.includes(name.toLowerCase())) picked[name] = value;
      if (picked.ajaxsessionkey) window.__m365SeedHeaders = picked;
    };
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const source = (init && init.headers) || (input instanceof Request ? input.headers : undefined);
        keep(input instanceof Request ? input.url : input, new Headers(source).entries());
      } catch {
        // ignore header inspection errors
      }
      return originalFetch.apply(this, arguments);
    };
    const { open, setRequestHeader, send } = XMLHttpRequest.prototype;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__m365Url = url;
      this.__m365Headers = [];
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      (this.__m365Headers ||= []).push([name, value]);
      return setRequestHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try {
        keep(this.__m365Url, this.__m365Headers || []);
      } catch {
        // ignore header inspection errors
      }
      return send.apply(this, arguments);
    };
  }, [...SESSION_HEADER_NAMES]);
  const deadline = Date.now() + timeoutMs;
  const originalHash = await page.evaluate(() => location.hash);
  const hops = ["#/agents/overview", originalHash && originalHash !== "#/agents/overview" ? originalHash : "#/agents/all"];
  for (let hop = 0; Date.now() < deadline; hop += 1) {
    await page.evaluate((hash) => {
      location.hash = hash;
    }, hops[hop % hops.length]);
    await page.waitForTimeout(3_000);
    const headers = await page.evaluate(() => window.__m365SeedHeaders);
    if (headers?.ajaxsessionkey) return pickSessionHeaders(headers);
  }
  throw new Error("browser session header was not observed");
}

async function browserRequest(page, headers, request) {
  return page.evaluate(async ({ headers: session, request: approved }) => {
    const parse = async (response) => {
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(approved.path, location.origin).pathname}`);
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
        if (typeof body === "string") body = JSON.parse(body);
      } catch {
        throw new Error(`non-JSON response from ${new URL(approved.path, location.origin).pathname}`);
      }
      return { status: response.status, body };
    };
    if (approved.fileBase64) {
      const bytes = Uint8Array.from(atob(approved.fileBase64), (character) => character.charCodeAt(0));
      const form = new FormData();
      form.append(approved.fieldName, new Blob([bytes], { type: approved.contentType }), approved.fileName);
      const response = await fetch(`${approved.path}?${approved.query}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: session,
        body: form,
        signal: AbortSignal.timeout(approved.timeoutMs ?? 20_000),
      });
      return parse(response);
    }
    const response = await fetch(approved.path, {
      method: approved.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json", ...session, ...(approved.body ? { "Content-Type": "application/json" } : {}) },
      body: approved.body ? JSON.stringify(approved.body) : undefined,
      signal: AbortSignal.timeout(approved.timeoutMs ?? 20_000),
    });
    return parse(response);
  }, { headers, request });
}

async function assertTenant(page, headers, tenantId) {
  const response = await browserRequest(page, headers, { path: TENANT_PATH });
  const actual = response.body?.Tenant?.Id;
  if (typeof actual !== "string" || !GUID.test(actual) || actual.toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error("authenticated browser tenant does not match approved tenant");
  }
}

export async function stageApprovedPackage(page, planPath, packagePath, expectedHash, options = {}) {
  const { plan, bytes } = await loadApprovedStagePlan(planPath, packagePath, expectedHash);
  if (new URL(page.url()).origin !== ORIGIN) throw new Error("browser is not on the approved origin");
  const headers = await sessionHeaders(page, options.timeoutMs ?? 20_000);
  await assertTenant(page, headers, plan.tenantId);
  const response = await browserRequest(page, headers, {
    path: plan.upload.path,
    query: plan.upload.query,
    fieldName: plan.upload.fieldName,
    contentType: plan.upload.contentType,
    fileName: basename(packagePath),
    fileBase64: bytes.toString("base64"),
    timeoutMs: options.timeoutMs ?? 20_000,
  });
  const finalizePlan = buildFinalizePlan(plan, response.body);
  if (options.finalizePlanPath) {
    await mkdir(dirname(options.finalizePlanPath), { recursive: true });
    await writeFile(options.finalizePlanPath, `${JSON.stringify(finalizePlan, null, 2)}\n`, "utf8");
  }
  return { stageStatus: response.status, finalizePlan, finalizeHash: canonicalHash(finalizePlan) };
}

function findReadBack(value, titleId, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findReadBack(item, titleId, depth + 1);
      if (match) return match;
    }
  } else if (value && typeof value === "object") {
    if ([value.titleId, value.titleIdToLog, value.appId].includes(titleId)) return value;
    for (const item of Object.values(value)) {
      const match = findReadBack(item, titleId, depth + 1);
      if (match) return match;
    }
  }
  return null;
}

export async function finalizeApprovedPackage(page, planPath, expectedHash, options = {}) {
  const plan = await loadApprovedFinalizePlan(planPath, expectedHash);
  if (new URL(page.url()).origin !== ORIGIN) throw new Error("browser is not on the approved origin");
  const headers = await sessionHeaders(page, options.timeoutMs ?? 20_000);
  await assertTenant(page, headers, plan.tenantId);
  const existing = await browserRequest(page, headers, { path: plan.readBack });
  const existingApp = findReadBack(existing.body, plan.payload.Apps[0].AppId);
  if (existingApp) {
    const existingVersion = existingApp.currentVersion ?? existingApp.version ?? existingApp.latestVersion;
    if (existingVersion !== plan.package.version) throw new Error("existing Agent template version mismatch");
    return {
      writeStatus: null,
      readBackStatus: existing.status,
      titleId: plan.payload.Apps[0].AppId,
      alreadyPublished: true,
    };
  }
  const write = await browserRequest(page, headers, { method: plan.method, path: plan.path, body: plan.payload });
  let readBack;
  let app = null;
  const maxPolls = options.maxPolls ?? 30;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    readBack = await browserRequest(page, headers, { path: plan.readBack });
    app = findReadBack(readBack.body, plan.payload.Apps[0].AppId);
    if (app) break;
    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs ?? 2_000));
  }
  if (!app) throw new Error("published Agent template was not found in read-back");
  const actualVersion = app.currentVersion ?? app.version ?? app.latestVersion;
  if (actualVersion !== plan.package.version) throw new Error("published Agent template version mismatch");
  return {
    writeStatus: write.status,
    readBackStatus: readBack.status,
    titleId: plan.payload.Apps[0].AppId,
    alreadyPublished: false,
  };
}