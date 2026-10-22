import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

let root = process.cwd();
let script;
for (;;) {
  const candidate = path.join(root, ".github", "skills", "code-apps", "scripts", "deploy_code_app.py");
  if (existsSync(candidate)) {
    script = candidate;
    break;
  }
  const parent = path.dirname(root);
  if (parent === root) break;
  root = parent;
}
if (!script) {
  console.error("Missing code-apps skill deploy_code_app.py. Install the development standard in this workspace.");
  process.exit(1);
}
const result = spawnSync("python", [script, ...process.argv.slice(2)], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
