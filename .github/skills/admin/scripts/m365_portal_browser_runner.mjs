import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = "https://admin.cloud.microsoft";
const CONTRACTS = new Map([
  ["frontier-access", { method: "POST", path: "/admin/api/settings/company/frontier/access" }],
  ["agent-availability", { method: "POST", path: "/fd/addins/api/availableAgents" }],
  ["agent-lifecycle", { method: "POST", path: "/fd/addins/api/apps" }],
  ["agent-publish", { method: "POST", path: "/fd/addins/api/v2/actionableApps" }],
  ["agent-permission-approve", { method: "POST", path: "/fd/addins/api/agentActions/approve" }],
  ["agent-permission-approve-v1", { method: "POST", path: "/fd/addins/api/v1/agentactions/approve" }],
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
  if (plan.operation.startsWith("agent-permission-approve")) {
    if (!plan.query || typeof plan.query.workload !== "string" || !plan.query.workload) {
      throw new Error("permission approval requires workload query");
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

export async function executeApprovedPlan(page, plan, options = {}) {
  validatePlan(plan);
  const pageOrigin = new URL(page.url()).origin;
  if (pageOrigin !== ORIGIN) throw new Error("browser is not on the approved origin");

  const seedRequestPromise = page.waitForRequest(
    (request) => request.url().startsWith(`${ORIGIN}/fd/addins/api/`) && request.method() === "GET",
    { timeout: options.headerTimeoutMs ?? 20_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: options.headerTimeoutMs ?? 20_000 });
  const seedHeaders = await (await seedRequestPromise).allHeaders();
  const sessionHeaders = Object.fromEntries(
    Object.entries(seedHeaders).filter(([name]) => SESSION_HEADER_NAMES.has(name.toLowerCase())),
  );
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
