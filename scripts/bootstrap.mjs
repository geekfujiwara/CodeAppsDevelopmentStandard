import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const specScriptsDir = path.join(
  repoRoot,
  ".github",
  "skills",
  "spec-to-markdown",
  "scripts",
);
const requirementsPath = path.join(specScriptsDir, "requirements.txt");
const venvDir = path.join(specScriptsDir, ".venv");
const projectName = path.basename(repoRoot);
const isWindows = process.platform === "win32";
const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 10;
const SERVICE_PRINCIPAL_VARS_REQUIRED_PATTERN =
  /Service Principal environment variables SP_CLIENT_ID, SP_CLIENT_SECRET, and SP_TENANT_ID must be set/i;
const WINDOWS_VENV_PYTHON_PATH = ["Scripts", "python.exe"];
const UNIX_VENV_PYTHON_PATH = ["bin", "python"];
const lines = [];
const blockers = [];

function getMode(argv) {
  if (argv.includes("--setup")) {
    return "setup";
  }
  if (argv.includes("--postinstall")) {
    return "postinstall";
  }
  return "check";
}

const mode = getMode(process.argv);

function add(status, message) {
  lines.push(`${status} ${message}`);
}

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: "pipe",
    ...options,
  });
}

function firstNonEmpty(...values) {
  return values.find((value) => value && value.trim());
}

function checkNodeAndNpm() {
  const nodeVersion = process.version;
  const major = Number(nodeVersion.replace(/^v/, "").split(".")[0]);
  if (Number.isFinite(major) && major >= 18) {
    add("✅", `Node.js ${nodeVersion} を検出しました (推奨: v18+).`);
  } else {
    add("❌", `Node.js ${nodeVersion} は非推奨です。v18 以上を利用してください。`);
    blockers.push("node");
  }

  const npm = run("npm", ["--version"]);
  if (npm.status === 0) {
    add("✅", `npm ${firstNonEmpty(npm.stdout, npm.stderr).trim()} を検出しました.`);
    return;
  }

  add("❌", "npm を検出できませんでした。Node.js の再インストールを確認してください。");
  blockers.push("npm");
}

function findPython() {
  const candidates = [
    { command: "python", argsPrefix: [], versionArgs: ["--version"], label: "python" },
    { command: "py", argsPrefix: ["-3"], versionArgs: ["-3", "--version"], label: "py -3" },
  ];

  for (const candidate of candidates) {
    const result = run(candidate.command, candidate.versionArgs);
    if (result.status === 0) {
      const versionText = firstNonEmpty(result.stdout, result.stderr).trim();
      const parsed = versionText.match(/(\d+)\.(\d+)\.(\d+)/);
      const major = parsed ? Number(parsed[1]) : null;
      const minor = parsed ? Number(parsed[2]) : null;
      add(
        "✅",
        `Python は "${candidate.label}" で利用できます (${versionText}).`,
      );
      if (
        major === null ||
        minor === null ||
        major < MIN_PYTHON_MAJOR ||
        (major === MIN_PYTHON_MAJOR && minor < MIN_PYTHON_MINOR)
      ) {
        add(
          "❌",
          `Python ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR}+ が必要です。現在: ${versionText}`,
        );
        blockers.push("python-version");
      }
      return candidate;
    }
  }

  add(
    "❌",
    'Python 3.10+ が見つかりません。`python --version` または `py -3 --version` が通るようにセットアップしてください。',
  );
  blockers.push("python");
  return null;
}

function checkPip(python) {
  if (!python) {
    add("⚠️", "Python が未検出のため pip チェックをスキップしました。");
    return false;
  }

  const pipViaPython = run(python.command, [...python.argsPrefix, "-m", "pip", "--version"]);
  if (pipViaPython.status === 0) {
    add("✅", `pip を検出しました (${firstNonEmpty(pipViaPython.stdout, pipViaPython.stderr).trim()}).`);
    return true;
  }

  add(
    "❌",
    `pip が利用できません。${python.label} -m ensurepip --upgrade 実行後に再度 npm run setup を実行してください。`,
  );
  blockers.push("pip");
  return false;
}

