import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalHash,
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

test("permission approval requires a workload query", () => {
  assert.throws(
    () =>
      validatePlan({
        ...lifecyclePlan,
        operation: "agent-permission-approve",
        path: "/fd/addins/api/agentActions/approve",
      }),
    /requires workload query/,
  );
});
