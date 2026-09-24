import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = "https://admin.cloud.microsoft";
const CONTRACTS = new Map([
  ["frontier-access", { method: "POST", path: "/admin/api/settings/company/frontier/access" }],
  ["agent-availability", { method: "POST", path: "/fd/addins/api/availableAgents" }],
  ["agent-lifecycle", { method: "POST", path: "/fd/addins/api/apps" }],
  ["agent-publish", { method: "POST", path: "/fd/addins/api/v2/actionableApps" }],
  ["agent-update-app", { method: "POST", path: "/fd/addins/api/apps" }],
  ["agent-allow", { method: "POST", path: "/fd/addins/api/availableAgents" }],
  ["agent-request-approve", { method: "POST", path: "/fd/addins/api/agentActions/approve" }],
  ["agent-permission-update", { method: "POST", path: "/fd/addins/api/v2/AgentPermission/update" }],
  ["agent-request-approve-v1", { method: "POST", path: "/fd/addins/api/v1/agentactions/approve" }],
]);
const READ_PATHS = [
  /^\/admin\/api\/settings\/company\/frontier\/access$/,
  /^\/fd\/addins\/api\/agents(?:\/.*)?$/,
  /^\/fd\/addins\/api\/availableAgents\/details\/[^/]+$/,
  /^\/fd\/addins\/api\/deploymentRequestStatus\/[^/]+$/,
];
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

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function canonicalHash(plan) {
  return createHash("sha256").update(canonicalJson(plan), "utf8").digest("hex");
}

function assertRelativePath(path, label) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`${label} must be an origin-relative path`);
  }
}

export function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("plan must be an object");
  const contract = CONTRACTS.get(plan.operation);
  if (!contract) throw new Error("operation is not allowlisted");
  if (plan.origin !== ORIGIN) throw new Error("origin is not allowlisted");
  if (plan.method !== contract.method || plan.path !== contract.path) throw new Error("write contract mismatch");
  assertRelativePath(plan.path, "path");
  assertRelativePath(plan.readBack, "readBack");
  if (!READ_PATHS.some((pattern) => pattern.test(plan.readBack))) throw new Error("readBack is not allowlisted");
  if (!plan.payload || typeof plan.payload !== "object" || Array.isArray(plan.payload)) {
    throw new Error("payload must be an object");
  }
  if (plan.operation === "agent-request-approve") {
    if (!plan.query || typeof plan.query.workload !== "string" || !plan.query.workload) {
      throw new Error("request approval requires workload query");
    }
  }
  if (plan.operation === "agent-update-app") {
    const items = plan.payload.WorkloadManagementList;
    if (!Array.isArray(items) || items.length !== 1 || items[0]?.Command !== "UPDATEAPP") {
      throw new Error("update app requires a single UPDATEAPP workload");
    }
    if ("UserAssignmentDetails" in plan.payload) throw new Error("update app must not change user assignment");
  }
  if (plan.operation === "agent-allow") {
    const items = plan.payload.WorkloadManagementList;
    if (!Array.isArray(items) || items.length !== 1 || items[0]?.Command !== "ALLOW" || items[0]?.Workload !== "SharedAgent") {
      throw new Error("agent allow requires a single ALLOW SharedAgent workload");
    }
  }
  if (plan.operation === "agent-permission-update") {
    const requests = plan.payload.PermissionRequestData;
    if (typeof plan.payload.ActiveDirectoryAppId !== "string" || !plan.payload.ActiveDirectoryAppId) {
      throw new Error("permission update requires ActiveDirectoryAppId");
    }
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("permission update requires PermissionRequestData");
    }
    const fields = ["Action", "AppId", "ResourceId", "Scope", "Type"];
    for (const request of requests) {
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        throw new Error("permission request must be an object");
      }
      if (Object.keys(request).sort().join(",") !== fields.join(",")) {
        throw new Error("permission request fields do not match the observed contract");
      }
      if (!["Scope", "Role"].includes(request.Type) || !["Grant", "Revoke"].includes(request.Action)) {
        throw new Error("permission request enum is invalid");
      }
      if (![request.ResourceId, request.Scope, request.AppId].every((value) => typeof value === "string" && value)) {
        throw new Error("permission request identifiers must be non-empty strings");
      }
    }
  }
  return plan;
}

