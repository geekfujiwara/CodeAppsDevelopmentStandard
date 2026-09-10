import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"
import { validatePlantDesign } from "../src/data/plant-design.ts"
import { appendAgentReply, MAX_AGENT_QUESTION_LENGTH, replaceTrailingSelection, selectionKey } from "../src/lib/plant-agent-contract.ts"
import { applyDesignPlan, briefBoundary, buildDesignPrompt, confirmDesignPlan, designContextJson, EMPTY_DESIGN_BRIEF, extractJsonObject, initialDesignBrief, moduleCatalog, requestedDesignSite, validateDesignBrief } from "../src/lib/plant-design-assistant.ts"

const brief = { ...EMPTY_DESIGN_BRIEF, siteName: "東ヤード", siteWidth: 60, siteDepth: 40, access: "北辺に搬入路", goal: "工業用水の前処理" }

test("keeps only the latest selection card when no message was sent in between", () => {
  const card = (label) => ({ role: "selection", label })
  assert.deepEqual(replaceTrailingSelection([card("A")]), [])
  assert.deepEqual(replaceTrailingSelection([{ role: "assistant" }, card("A")]), [{ role: "assistant" }])
  assert.deepEqual(replaceTrailingSelection([card("A"), { role: "user" }]), [card("A"), { role: "user" }])
  assert.deepEqual(replaceTrailingSelection([]), [])
  const history = [card("A"), { role: "user" }, card("B"), { role: "assistant", text: "A reply" }]
  assert.deepEqual(replaceTrailingSelection(history), [card("A"), history[1], history[3]])
  assert.equal(history.length, 4)
  const pending = [card("A"), { role: "user" }, card("B")]
  const reply = { role: "assistant", text: "A reply" }
  assert.deepEqual(appendAgentReply(pending, reply), [pending[0], pending[1], reply, pending[2]])
  assert.notEqual(selectionKey({ modelId: "design", nodeId: null, unitId: "feed1" }), selectionKey({ modelId: "design", nodeId: null, unitId: "feed2" }))
})

test("brief rejects invalid dimensions rather than silently changing the request", () => {
  const ring = briefBoundary(brief)
  assert.deepEqual(ring[0], ring.at(-1))
  assert.equal(ring[1][0] - ring[0][0], 60)
  assert.equal(ring[2][1] - ring[1][1], 40)
  for (const value of [1, 9000, Number.NaN, Infinity]) assert.throws(() => briefBoundary({ ...brief, siteWidth: value }))
  assert.ok(validateDesignBrief({ ...brief, clearance: -1 }).length)
  assert.equal(briefBoundary({ ...brief, siteWidth: 60.5 })[1][0] * 2, 60.5)
})

test("initial brief and unchanged dimensions preserve the original site geometry", () => {
  const design = structuredClone(DEFAULT_PLANT_DESIGN)
  design.site.boundary = [[0, 0], [80, 0], [60, 50], [0, 50], [0, 0]]
  design.site.clearance = 3
  const initial = initialDesignBrief(design)
  assert.equal(initial.siteWidth, 80)
  assert.equal(initial.siteDepth, 50)
  assert.deepEqual(requestedDesignSite(design, initial), design.site)
})

test("the generated prompt exposes the module catalog, the brief and the output contract", () => {
  const catalog = moduleCatalog(DEFAULT_PLANT_DESIGN)
  assert.ok(catalog.every((entry) => entry.sizeX > 0 && entry.sizeZ > 0))
  assert.deepEqual(catalog.find((entry) => entry.moduleId === "feed")?.equipment.map((node) => node.nodeId), ["tank", "valve", "pump"])
  assert.ok(catalog.find((entry) => entry.moduleId === "power")?.equipment[0].ports.includes("power:power"))
  const prompt = buildDesignPrompt(DEFAULT_PLANT_DESIGN, brief)
  assert.ok(prompt.length < MAX_AGENT_QUESTION_LENGTH)
  for (const expected of ["東ヤード", "北辺に搬入路", "工業用水の前処理", "\"moduleId\":\"feed\"", "json"]) assert.ok(prompt.includes(expected), expected)
})

