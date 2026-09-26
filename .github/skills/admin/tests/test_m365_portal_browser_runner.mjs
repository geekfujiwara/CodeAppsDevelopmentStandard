import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertTemplateActivationReadBack,
  canonicalHash,
  captureSessionHeaders,
  pageOrigin,
  runApprovedPlan,
  validatePlan,
  validateStageRequest,
} from "../scripts/m365_portal_browser_runner.mjs";
import { toSandboxBody } from "../scripts/build_browser_bundle.mjs";
import { readFile } from "node:fs/promises";

const lifecyclePlan = {
  origin: "https://admin.cloud.microsoft",
  operation: "agent-lifecycle",
  method: "POST",
  path: "/fd/addins/api/apps",
  query: {},
  payload: { WorkloadManagementList: [] },
  readBack: "/fd/addins/api/agents",
};

test("canonical hash is independent of object key order", () => {
  assert.equal(canonicalHash({ a: 1, b: 2 }), canonicalHash({ b: 2, a: 1 }));
});

test("canonical hash matches the Python planner for non-ASCII text", () => {
  assert.equal(
    canonicalHash({ label: "公開", a: 1 }),
    "31df002d712a1505df7ae9aef407de26bfa3ef5c3a1d56e1816cc26d63d2b3f8",
  );
});

test("allows the observed lifecycle endpoint", () => {
  assert.equal(validatePlan(lifecyclePlan), lifecyclePlan);
});

test("allows the observed publish endpoint", () => {
  const plan = {
    ...lifecyclePlan,
    operation: "agent-publish",
    path: "/fd/addins/api/v2/actionableApps",
  };
  assert.equal(validatePlan(plan), plan);
});

test("rejects a write path that does not match the operation", () => {
  assert.throws(
    () => validatePlan({ ...lifecyclePlan, path: "/fd/addins/api/other" }),
    /write contract mismatch/,
  );
});

const updateAppPlan = {
  ...lifecyclePlan,
  operation: "agent-update-app",
  payload: { WorkloadManagementList: [{ Command: "UPDATEAPP" }], SendEmailToUsers: false },
};

test("allows a single UPDATEAPP workload", () => {
  assert.equal(validatePlan(updateAppPlan), updateAppPlan);
});

test("update app rejects other commands and assignment changes", () => {
  assert.throws(
    () => validatePlan({ ...updateAppPlan, payload: { WorkloadManagementList: [{ Command: "DEPLOY" }] } }),
    /single UPDATEAPP workload/,
  );
  assert.throws(
    () => validatePlan({ ...updateAppPlan, payload: { ...updateAppPlan.payload, UserAssignmentDetails: {} } }),
    /must not change user assignment/,
  );
});

test("rejects an unobserved read-back path", () => {
  assert.throws(
    () => validatePlan({ ...lifecyclePlan, readBack: "/admin/api/users" }),
    /readBack is not allowlisted/,
  );
});

test("request approval requires a workload query", () => {
  assert.throws(
    () =>
      validatePlan({
        ...lifecyclePlan,
        operation: "agent-request-approve",
        path: "/fd/addins/api/agentActions/approve",
      }),
    /requires workload query/,
  );
});

test("allows the observed permission update payload", () => {
  const plan = {
    ...lifecyclePlan,
    operation: "agent-permission-update",
    path: "/fd/addins/api/v2/AgentPermission/update",
    payload: {
      ActiveDirectoryAppId: "agent-app-example",
      PermissionRequestData: [
        {
          Type: "Role",
          Action: "Grant",
          ResourceId: "resource-example",
          Scope: "role.example",
          AppId: "api-example",
        },
      ],
    },
  };
  assert.equal(validatePlan(plan), plan);
});

test("rejects incomplete permission update payload", () => {
  assert.throws(
    () =>
      validatePlan({
        ...lifecyclePlan,
        operation: "agent-permission-update",
        path: "/fd/addins/api/v2/AgentPermission/update",
        payload: { ActiveDirectoryAppId: "agent-app-example", PermissionRequestData: [{}] },
      }),
    /fields do not match/,
  );
});

