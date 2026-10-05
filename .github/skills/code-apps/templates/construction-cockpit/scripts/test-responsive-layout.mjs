import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const layout = read("src/pages/_layout.tsx")
const sidebar = read("src/components/sidebar.tsx")
const siteMap = read("src/pages/site-map.tsx")
const project = read("src/pages/project-detail.tsx")
const projectModel = read("src/components/project-model-3d.tsx")
const modelIndex = read("src/lib/models/index.ts")
const gltfLoader = read("src/lib/models/gltf-loader.ts")
const modelSources = ["bridge", "earthwork", "tunnel", "building", "channel", "road", "kit"].map((name) => read(`src/lib/models/${name}.ts`)).join("\n")
const bundledModelDir = path.join(root, "src", "assets", "models")
const bundledModels = fs.existsSync(bundledModelDir) ? fs.readdirSync(bundledModelDir).filter((name) => name.endsWith(".glb")) : []
const gantt = read("src/components/project-gantt-flow.tsx")
const photos = read("src/lib/site-photos.ts")
const pages = ["ky-new", "incident-new", "report-new"].map((name) => read(`src/pages/${name}.tsx`))
const recordLists = ["ky-activity", "incidents", "daily-reports", "knowledge"].map((name) => read(`src/pages/${name}.tsx`))
const recordDetails = read("src/pages/record-details.tsx")
const explorer = read("src/components/records/record-explorer.tsx")
const router = read("src/router.tsx")
const cadImport = read("src/lib/models/cad-import.ts")
const cadLoader = read("src/lib/models/cad-loader.ts")
const cadPanel = read("src/components/cad-import-panel.tsx")
const dataverseClient = read("src/lib/dataverse-client.ts")
const binary = read("src/lib/binary.ts")
const snapshot = read("src/lib/models/task-snapshot.ts")
// ローカル（app/ と agent/ が並ぶ構成）とテンプレート（同じルートに agent/ がある構成）の両方で読む
const progressUnitsPath = [path.join(root, "agent"), path.join(root, "..", "agent")].map((dir) => path.join(dir, "cockpit-assistant", "skills", "progress-3d-report", "progress_units.py")).find((file) => fs.existsSync(file))
const progressUnits = progressUnitsPath ? fs.readFileSync(progressUnitsPath, "utf8") : ""
const photoDir = path.join(root, "src", "assets", "demo-photos")
const photoCount = fs.existsSync(photoDir) ? fs.readdirSync(photoDir).filter((name) => name.endsWith(".svg")).length : 0
const styles = read("styles/index.pcss")
const cssFile = fs.readdirSync(path.join(root, "dist", "assets")).find((name) => /^index-.*\.css$/.test(name))

if (!cssFile) throw new Error("Production CSS bundle was not found. Run npm run build first.")