export async function loadApprovedPlan(planPath, expectedHash) {
  const plan = validatePlan(JSON.parse(await readFile(planPath, "utf8")));
  const actualHash = canonicalHash(plan);
  if (!expectedHash || actualHash !== expectedHash) throw new Error("approved plan hash mismatch");
  return plan;
}

export async function runApprovedPlan(page, planPath, expectedHash, options = {}) {
  const plan = await loadApprovedPlan(planPath, expectedHash);
  return executeApprovedPlan(page, plan, options);
}

function pickSessionHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers || {}).filter(([name]) => SESSION_HEADER_NAMES.has(name.toLowerCase())),
  );
}

// 1st: reload して Playwright の request event から取得する。
// 2nd: 統合ブラウザのタブが非表示だと request event が届かない・reload がキャッシュで API を呼ばないことがあるため、
//      ページ自身の fetch / XHR をフックし、SPA のルート遷移で発生する管理センター API 呼び出しから取得する。
export async function captureSessionHeaders(page, options = {}) {
  const timeout = options.headerTimeoutMs ?? 20_000;
  try {
    const seedRequestPromise = page.waitForRequest(
      (request) => request.url().startsWith(`${ORIGIN}/fd/addins/api/`) && request.method() === "GET",
      { timeout },
    );
    await page.reload({ waitUntil: "domcontentloaded", timeout });
    const headers = pickSessionHeaders(await (await seedRequestPromise).allHeaders());
    if (headers.ajaxsessionkey) return headers;
  } catch {
    // fall through to the in-page hook
  }
  const names = [...SESSION_HEADER_NAMES];
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
  }, names);
  const deadline = Date.now() + timeout;
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
  return {};
}

const STAGE_ACTIONS = new Set(["DEPLOY", "UPDATEAPP"]);

export function validateStageRequest({ zipPath, actionType, productId } = {}) {
  if (typeof zipPath !== "string" || !/\.zip$/i.test(zipPath)) throw new Error("zipPath must be a .zip file");
  if (!STAGE_ACTIONS.has(actionType)) throw new Error("stage actionType must be DEPLOY or UPDATEAPP");
  if (actionType === "UPDATEAPP" && !/^T_[0-9a-f-]+$/i.test(productId || "")) {
    throw new Error("UPDATEAPP requires the plugin titleId as productId");
  }
  if (actionType === "DEPLOY" && productId) throw new Error("DEPLOY must not send productId");
}

// Cowork プラグイン ZIP を検証・ステージする（公開はまだ行わない）。戻り値は後続 plan の作成に必要な ID だけ。
export async function stageCustomApp(page, request, options = {}) {
  validateStageRequest(request);
  const pageOrigin = new URL(page.url()).origin;
  if (pageOrigin !== ORIGIN) throw new Error("browser is not on the approved origin");
  const headers = await captureSessionHeaders(page, options);
  if (!headers.ajaxsessionkey) throw new Error("browser session header was not observed");
  await page.evaluate(() => {
    let input = document.getElementById("__cowork_stage_file");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "__cowork_stage_file";
      input.style.display = "none";
      document.body.appendChild(input);
    }
  });
  await page.locator("#__cowork_stage_file").setInputFiles(request.zipPath);
  return page.evaluate(
    async ({ actionType, productId, headers: sessionHeaders }) => {
      const file = document.getElementById("__cowork_stage_file").files[0];
      const body = new FormData();
      body.append("AppFile", file, file.name);
      if (productId) body.append("ProductId", productId);
      body.append("Locale", "en");
      body.append("ContentMarket", "en");
      body.append("WorkloadType", "MetaOS");
      body.append("ActionType", actionType);
      const response = await fetch("/fd/addins/api/apps/uploadCustomApp?workloads=MetaOS", {
        method: "POST",
        credentials: "include",
        headers: sessionHeaders,
        body,
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        throw new Error(`non-JSON response from uploadCustomApp (HTTP ${response.status})`);
      }
      const detail = json?.appDetail || {};
      if (!response.ok || json?.statusCode !== "Success") {
        return {
          ok: false,
          status: response.status,
          statusCode: json?.statusCode ?? null,
          errorMessage: json?.errorMessage ?? null,
          existingTitleId: detail.titleId ?? null,
        };
      }
      return {
        ok: true,
        status: response.status,
        titleId: detail.titleId,
        manifestId: detail.manifestId,
        mosOperationId: detail.mosOperationId,
        currentVersion: detail.currentVersion,
        latestVersion: detail.latestVersion,
        appType: detail.appType,
      };
    },
    { actionType: request.actionType, productId: request.productId || null, headers },
  );
}