test("runApprovedPlan rejects an unapproved hash before browser access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "m365-runner-"));
  const planPath = join(directory, "plan.json");
  await writeFile(planPath, JSON.stringify(lifecyclePlan), "utf8");
  let browserWasAccessed = false;
  const page = new Proxy({}, { get: () => { browserWasAccessed = true; } });
  try {
    await assert.rejects(runApprovedPlan(page, planPath, "not-approved"), /approved plan hash mismatch/);
    assert.equal(browserWasAccessed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const observedHeaders = { ajaxsessionkey: "k", "x-ms-mac-appid": "a", cookie: "must-not-leak" };

test("captureSessionHeaders keeps only allowlisted headers from the reload request", async () => {
  const page = {
    waitForRequest: async () => ({ allHeaders: async () => observedHeaders }),
    reload: async () => {},
  };
  assert.deepEqual(await captureSessionHeaders(page), { ajaxsessionkey: "k", "x-ms-mac-appid": "a" });
});

test("captureSessionHeaders falls back to the in-page hook when request events are not observed", async () => {
  const results = [undefined, "#/agents/all", undefined, observedHeaders];
  const page = {
    waitForRequest: async () => {
      throw new Error("Timeout");
    },
    reload: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => results.shift(),
  };
  assert.deepEqual(await captureSessionHeaders(page), { ajaxsessionkey: "k", "x-ms-mac-appid": "a" });
});

test("agent allow accepts only a single ALLOW SharedAgent workload", () => {
  const plan = {
    ...lifecyclePlan,
    operation: "agent-allow",
    path: "/fd/addins/api/availableAgents",
    payload: { WorkloadManagementList: [{ Command: "ALLOW", Workload: "SharedAgent" }] },
  };
  assert.equal(validatePlan(plan), plan);
  assert.throws(
    () => validatePlan({ ...plan, payload: { WorkloadManagementList: [{ Command: "DEPLOY", Workload: "MetaOS" }] } }),
    /single ALLOW SharedAgent workload/,
  );
});

test("stage request allows DEPLOY without productId and UPDATEAPP with a titleId", () => {
  assert.doesNotThrow(() => validateStageRequest({ zipPath: "C:/tmp/plugin.zip", actionType: "DEPLOY" }));
  assert.doesNotThrow(() =>
    validateStageRequest({
      zipPath: "C:/tmp/plugin.zip",
      actionType: "UPDATEAPP",
      productId: "T_00000000-0000-0000-0000-000000000000",
    }),
  );
  assert.throws(() => validateStageRequest({ zipPath: "C:/tmp/plugin.zip", actionType: "UPDATEAPP" }), /titleId/);
  assert.throws(() => validateStageRequest({ zipPath: "C:/tmp/plugin.zip", actionType: "DELETE" }), /DEPLOY or UPDATEAPP/);
  assert.throws(() => validateStageRequest({ zipPath: "C:/tmp/plugin.json", actionType: "DEPLOY" }), /\.zip/);
});

const TITLE = "T_00000000-0000-4000-8000-000000000001";
const MEMBER = { id: "00000000-0000-0000-0000-000000000001", type: "User" };
const activatePlan = {
  origin: "https://admin.cloud.microsoft",
  operation: "agent-template-activate",
  method: "POST",
  path: `/fd/addins/api/v2/agenticapps/${TITLE}/allowUsers`,
  query: { workloads: "SharedAgent", overwrite: "true" },
  payload: { members: [MEMBER], userAssignmentCategory: "SpecificUsers" },
  readBack: `/fd/addins/api/availableAgents/details/${TITLE}`,
};

test("template activation accepts the observed allowUsers contract", () => {
  assert.equal(validatePlan(activatePlan), activatePlan);
});

test("template activation rejects mismatched read-back, missing overwrite and empty SpecificUsers", () => {
  assert.throws(
    () => validatePlan({ ...activatePlan, readBack: "/fd/addins/api/availableAgents/details/T_00000000-0000-0000-0000-000000000000" }),
    /same titleId/,
  );
  assert.throws(() => validatePlan({ ...activatePlan, query: { workloads: "SharedAgent" } }), /overwrite=true/);
  assert.throws(
    () => validatePlan({ ...activatePlan, payload: { members: [], userAssignmentCategory: "SpecificUsers" } }),
    /at least one member/,
  );
  assert.throws(
    () => validatePlan({ ...activatePlan, path: "/fd/addins/api/v2/agenticapps/../apps/allowUsers" }),
    /write contract mismatch/,
  );
});

test("template activation read-back must match the approved member set", () => {
  const body = { appDetail: { allowedOnboardingUsersCategory: "SpecificUsers", allowedOnboardingUsersAndGroups: [{ id: MEMBER.id.toUpperCase(), type: "User" }] } };
  assert.equal(assertTemplateActivationReadBack(activatePlan, body), true);
  assert.equal(assertTemplateActivationReadBack(activatePlan, JSON.stringify(body)), true);
  assert.throws(
    () => assertTemplateActivationReadBack(activatePlan, { appDetail: { ...body.appDetail, allowedOnboardingUsersAndGroups: [] } }),
    /members mismatch/,
  );
});

test("pageOrigin works without the URL global", () => {
  assert.equal(pageOrigin({ url: () => "https://ADMIN.cloud.microsoft/?#/agents/all" }), "https://admin.cloud.microsoft");
  assert.equal(pageOrigin({ url: () => "about:blank" }), "null");
});

test("sandbox bundle evaluates with only page and no URL/import/require", async () => {
  const source = await readFile(new URL("../scripts/m365_portal_browser_runner.mjs", import.meta.url), "utf8");
  const runner = new Function("URL", "require", toSandboxBody(source))(undefined, undefined);
  assert.equal(runner.validatePlan(activatePlan), activatePlan);
  const page = new Proxy({}, { get: () => () => "https://evil.example/" });
  await assert.rejects(runner.executeApprovedPlan(page, activatePlan), /approved origin/);
  assert.throws(() => runner.canonicalHash(activatePlan), /Node-only/);
});

test("sandbox bundle rejects unexpected runner imports and Node-side URL use", () => {
  assert.throws(() => toSandboxBody('import x from "node:http";\nexport function validatePlan(){}\nexport async function executeApprovedPlan(){}'), /unexpected runner import/);
  assert.throws(() => toSandboxBody("export function validatePlan(){}\nexport async function executeApprovedPlan(){}\nnew URL(page.url())"), /pageOrigin/);
});
