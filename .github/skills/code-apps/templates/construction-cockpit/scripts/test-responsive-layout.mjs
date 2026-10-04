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
