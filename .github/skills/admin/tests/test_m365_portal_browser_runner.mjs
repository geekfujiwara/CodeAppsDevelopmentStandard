import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  canonicalHash,
  runApprovedPlan,
  validatePlan,
} from "../scripts/m365_portal_browser_runner.mjs";

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
