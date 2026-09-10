import { mkdir, writeFile } from "node:fs/promises"
import Ajv from "ajv"
import standaloneCode from "ajv/dist/standalone/index.js"
import { PLANT_DESIGN_SCHEMA } from "../src/data/plant-design-schema.ts"
import { DEFAULT_PLANT_DESIGN } from "../src/data/plant-design-sample.ts"

const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } })
const compiled = ajv.compile(PLANT_DESIGN_SCHEMA)
let code = standaloneCode(ajv, compiled)
if (code.includes('require("ajv/dist/runtime/ucs2length").default')) {
  code = 'import ucs2lengthExport from "ajv/dist/runtime/ucs2length.js";\nconst ucs2length = typeof ucs2lengthExport === "function" ? ucs2lengthExport : ucs2lengthExport.default;\n' + code.replaceAll('require("ajv/dist/runtime/ucs2length").default', "ucs2length")
}
if (code.includes("require(") || code.includes("new Function(")) throw new Error("Validator contains runtime code generation or unsupported imports")
await writeFile(new URL("../src/data/plant-design-validator.js", import.meta.url), code)
for (const directory of ["../public/plant-design/", "../plant-design-skill/"]) {
  const output = new URL(directory, import.meta.url)
  await mkdir(output, { recursive: true })
  await writeFile(new URL("schema.json", output), JSON.stringify(PLANT_DESIGN_SCHEMA, null, 2))
  await writeFile(new URL("sample.json", output), JSON.stringify(DEFAULT_PLANT_DESIGN, null, 2))
}
console.log("Generated CSP-compatible validator, shared schema and design samples")