import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// ── 定数 ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const projectName = path.basename(repoRoot);
const isWindows = process.platform === "win32";

const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 10;
const SPAWN_TIMEOUT_MS = 30_000;
const SERVICE_PRINCIPAL_VARS_REQUIRED_PATTERN =
  /Service Principal environment variables SP_CLIENT_ID, SP_CLIENT_SECRET, and SP_TENANT_ID must be set/i;
const WINDOWS_VENV_PYTHON = ["Scripts", "python.exe"];
const UNIX_VENV_PYTHON = ["bin", "python"];

/** Bootstrap 対象の Python skill 環境一覧 */
const PYTHON_ENVS = [
  {
    name: "spec-to-markdown",
    scriptsDir: path.join(repoRoot, ".github", "skills", "spec-to-markdown", "scripts"),
  },
  {
    name: "standard (auth_helper 等)",
    scriptsDir: path.join(repoRoot, ".github", "skills", "standard", "scripts"),
  },
];

// ── CLI モード判定 ────────────────────────────────────
function getMode(argv) {
  if (argv.includes("--setup")) return "setup";
  if (argv.includes("--postinstall")) return "postinstall";
  return "check";
}
const mode = getMode(process.argv);

// ── ユーティリティ ────────────────────────────────────
const lines = [];
const blockers = [];

function log(status, message) {
  lines.push(`${status} ${message}`);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: SPAWN_TIMEOUT_MS,
    ...options,
  });
}

function firstNonEmpty(...values) {
  return values.find((v) => v && v.trim());
}

// ── チェック関数 ──────────────────────────────────────
function checkNodeAndNpm() {
  const nodeVersion = process.version;
  const major = Number(nodeVersion.replace(/^v/, "").split(".")[0]);
  if (Number.isFinite(major) && major >= 18) {
    log("✅", `Node.js ${nodeVersion} (推奨: v18+)`);
  } else {
    log("❌", `Node.js ${nodeVersion} は非推奨です — v18 以上を利用してください`);
    blockers.push("node");
  }

  const npm = run("npm", ["--version"]);
  if (npm.status === 0) {
    log("✅", `npm ${firstNonEmpty(npm.stdout, npm.stderr).trim()}`);
  } else {
    log("❌", "npm が見つかりません — Node.js を再インストールしてください");
    blockers.push("npm");
  }
}

function findPython() {
  const candidates = [
    { command: "python", argsPrefix: [], versionArgs: ["--version"], label: "python" },
    { command: "py", argsPrefix: ["-3"], versionArgs: ["-3", "--version"], label: "py -3" },
  ];

  for (const c of candidates) {
    const r = run(c.command, c.versionArgs);
    if (r.status === 0) {
      const text = firstNonEmpty(r.stdout, r.stderr).trim();
      const m = text.match(/(\d+)\.(\d+)\.(\d+)/);
      const major = m ? Number(m[1]) : null;
      const minor = m ? Number(m[2]) : null;
      log("✅", `Python "${c.label}" (${text})`);
      if (
        major === null ||
        minor === null ||
        major < MIN_PYTHON_MAJOR ||
        (major === MIN_PYTHON_MAJOR && minor < MIN_PYTHON_MINOR)
      ) {
        log("❌", `Python ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR}+ が必要です — 現在: ${text}`);
        blockers.push("python-version");
      }
      return c;
    }
  }

  log("❌", "Python 3.10+ が見つかりません — `python --version` または `py -3 --version` を確認してください");
  blockers.push("python");
  return null;
}

function checkPip(python) {
  if (!python) {
    log("⚠️", "Python 未検出のため pip チェックをスキップ");
    return false;
  }

  const r = run(python.command, [...python.argsPrefix, "-m", "pip", "--version"]);
  if (r.status === 0) {
    log("✅", `pip (${firstNonEmpty(r.stdout, r.stderr).trim()})`);
    return true;
  }

  log("❌", `pip が利用できません — \`${python.label} -m ensurepip --upgrade\` を実行してください`);
  blockers.push("pip");
  return false;
}

