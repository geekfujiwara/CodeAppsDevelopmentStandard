# Modular Plant Addon

JSON-driven concept-layout core for an existing Code Apps project. This is an **addon, not a replacement scaffold or a finished UI**. Initialize new apps with `../generic-base`; integrate the selected modules into that app. No environment IDs, SDK-generated services, credentials, live records or deployed table mappings are included.

## Included

| Asset | Purpose |
|---|---|
| `src/data/plant-design-schema.ts` | Strict versioned JSON contract, bounded collections and coordinates |
| `src/data/plant-design.ts` | Parse, transform module instances, validate footprints/site/exclusions/routes, diff and cascade removal |
| `src/data/plant-network.ts` | Shared equipment ports, process/power routing and endpoint checks |
| `src/data/plant-design-store.ts` | Storage interface, raw JSON SHA-256, stale-baseline checks, append-only-by-convention revisions |
| `src/plant-assembly.ts` | Three.js equipment envelopes, port nozzles and route cylinders with stable picking IDs; disposal |
| `agent-skill/` | Flat Python candidate generator, shared schema/sample and review-only agent instructions |
| `scripts/generate-design.mjs` | Clean generation of an Ajv standalone validator and matching agent/public JSON |
| `tests/` | Geometry, schema, concurrency, CSP generation, UTF-8 and Python/TypeScript parity regression tests |

The four unit modules (feed, treatment, storage, power) and all equipment properties/documents are synthetic. Shapes are simplified envelopes, not CAD. The renderer adapter has no camera, controls or React page; follow the integration workflow below.

## Step 1: Run the Addon Checks

From this directory, with Node.js 22.18+ and Python 3.10+:

```powershell
npm install
python -m pip install -r agent-skill/requirements.txt
npm run generate
npm run typecheck
npm test
npm run test:skill
```

While this directory is inside the development-standard repository, also run `npm run test:metadata`; that test exercises the shared `../../scripts/check_design_metadata.py` and is not standalone after copying only the addon.

## Step 2: Integrate into Code Apps

Merge dependencies into the existing package rather than replacing its package/configuration files. Copy the required `src/data/plant-*` modules and `src/plant-assembly.ts`, or import them through a project-local addon folder. Regenerate validators when the schema changes. The generated JavaScript and its declaration must be shipped together; never instantiate Ajv's compiler inside the browser.

Use `parsePlantDesign` for bounded JSON imports and `assertPlantDesign` before shared saving. Build nodes with `compilePlantDesign` and add `createPlantAssembly(nodes)` to the existing Three.js scene. Dispose the previous assembly on replacement and the renderer/controls on unmount. Frame both site and equipment bounds. Use resize observation with a stable responsive viewer height, selection via `userData.nodeId`, and camera controls from Three.js `OrbitControls`.

Implement layout/connection/review views using the host app's existing design system: module selector; X/Z inputs; 0/90/180/270 rotation; duplicate/delete; undo/redo; boundary/exclusion JSON editing; source/target ports; route elevation/lane; import/export; revision list and proposal diff/accept/reject. Run schema checks on every draft preview. Confirm before replacing unsaved work and provide reload/export after conflicts. Never overwrite the user's current draft merely because a background refresh returned.

Coordinates are metres; X/Z form the site plane. Unit transforms rotate local geometry about Y and translate to world space. IDs are local within modules and compiled as `unitId/nodeId`; never join different models using tag text alone. Top-level JSON is at most 500 KB, with 30 units, 20 modules and 300 instantiated equipment nodes. The footprint includes module equipment and internal route points, conservatively inflated by clearance.

## Step 3: Bind Shared Storage

Follow [the shared-design contract](../../references/modular-plant-design.md) after environment and schema approval. Implement `DesignStorage.latest` using descending revision order and `append` as a create-only revision request through the existing Dataverse SDK wrapper. Resolve entity sets and navigation properties from metadata, not guessed plurals. A unique design/revision key must be Active. A mock store is only for tests, not shared persistence.

Use the root `.env` for the integration parameters listed in [the environment example](../../references/modular-plant.env.example). The metadata check writes an exclusive new output file; move the environment-specific table map into the deployed flat agent bundle, never into this public template.

## Step 4: Attach the Candidate Skill

Use the existing `copilot-studio-v2` update workflow, with this `agent-skill` directory and a unique `SKILL_NAME`. Existing tools/skills must remain unchanged. The dialogue stays in Teams; Code Apps reviews the same Dataverse proposal records, with no embedded v2 chat.

```powershell
python -X utf8 agent-skill/design_plant.py --input agent-skill/sample.json --layout --output candidate-UNIQUE.json
python -X utf8 agent-skill/design_plant.py --input candidate-UNIQUE.json --validate
```

Replace UNIQUE on every run. Site requirements optionally contain only `boundary`, `exclusions`, `clearance` and are passed via `--requirements`. Supply the complete required unit list; the greedy search preserves unit IDs and connectivity rather than silently deleting requirements. Updating module/port conventions requires changing both implementations and running parity tests.

## Verification and Limits

Local tests verify actual cylinder/nozzle endpoint transforms for all four rotations, not just matching JSON positions. They do not run a browser. Before shipping the integrated app, use the approved Edge profile and VS Code integrated browser to test desktop/mobile screenshots, nonblank canvas pixels, camera movement, picking, JSON import/export, reload, proposal review and authenticated shared saving. If browser attachment fails, report that gate as blocked; do not open a different profile or claim visual validation.

The candidate generator is bounded greedy search, not an optimizer or proof of infeasibility. Validation covers schema, planar unit envelopes/site/exclusions and endpoints. It does not check internal equipment collisions, whole-plant 3D clashes, flow direction, self/duplicate connections, process capacity, seismic/structural design, electrical protection, hazardous-area zoning or legal compliance.

Revision immutability and approval separation are **not enforced by this client library**. A unique key does not prevent updating an existing row or an adoption/rejection race. Use separate identities/roles and a transactional server-side approval operation before production. File attachment and publish success do not prove dependency installation or Teams execution; run the [agent evaluation cases](../../references/modular-plant-evals.md).