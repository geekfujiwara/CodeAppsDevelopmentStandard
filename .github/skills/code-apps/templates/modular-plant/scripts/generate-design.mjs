import { mkdir, writeFile } from "node:fs/promises"
import Ajv from "ajv"
import standaloneCode from "ajv/dist/standalone/index.js"
import { PLANT_DESIGN_SCHEMA } from "../src/data/plant-design-schema.ts"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"

const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } })
const compiled = ajv.compile(PLANT_DESIGN_SCHEMA)
if (!compiled(DEFAULT_PLANT_DESIGN)) throw new Error(ajv.errorsText(compiled.errors))
let code = standaloneCode(ajv, compiled)
const runtime = 'require("ajv/dist/runtime/ucs2length").default'
if (code.includes(runtime)) {
  code = 'import ucs2lengthExport from "ajv/dist/runtime/ucs2length.js";\nconst ucs2length = typeof ucs2lengthExport === "function" ? ucs2lengthExport : ucs2lengthExport.default;\n' + code.replaceAll(runtime, "ucs2length")
}
if (/\brequire\s*\(|\bnew\s+Function\s*\(|\beval\s*\(/.test(code)) throw new Error("Unsupported runtime code generation/import in validator")
await writeFile(new URL("../src/data/plant-design-validator.js", import.meta.url), code)
const { assertPlantDesign } = await import("../src/data/plant-design.ts")
assertPlantDesign(JSON.stringify(DEFAULT_PLANT_DESIGN))
for (const directory of ["../public/plant-design/", "../agent-skill/"]) {
  const output = new URL(directory, import.meta.url)
  await mkdir(output, { recursive: true })
  await writeFile(new URL("schema.json", output), JSON.stringify(PLANT_DESIGN_SCHEMA, null, 2))
  await writeFile(new URL("sample.json", output), JSON.stringify(DEFAULT_PLANT_DESIGN, null, 2))
}
console.log("Generated and validated standalone schema validator and shared JSON artifacts")