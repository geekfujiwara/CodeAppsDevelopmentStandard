import { mkdir, writeFile } from "node:fs/promises"
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js"
import { PLANT_SAMPLES } from "../src/data/plant-catalog.ts"
import { createPlantAssembly, disposePlantObject } from "../src/lib/plant-scene.ts"

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() })
  }
}

const output = new URL("../public/models/", import.meta.url)
await mkdir(output, { recursive: true })
for (const [index, sample] of PLANT_SAMPLES.entries()) {
  const assembly = createPlantAssembly(sample.nodes)
  assembly.name = sample.code
  assembly.userData.modelId = sample.id
  const glb = await new GLTFExporter().parseAsync(assembly, { binary: true })
  const filename = index === 0 ? "process-plant-demo.glb" : `${sample.id}.glb`
  await writeFile(new URL(filename, output), new Uint8Array(glb))
  disposePlantObject(assembly)
  console.log(`Generated ${filename} (${glb.byteLength} bytes, ${sample.nodes.length} nodes)`)
}