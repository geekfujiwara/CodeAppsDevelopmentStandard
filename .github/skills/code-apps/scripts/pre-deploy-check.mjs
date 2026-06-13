/**
 * pre-deploy-check.mjs — テンプレートそのままのデプロイを防止する
 *
 * pac code push / npx power-apps push の前に実行し、
 * テーマ固有のカスタマイズが行われていることを確認する。
 *
 * Usage: node .github/skills/code-apps/scripts/pre-deploy-check.mjs
 * npm script: "predeploy": "node .github/skills/code-apps/scripts/pre-deploy-check.mjs"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "../../../..");

const errors = [];

// 1. .env が存在するか
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) {
  errors.push(".env ファイルが存在しません。.env.example をコピーして設定してください。");
} else {
  const envContent = fs.readFileSync(envPath, "utf-8");

  // 必須項目のチェック
  const required = ["DATAVERSE_URL", "TENANT_ID", "ENV_ID", "SOLUTION_NAME", "PUBLISHER_PREFIX"];
  for (const key of required) {
    const match = envContent.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (!match || match[1].includes("{") || match[1].trim() === "") {
      errors.push(`.env の ${key} が未設定またはプレースホルダーのままです。`);
    }
  }
}

// 2. power.config.json が存在するか
const configPath = path.join(root, "power.config.json");
if (!fs.existsSync(configPath)) {
  errors.push("power.config.json が存在しません。pac code init を先に実行してください。");
}

// 3. config.ts のアプリ名がデフォルトのままでないか
const configTs = path.join(root, "src", "config.ts");
if (fs.existsSync(configTs)) {
  const content = fs.readFileSync(configTs, "utf-8");
  if (content.includes('"Code Apps"') && !content.includes("VITE_CODEAPPS_APP_NAME")) {
    // env で上書きされるので OK — ただし .env にも設定されていなければ警告
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
    if (!envContent.includes("VITE_CODEAPPS_APP_NAME=") || envContent.match(/VITE_CODEAPPS_APP_NAME=\{/)) {
      errors.push("アプリ名がデフォルト (Code Apps) のままです。.env の VITE_CODEAPPS_APP_NAME を設定してください。");
    }
  }
}

// 4. ナビ ↔ ルーター整合性チェック（テンプレート残骸防止）
const routerPath = path.join(root, "src", "router.tsx");
if (fs.existsSync(configTs) && fs.existsSync(routerPath)) {
  const configContent = fs.readFileSync(configTs, "utf-8");
  const routerContent = fs.readFileSync(routerPath, "utf-8");

  // 4a. template: true が残っていないか
  const templateMatches = configContent.match(/template:\s*true/g);
  if (templateMatches) {
    errors.push(
      `config.ts に template: true のデモメニューが ${templateMatches.length} 件残っています。\n` +
      `     → テーマに無関係なナビは削除するか、template フラグを外してください。`
    );
  }

  // 4b. config.ts からナビパスを抽出: path: "xxx"
  const navPaths = [...configContent.matchAll(/path:\s*["']([^"']+)["']/g)].map(m => m[1]);

  // router.tsx からルートパスを抽出: path: "xxx"（コメント行を除外）
  const routerLines = routerContent.split("\n").filter(l => !l.trim().startsWith("//"));
  const routePaths = [...routerLines.join("\n").matchAll(/path:\s*["']([^"']+)["']/g)].map(m => m[1]);

  // ナビにあるがルーターに無いパス → 孤立メニュー
  const orphanedNav = navPaths.filter(p => !routePaths.includes(p));
  if (orphanedNav.length > 0) {
    errors.push(
      `ナビゲーション (config.ts) にルートが存在しないパスがあります: ${orphanedNav.join(", ")}\n` +
      `     → router.tsx にルートを追加するか、config.ts からナビを削除してください。`
    );
  }

  // ルーターにあるがナビに無いパス → 隠しページ（warning のみ）
  const hiddenRoutes = routePaths.filter(p => !navPaths.includes(p) && p !== "*" && p !== "/");
  if (hiddenRoutes.length > 0) {
    console.warn(`⚠ ルーター (router.tsx) にナビから到達できないページがあります: ${hiddenRoutes.join(", ")}`);
    console.warn(`  → 意図的な隠しページでなければ config.ts にナビを追加してください。`);
  }
}

// 結果出力
if (errors.length > 0) {
  console.error("\n❌ デプロイ前チェック失敗:\n");
  for (const e of errors) {
    console.error(`  • ${e}`);
  }
  console.error("\nテンプレートをそのままデプロイすることはできません。");
  console.error("テーマ固有のカスタマイズを行ってからデプロイしてください。\n");
  process.exit(1);
} else {
  console.log("✅ デプロイ前チェック OK");
}
