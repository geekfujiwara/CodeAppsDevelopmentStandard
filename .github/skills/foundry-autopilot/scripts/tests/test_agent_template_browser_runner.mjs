import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildFinalizePlan,
  canonicalHash,
  loadApprovedFinalizePlan,
  loadApprovedStagePlan,
  validateFinalizePlan,
  validateStagePlan,
} from "../agent_template_browser_runner.mjs";

const guid = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const packageInfo = {
  sha256: "a".repeat(64),
  size: 123,
  manifestId: guid(1),
  version: "1.2.3",
  title: "Example Agent",
  agenticUserTemplateId: "example-agentic-user",
  blueprintId: guid(2),
};

const stagePlan = {
  contract: "m365-agent-template-upload/2026-09-14",
  origin: "https://admin.cloud.microsoft",
  operation: "agent-template-stage",
  tenantId: guid(3),
  package: packageInfo,
  upload: {
    method: "POST",
    path: "/fd/addins/api/apps/uploadCustomApp",
    query: "workloads=AzureActiveDirectory,WXPO,MetaOS,SharePoint",
    fieldName: "AppFile",
    contentType: "application/x-zip-compressed",
  },
  tenantRead: "/api/tenantauthorization/GetTenantInfoV2",
  finalize: {
    method: "POST",
    path: "/fd/addins/api/v2/actionableApps",
    command: "FINALIZEPACKAGE",
    workload: "MetaOS",
  },
  readBack: "/fd/addins/api/agents",
};

const stageBody = {
  statusCode: "Success",
  appDetail: {
    manifestId: packageInfo.manifestId,
    currentVersion: packageInfo.version,
    title: packageInfo.title,
    agentBlueprintClientId: packageInfo.blueprintId,
    workload: "MetaOS",
    isDeployed: false,
    titleIdToLog: `T_${guid(4)}`,
    mosOperationId: guid(5),
  },
};

test("stage plan allows only the observed contracts", () => {
  assert.equal(validateStagePlan(stagePlan), stagePlan);
  assert.throws(() => validateStagePlan({ ...stagePlan, tenantRead: "/other" }), /contract mismatch/);
});

test("finalize plan binds stage identifiers and package identity", () => {
  const plan = buildFinalizePlan(stagePlan, stageBody);
  assert.equal(plan.payload.Apps[0].AppId, stageBody.appDetail.titleIdToLog);
  assert.equal(plan.payload.Apps[0].MosOperationId, stageBody.appDetail.mosOperationId);
  assert.equal(plan.package.sha256, packageInfo.sha256);
  assert.equal(validateFinalizePlan(plan), plan);
});

test("staging response identity mismatch is rejected", () => {
  assert.throws(
    () => buildFinalizePlan(stagePlan, { ...stageBody, appDetail: { ...stageBody.appDetail, currentVersion: "9.9.9" } }),
    /identity mismatch/,
  );
});

test("finalize payload cannot change version", () => {
  const plan = buildFinalizePlan(stagePlan, stageBody);
  const tampered = structuredClone(plan);
  tampered.payload.Apps[0].Version = "9.9.9";
  assert.throws(() => validateFinalizePlan(tampered), /app contract mismatch/);
});

test("finalize requires the separately approved hash before browser access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-template-finalize-"));
  const path = join(directory, "plan.json");
  const plan = buildFinalizePlan(stagePlan, stageBody);
  await writeFile(path, JSON.stringify(plan), "utf8");
  try {
    await assert.rejects(loadApprovedFinalizePlan(path, "not-approved"), /approved finalize plan hash mismatch/);
    assert.deepEqual(await loadApprovedFinalizePlan(path, canonicalHash(plan)), plan);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("canonical hash matches the Python planner for non-ASCII text", () => {
  assert.equal(
    canonicalHash({ label: "公開", a: 1 }),
    "31df002d712a1505df7ae9aef407de26bfa3ef5c3a1d56e1816cc26d63d2b3f8",
  );
});

test("stage load rejects a package changed after approval", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-template-stage-"));
  const planPath = join(directory, "plan.json");
  const packagePath = join(directory, "agent.zip");
  const bytes = Buffer.from("approved package");
  const plan = structuredClone(stagePlan);
  plan.package.size = bytes.length;
  plan.package.sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(planPath, JSON.stringify(plan), "utf8");
  await writeFile(packagePath, "changed package", "utf8");
  try {
    await assert.rejects(
      loadApprovedStagePlan(planPath, packagePath, canonicalHash(plan)),
      /package does not match approved stage plan/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});