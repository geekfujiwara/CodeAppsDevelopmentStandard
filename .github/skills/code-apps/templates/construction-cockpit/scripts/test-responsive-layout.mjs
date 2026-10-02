import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")
const layout = read("src/pages/_layout.tsx")
const sidebar = read("src/components/sidebar.tsx")
const styles = read("styles/index.pcss")
const cssFile = fs.readdirSync(path.join(root, "dist", "assets")).find((name) => /^index-.*\.css$/.test(name))

if (!cssFile) throw new Error("Production CSS bundle was not found. Run npm run build first.")

const bundle = read(path.join("dist", "assets", cssFile))
const assertions = [
  [layout.includes("md:w-[calc(100%-14rem)]"), "expanded content width subtracts the 14rem sidebar"],
  [layout.includes("2xl:w-[calc(100%-16rem)]"), "wide content width subtracts the 16rem sidebar"],
  [layout.includes("md:w-[calc(100%-4rem)]"), "collapsed content width subtracts the 4rem sidebar"],
  [layout.includes("md:flex-none"), "desktop content does not combine flex growth with a sidebar margin"],
  [sidebar.includes('"w-56 2xl:w-64"'), "sidebar width matches the content-width contract"],
  [styles.includes("grid-cols-[minmax(0,1fr)_auto]"), "hero uses a non-overlapping grid"],
  [styles.includes("overflow-x-hidden"), "document prevents host-level horizontal scrolling"],
  [bundle.includes("calc(100% - 14rem)"), "compiled CSS contains the host-width calculation"],
  [bundle.includes("calc(100% - 16rem)"), "compiled CSS contains the wide host-width calculation"],
  [bundle.includes("grid-template-columns:minmax(0,1fr) auto"), "compiled CSS contains the hero grid"],
  [bundle.includes("overflow-x:hidden"), "compiled CSS contains the horizontal overflow guard"],
]

const failed = assertions.filter(([passed]) => !passed)
for (const [passed, message] of assertions) {
  console.log(`${passed ? "OK" : "NG"}: ${message}`)
}

if (failed.length) process.exit(1)