function checkPac() {
  const r = run("pac", ["--version"]);
  if (r.status === 0) {
    log("✅", `PAC CLI (${firstNonEmpty(r.stdout, r.stderr).trim()})`);
    return;
  }
  log(
    "⚠️",
    "PAC CLI 未検出 — 必要に応じて `npm install -g @microsoft/power-apps-cli` → `pac auth create --environment {ENVIRONMENT_ID}`",
  );
}

function checkPowerAppsCli() {
  // --no-install: 未インストール時にダウンロードプロンプトを出さない
  const r = run("npx", ["--no-install", "power-apps", "--version"]);
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;

  if (r.status === 0) {
    log("✅", `npx power-apps (${firstNonEmpty(r.stdout, r.stderr).trim()})`);
    return;
  }
  if (SERVICE_PRINCIPAL_VARS_REQUIRED_PATTERN.test(output)) {
    log("✅", "npx power-apps (CLI 利用可能 — 認証用環境変数は未設定)");
    return;
  }

  // node_modules に @microsoft/power-apps が存在するかフォールバック確認
  const pkgDir = path.join(repoRoot, "node_modules", "@microsoft", "power-apps");
  if (fs.existsSync(pkgDir)) {
    log("✅", "npx power-apps (パッケージ検出済み)");
    return;
  }

  log("⚠️", "npx power-apps 未検出 — `npm install` 後に再確認してください");
}

function checkEnvFile() {
  const envPath = path.join(repoRoot, ".env");
  const examplePath = path.join(repoRoot, ".env.example");
  if (fs.existsSync(envPath)) {
    log("✅", ".env ファイルを検出");
  } else if (fs.existsSync(examplePath)) {
    log("⚠️", ".env が未作成です — `cp .env.example .env` で作成し、環境値を設定してください");
  }
}

// ── Python venv セットアップ ──────────────────────────
function setupPythonVenv(python, pipReady, { name, scriptsDir }) {
  if (!python || !pipReady) return;

  const reqPath = path.join(scriptsDir, "requirements.txt");
  if (!fs.existsSync(reqPath)) {
    log("⚠️", `${name}: requirements.txt が見つかりません — スキップ`);
    return;
  }

  const venvDir = path.join(scriptsDir, ".venv");

  if (!fs.existsSync(venvDir)) {
    const r = run(python.command, [...python.argsPrefix, "-m", "venv", ".venv"], {
      cwd: scriptsDir,
    });
    if (r.status !== 0) {
      log("⚠️", `${name}: venv 作成失敗 — \`${python.label} -m venv .venv\` (in ${scriptsDir}) を手動実行`);
      return;
    }
    log("✅", `${name}: venv を作成`);
  } else {
    log("✅", `${name}: venv 検出済み`);
  }

  const venvPython = isWindows
    ? path.join(venvDir, ...WINDOWS_VENV_PYTHON)
    : path.join(venvDir, ...UNIX_VENV_PYTHON);

  const install = run(venvPython, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], {
    cwd: scriptsDir,
    timeout: 120_000,
  });
  if (install.status === 0) {
    log("✅", `${name}: Python 依存をインストール`);
  } else {
    log("⚠️", `${name}: 依存インストール失敗 — \`${venvPython} -m pip install -r requirements.txt\` を実行`);
  }
}

// ── メイン ────────────────────────────────────────────
console.log("");
console.log(`=== ${projectName} preflight ===`);
console.log("");

checkNodeAndNpm();
const python = findPython();
const pipReady = checkPip(python);
checkPowerAppsCli();
checkPac();
checkEnvFile();

if (mode !== "check") {
  for (const env of PYTHON_ENVS) {
    setupPythonVenv(python, pipReady, env);
  }
}

console.log("");
for (const line of lines) {
  console.log(line);
}
console.log("");

if (blockers.length > 0) {
  console.log("次の手順:");
  console.log("  1) 上記 ❌ の項目を解決");
  console.log("  2) npm run check:env   — 再チェック");
  console.log("  3) npm run setup       — Python bootstrap を再実行");
  // postinstall/setup では npm install 全体を失敗させない
  if (mode !== "check") {
    console.log("");
    console.log("⚠️  postinstall/setup では開発体験を優先し、blocker があっても終了コードは 0 のままです。");
  }
  console.log("");
}

if (mode === "check" && blockers.length > 0) {
  process.exitCode = 1;
}