test("extracts the JSON object from fenced, prefixed and nested replies", () => {
  assert.equal(extractJsonObject("説明\n```json\n{\"a\":1}\n```\n後書き"), '{"a":1}')
  assert.equal(extractJsonObject("```\n{\"a\":{\"b\":2}}\n```"), '{"a":{"b":2}}')
  assert.equal(extractJsonObject('前置き {"a":"}"} 後置き'), '{"a":"}"}')
  assert.equal(extractJsonObject('{"a":"\\\\"}'), '{"a":"\\\\"}')
  assert.throws(() => extractJsonObject("JSON はありません"))
  assert.throws(() => extractJsonObject("{\"a\": 1"))
  assert.throws(() => extractJsonObject('```json\n{}\n```\n```json\n{}\n```'))
  assert.throws(() => extractJsonObject('{} {}'))
  assert.throws(() => extractJsonObject(" ".repeat(500001) + "{}"))
})

test("applies an agent plan onto the edited design and reports validation issues", () => {
  const plan = {
    name: "AI 案",
    site: DEFAULT_PLANT_DESIGN.site,
    units: [{ id: "feed1", moduleId: "feed", name: "移送 A", position: [-16, 0, -6], rotation: 0 }, { id: "storage1", moduleId: "storage", name: "製品槽 A", position: [16, 0, -6], rotation: 0 }],
    connections: [],
    notes: "動線を確保",
  }
  const applied = applyDesignPlan(DEFAULT_PLANT_DESIGN, "配置しました\n```json\n" + JSON.stringify(plan) + "\n```")
  assert.equal(applied.design.name, "AI 案")
  assert.equal(applied.design.id, DEFAULT_PLANT_DESIGN.id)
  assert.deepEqual(applied.design.modules, DEFAULT_PLANT_DESIGN.modules)
  assert.equal(applied.design.units.length, 2)
  assert.equal(applied.notes, "動線を確保")
  assert.deepEqual(applied.issues, [])

  const overlapping = { ...plan, units: [plan.units[0], { ...plan.units[1], position: [-16, 0, -6] }] }
  assert.ok(applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify(overlapping)).issues.some((issue) => issue.code === "overlap"))
  assert.ok(applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify({ design: plan })).design.units.length === 2)
  assert.throws(() => applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify({ ...plan, units: [] })))
  assert.throws(() => applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify({ ...plan, units: [{ id: "x", moduleId: "feed", name: "x", position: [0, 0], rotation: 0 }] })))
  assert.ok(applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify({ ...plan, units: [{ id: "x", moduleId: "missing", name: "x", position: [0, 0, 0], rotation: 0 }] })).issues.some((issue) => issue.code === "reference"))
  assert.throws(() => applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify({ ...plan, modules: [] })))
  const alteredSite = { ...plan, site: { ...plan.site, clearance: 0, exclusions: [] } }
  assert.equal(applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify(alteredSite), brief).issues.filter((issue) => issue.code === "brief").length, 2)
  const basis = JSON.stringify(DEFAULT_PLANT_DESIGN)
  assert.deepEqual(confirmDesignPlan(DEFAULT_PLANT_DESIGN, basis, applied), applied.design)
  assert.throws(() => confirmDesignPlan({ ...DEFAULT_PLANT_DESIGN, name: "changed" }, basis, applied))
  assert.throws(() => confirmDesignPlan(DEFAULT_PLANT_DESIGN, basis, applyDesignPlan(DEFAULT_PLANT_DESIGN, JSON.stringify(overlapping))))
})

test("the design context describes the selected object without any retrieval binding", () => {
  const context = JSON.parse(designContextJson(DEFAULT_PLANT_DESIGN, "feed1", "feed1/pump", "impeller"))
  assert.equal(context.scope, "object")
  assert.equal(context.selected.unitId, "feed1")
  assert.equal(context.selected.equipment.nodeId, "pump")
  assert.equal(context.selected.equipment.partId, "impeller")
  assert.ok(context.selected.equipment.ports.includes("power:power"))
  assert.ok(context.selected.linkedConnections.includes("feed-process"))
  assert.equal(context.units.length, DEFAULT_PLANT_DESIGN.units.length)
  assert.deepEqual(context.issues, validatePlantDesign(DEFAULT_PLANT_DESIGN).map((issue) => issue.message))

  assert.equal(JSON.parse(designContextJson(DEFAULT_PLANT_DESIGN, "feed1", null)).scope, "unit")
  assert.equal(JSON.parse(designContextJson(DEFAULT_PLANT_DESIGN, "", null)).scope, "design")
  assert.equal(JSON.parse(designContextJson(DEFAULT_PLANT_DESIGN, "feed1", "other/pump", "impeller")).selected.equipment, null)
  assert.equal(context.selected.internalConnections.length, 2)
})