function checkPac() {
  const pac = run("pac", ["--version"]);
  if (pac.status === 0) {
    add("✅", `PAC CLI を検出しました (${firstNonEmpty(pac.stdout, pac.stderr).trim()}).`);
    return;
  }

  add(
    "⚠️",
    "PAC CLI が未検出です。必要に応じて `npm install -g @microsoft/power-apps-cli` 実行後、`pac auth create --environment {ENVIRONMENT_ID}` を実施してください。",
  );
}

function checkPowerAppsCli() {
  const powerApps = run("npx", ["power-apps", "--version"]);
  const output = `${powerApps.stdout ?? ""}\n${powerApps.stderr ?? ""}`;
  if (powerApps.status === 0) {
    add("✅", `npx power-apps を検出しました (${firstNonEmpty(powerApps.stdout, powerApps.stderr).trim()}).`);
    return true;
  }

  if (
    SERVICE_PRINCIPAL_VARS_REQUIRED_PATTERN.test(output)
  ) {
    add("✅", "npx power-apps を検出しました（CLI は利用可能。認証用環境変数が未設定です）。");
    return true;
  }

  add(
    "⚠️",
    "npx power-apps を検出できませんでした。`npm install` を再実行するか、`npm i @microsoft/power-apps` を確認してください。",
  );
  return false;
}

function setupSpecToMarkdownVenv(python, pipReady) {
  if (!python || !pipReady) {
    return;
  }

  if (!fs.existsSync(requirementsPath)) {
    add("⚠️", "spec-to-markdown の requirements.txt が見つからないため Python bootstrap をスキップしました。");
    return;
  }

  if (!fs.existsSync(venvDir)) {
    const createVenv = run(
      python.command,
      [...python.argsPrefix, "-m", "venv", ".venv"],
      { cwd: specScriptsDir },
    );

    if (createVenv.status !== 0) {
      add(
        "⚠️",
        `spec-to-markdown 用 venv 作成に失敗しました。${python.label} -m venv .venv (in ${specScriptsDir}) を手動実行してください。`,
      );
      return;
    }
    add("✅", `spec-to-markdown 用 venv を作成しました (${venvDir}).`);
  } else {
    add("✅", `spec-to-markdown 用 venv は既に存在します (${venvDir}).`);
  }

  const venvPython = isWindows
    ? path.join(venvDir, ...WINDOWS_VENV_PYTHON_PATH)
    : path.join(venvDir, ...UNIX_VENV_PYTHON_PATH);
  const installDeps = run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: specScriptsDir,
  });
  if (installDeps.status === 0) {
    add("✅", "spec-to-markdown の Python 依存をインストールしました。");
    return;
  }

  add(
    "⚠️",
    `spec-to-markdown の依存インストールに失敗しました。${venvPython} -m pip install -r requirements.txt (in ${specScriptsDir}) を実行してください。`,
  );
}

console.log(`=== ${projectName} preflight ===`);
checkNodeAndNpm();
const python = findPython();
const pipReady = checkPip(python);
checkPowerAppsCli();
checkPac();

if (mode !== "check") {
  setupSpecToMarkdownVenv(python, pipReady);
}

for (const line of lines) {
  console.log(line);
}

if (blockers.length > 0) {
  console.log("");
  console.log("次の手順:");
  console.log("1) 不足している前提条件をインストール");
  console.log("2) npm run check:env");
  console.log("3) npm run setup");
  if (mode !== "check") {
    console.log("⚠️ postinstall/setup では開発体験を優先し、blocker があっても終了コードは失敗にしません。");
  }
}

if (mode === "check" && blockers.length > 0) {
  process.exitCode = 1;
}