export async function executeApprovedPlan(page, plan, options = {}) {
  validatePlan(plan);
  const pageOrigin = new URL(page.url()).origin;
  if (pageOrigin !== ORIGIN) throw new Error("browser is not on the approved origin");

  const sessionHeaders = await captureSessionHeaders(page, options);
  if (!sessionHeaders.ajaxsessionkey) throw new Error("browser session header was not observed");

  return page.evaluate(
    async ({ approvedPlan, headers, pollIntervalMs, maxPolls }) => {
      const requestJson = async (path, init = {}) => {
        const response = await fetch(path, {
          credentials: "include",
          cache: "no-store",
          ...init,
          headers: { Accept: "application/json", ...headers, ...init.headers },
        });
        let body = null;
        const text = await response.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            throw new Error(`non-JSON response from ${new URL(path, location.origin).pathname}`);
          }
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(path, location.origin).pathname}`);
        return { status: response.status, body };
      };
      const withQuery = (path, query = {}) => {
        const url = new URL(path, location.origin);
        for (const [name, value] of Object.entries(query || {})) url.searchParams.set(name, String(value));
        return `${url.pathname}${url.search}`;
      };

      const write = await requestJson(withQuery(approvedPlan.path, approvedPlan.query), {
        method: approvedPlan.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approvedPlan.payload),
      });
      const requestId =
        write.body?.appManagementRequestID ??
        write.body?.deploymentRequestId ??
        write.body?.requestId ??
        write.body?.RequestId;
      let deploymentStatus = null;
      let polls = 0;
      if (requestId) {
        for (; polls < maxPolls; polls += 1) {
          const poll = await requestJson(
            `/fd/addins/api/deploymentRequestStatus/${encodeURIComponent(requestId)}`,
          );
          deploymentStatus =
            poll.body?.appsManagementStatus?.[0]?.status ??
            poll.body?.requestStatus ?? poll.body?.status ?? poll.body?.deploymentStatus ?? poll.body?.udStatusCode;
          if (!new Set(["InProgress", "Delayed", "Pending", null, undefined]).has(deploymentStatus)) break;
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
        if (polls === maxPolls) throw new Error("deployment polling timed out");
        if (new Set(["Failed", "Failure", "PartialSuccess"]).has(deploymentStatus)) {
          throw new Error(`deployment ended with ${deploymentStatus}`);
        }
      }

      const readBack = await requestJson(withQuery(approvedPlan.readBack, approvedPlan.readBackQuery));
      if (!readBack.body || typeof readBack.body !== "object") throw new Error("read-back schema mismatch");
      return {
        writeStatus: write.status,
        requestIdPresent: Boolean(requestId),
        deploymentStatus,
        polls,
        readBackStatus: readBack.status,
        readBackKeys: Object.keys(readBack.body).sort(),
      };
    },
    {
      approvedPlan: plan,
      headers: sessionHeaders,
      pollIntervalMs: options.pollIntervalMs ?? 2_000,
      maxPolls: options.maxPolls ?? 30,
    },
  );
}