const bundle = read(path.join("dist", "assets", cssFile))
const assertions = [
  [layout.includes("md:grid-cols-[15rem_minmax(0,1fr)]"), "expanded sidebar participates in the application grid"],
  [layout.includes("md:grid-cols-[4.5rem_minmax(0,1fr)]"), "collapsed sidebar participates in the application grid"],
  [sidebar.includes("text-slate-200"), "inactive menu items have an explicit readable color"],
  [sidebar.includes("bg-slate-950"), "navigation background is explicit"],
  [!sidebar.includes("fixed left-0"), "desktop navigation is not removed from document flow"],
  [siteMap.includes("space-y-5 p-5 sm:p-6"), "map cards have explicit responsive padding"],
  [project.includes("p-5 shadow-sm"), "workspace cards have explicit padding"],
  [!siteMap.includes("地図から判断する"), "obsolete portfolio hero is removed"],
  [!layout.includes("今の現場"), "global project selector is removed"],
  [project.includes('defaultValue="map"'), "project portfolio opens with the map tab"],
  [project.includes('value="photos"') && project.includes('value="list"'), "photo and list portfolio tabs are present"],
  [project.includes("searchProjects"), "portfolio uses Dataverse project search"],
  [project.includes("ProjectModel3d"), "workspace includes the Three.js model"],
  [!projectModel.includes("Environment") && !projectModel.includes("raw.githack.com"), "Three.js model has no external HDR dependency"],
  [!projectModel.includes("<Html") && !/useGLTF|useTexture|<Text\b|<Environment/.test(projectModel), "Three.js model loads no external fonts, textures, or HDR"],
  [["buildBridge()", "buildEarthwork()", "buildTunnel()", "buildBuilding(", "buildChannel()", "buildRoad()"].every((name) => modelIndex.includes(name)), "high-detail 3D models exist for all six construction types"],
  [["hSection(", "roundedSlot(", "annulusSector(", "terrain("].every((name) => modelSources.includes(name)), "models use real structural sections and terrain, not plain boxes"],
  [projectModel.includes("LineDashedMaterial") && projectModel.includes("EdgesGeometry"), "the completed form is drawn as dashed outlines"],
  [projectModel.includes("clippingPlanes") && projectModel.includes("localClippingEnabled"), "in-progress parts are revealed by progress with clipping planes"],
  [projectModel.includes("temporary"), "temporary works are excluded from the completed form"],
  [gltfLoader.includes("parseAsync") && gltfLoader.includes("?inline") && !gltfLoader.includes("fetch("), "bundled glTF models are parsed without network access (CSP connect-src)"],
  [bundledModels.includes("bridge-3span.glb"), "the bridge model ships as a glTF (GLB) file"],
  [gantt.includes("predecessorId") && gantt.includes("遅延が波及"), "gantt draws predecessor edges and delay propagation"],
  [photos.includes("import.meta.glob") && photoCount >= 60, "demo site photos are bundled locally for the img-src 'self' CSP"],
  [pages.every((page) => page.includes("<ProjectPicker")), "KY, incident, and report entry forms let users choose the project in-page"],
  [recordLists.every((page) => page.includes("<RecordExplorer") && page.includes("charts=") && page.includes("filters=") && page.includes("searchText=") && page.includes("rowHref=")), "KY, incident, report, and knowledge pages show charts and a searchable, filterable list"],
  [explorer.includes("useSearchParams") && explorer.includes("navigate(rowHref(item))") && explorer.includes("isLoading") && explorer.includes("role=\"alert\"") && explorer.includes("emptyText"), "list rows open the detail page and the list shows loading, error, and empty states"],
  [["ky/:id", "incidents/:id", "reports/:id", "knowledge/:id", "ky/new", "incidents/new", "reports/new"].every((route) => router.includes(`"${route}"`)), "detail and entry routes are registered"],
  [["export function KyDetail", "export function IncidentDetail", "export function ReportDetail", "export function KnowledgeDetail"].every((name) => recordDetails.includes(name)), "each record type has a detail page"],
  [recordDetails.includes("reviewReport(id, action, comment)") && recordDetails.includes("incidentToKnowledge") && recordDetails.includes("<EditPanel"), "detail pages support review approval, knowledge conversion, and maintenance edits"],
  [cadImport.includes("KHR_draco_mesh_compression") && cadImport.includes("外部ファイル") && cadImport.includes("CAD_MAX_BYTES"), "CAD import rejects compressed, externally referenced, and oversized files before parsing"],
  [["glb", "obj", "stl", "fbx"].every((format) => cadImport.includes(`"${format}"`)), "CAD import supports GLB, OBJ, STL, and FBX"],
  [cadLoader.includes("parseAsync(buffer") && !cadLoader.includes("fetch(") && !/createObjectURL|new Blob\(/.test(cadLoader + cadImport + cadPanel), "CAD models are parsed from an ArrayBuffer without fetch or blob URLs"],
  [cadPanel.includes("CAD_ACCEPT") && cadPanel.includes("suggestCadRules") && cadPanel.includes("summarizeCadUnits"), "CAD import panel offers automatic mapping and saves construction units"],
  [dataverseClient.includes("UpdateEntityFileImageFieldContentWithOrganization") && dataverseClient.includes("GetEntityFileImageFieldContentWithOrganization") && !dataverseClient.includes("fetch("), "file and image columns are accessed only through the generated Dataverse service"],
  [binary.includes("Math.min(total + chunkBytes, expectedBytes)"), "chunked downloads never request a range past the end of the file (Dataverse returns 416)"],
  [projectModel.includes("SnapshotCapturer") && snapshot.includes("toDataURL(\"image/jpeg\"") && project.includes("saveTaskLocationImage"), "the selected task image is generated from the 3D view and can be saved to Dataverse"],
  [projectModel.includes("Math.max(0.05, count / 200) + 1e-6") && progressUnits.includes("max(0.05, count / 200) + 1e-6"), "3D unit rounding matches the Copilot Studio progress conversion"],
  [layout.includes("setCollapsed(true)"), "project detail automatically collapses navigation"],
  [project.includes('data-tour="review-queue"'), "supervisor review queue has a tutorial target"],
  [!siteMap.includes("orbit-") && !project.includes("orbit-"), "rebuilt pages do not depend on the previous Orbit CSS"],
  [!styles.includes(".orbit-"), "global styles do not retain the previous Orbit component layer"],
  [styles.includes("overflow-x-hidden"), "document prevents host-level horizontal scrolling"],
  [bundle.includes("grid-template-columns:15rem minmax(0,1fr)"), "compiled CSS contains the expanded grid"],
  [bundle.includes("grid-template-columns:4.5rem minmax(0,1fr)"), "compiled CSS contains the collapsed grid"],
  [bundle.includes("overflow-x:hidden"), "compiled CSS contains the horizontal overflow guard"],
]

const failed = assertions.filter(([passed]) => !passed)
for (const [passed, message] of assertions) {
  console.log(`${passed ? "OK" : "NG"}: ${message}`)
}

if (failed.length) process.exit(1)
