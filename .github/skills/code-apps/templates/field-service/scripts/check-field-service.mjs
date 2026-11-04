import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line))
  .map(line => {
    const index = line.indexOf("=")
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")]
  }))
const errors = []
if (!/^[a-z][a-z0-9]{1,7}$/.test(env.PUBLISHER_PREFIX ?? "")) {
  errors.push("PUBLISHER_PREFIX must contain 2-8 lowercase alphanumeric characters, starting with a letter.")
}
if (env.PUBLISHER_PREFIX !== env.VITE_PUBLISHER_PREFIX) {
  errors.push("PUBLISHER_PREFIX and VITE_PUBLISHER_PREFIX must match.")
}
const guide = fs.readFileSync(path.join(root, "src", "guide-config.ts"), "utf8")
const sources = []
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name !== "generated") visit(file)
    else if (entry.isFile() && /\.tsx?$/.test(file)) sources.push(fs.readFileSync(file, "utf8"))
  }
}
visit(path.join(root, "src"))
const declaredTargets = new Set(sources.flatMap(source =>
  [...source.matchAll(/\sdata-tour=["']([^"']+)["']/g)].map(([, target]) => target),
))
for (const [, target] of guide.matchAll(/target:\s*["']([^"']+)["']/g)) {
  if (!declaredTargets.has(target)) {
    errors.push(`Missing guide target: ${target}`)
  }
}
const routes = fs.readFileSync(path.join(root, "src", "router.tsx"), "utf8")
const declaredRoutes = new Set([...routes.matchAll(/path:\s*["']([^"']+)["']/g)].map(([, route]) => route.replace(/^\//, "")))
for (const [, route] of guide.matchAll(/path:\s*["']([^"']+)["']/g)) {
  if (!declaredRoutes.has(route.replace(/^\//, ""))) errors.push(`Missing guide route: ${route}`)
}
if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}
if (env.VITE_FEATURE_MAPS === "true") {
  let directory = root
  let script
  for (;;) {
    const candidate = path.join(directory, ".github", "skills", "code-apps", "scripts", "configure_code_app_csp.py")
    if (fs.existsSync(candidate)) { script = candidate; break }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  if (!script) {
    console.error("Install the development standard before enabling maps; CSP cannot be verified.")
    process.exit(1)
  }
  const result = spawnSync("python", [script, "--directive", "Frame-Src", "--source", "https://www.google.com", "--assert"], { cwd: root, stdio: "inherit" })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log("Field Service configuration and guide checks passed.")
