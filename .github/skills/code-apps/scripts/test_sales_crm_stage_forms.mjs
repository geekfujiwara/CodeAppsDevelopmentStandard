import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

const project = process.argv[2]
if (!project) throw new Error("Pass the generated CRM project path")
const require = createRequire(path.resolve(project, "package.json"))
const ts = require("typescript")
const calls = []
globalThis.crmStageFormTestCalls = calls
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const schemaSource = (await readFile(path.join(project, "src", "crm", "schema.ts"), "utf8"))
  .replaceAll("import.meta.env.", "({}).")
const schemaUrl = dataUrl(ts.transpileModule(schemaSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText)
const clientUrl = dataUrl(`
export const createRecord = async (...args) => globalThis.crmStageFormTestCalls.push(["create", ...args]);
export const updateRecord = async (...args) => globalThis.crmStageFormTestCalls.push(["update", ...args]);
export const deleteRecord = () => {};
export const getRecord = () => {};
export const listRecords = () => {};
`)
const apiSource = (await readFile(path.join(project, "src", "crm", "api.ts"), "utf8"))
  .replaceAll("@/crm/schema", schemaUrl).replaceAll("@/lib/dataverse-client", clientUrl)
const api = await import(dataUrl(ts.transpileModule(apiSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText))
const { ENTITIES, OpportunityStage, col } = await import(schemaUrl)
const def = ENTITIES.opportunity
for (const reason of [null, "", "   "]) {
  assert.deepEqual(api.missingRequired(def, {
    [col("name")]: "Test", [col("stage")]: OpportunityStage.Lost, [col("lossreason")]: reason,
  }), ["失注理由"])
}
assert.deepEqual(api.missingRequired(def, {
  [col("name")]: "Test", [col("stage")]: OpportunityStage.Proposal,
}), [])
const values = {
  [col("name")]: "Test", [col("stage")]: OpportunityStage.Lost, [col("lossreason")]: "Approved reason",
}
assert.deepEqual(api.missingRequired(def, values), [])
await api.saveEntity(def, values, "synthetic-id")
assert.equal(calls.length, 1)
assert.equal(calls[0][0], "update")
assert.equal(calls[0][3][col("stage")], OpportunityStage.Lost)
assert.equal(calls[0][3][col("lossreason")], "Approved reason")
assert.ok(!def.fields.some((field) => field.name === col("historypermit")))
delete globalThis.crmStageFormTestCalls
console.log("PASS: loss reason required only for Lost; stage/reason sent atomically; proof never exposed")
