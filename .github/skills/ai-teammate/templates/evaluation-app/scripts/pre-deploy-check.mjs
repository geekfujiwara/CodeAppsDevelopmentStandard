/**
 * pre-deploy-check.mjs — テンプレートそのままのデプロイを防止する
 *
 * npx power-apps push の前に実行し、
 * テーマ固有のカスタマイズが行われていることを確認する。
 *
 * このファイルはプロジェクト直下の scripts/ にコピーして使う。
 * Usage: node scripts/pre-deploy-check.mjs
 * npm script: "predeploy": "node scripts/pre-deploy-check.mjs"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
// scripts/ の一つ上がプロジェクトルート
const root = path.resolve(path.dirname(__filename), "..");

const errors = [];
// config.ts は "/dashboard"、router.tsx の子ルートは "dashboard" と書くため先頭スラッシュを揃える
const norm = (p) => p.replace(/^\//, "");

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
  errors.push("power.config.json が存在しません。npx power-apps init を先に実行してください。");
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
  const navPaths = [...configContent.matchAll(/path:\s*["']([^"']+)["']/g)].map(m => norm(m[1]));

  // router.tsx からルートパスを抽出: path: "xxx"（コメント行を除外）
  const routerLines = routerContent.split("\n").filter(l => !l.trim().startsWith("//"));
  const routePaths = [...routerLines.join("\n").matchAll(/path:\s*["']([^"']+)["']/g)].map(m => norm(m[1]));

  // ナビにあるがルーターに無いパス → 孤立メニュー
  const orphanedNav = navPaths.filter(p => !routePaths.includes(p));
  if (orphanedNav.length > 0) {
    errors.push(
      `ナビゲーション (config.ts) にルートが存在しないパスがあります: ${orphanedNav.join(", ")}\n` +
      `     → router.tsx にルートを追加するか、config.ts からナビを削除してください。`
    );
  }

  // ルーターにあるがナビに無いパス → 隠しページ（warning のみ）
  const hiddenRoutes = routePaths.filter(p => !navPaths.includes(p) && p !== "*" && p !== "");
  if (hiddenRoutes.length > 0) {
    console.warn(`⚠ ルーター (router.tsx) にナビから到達できないページがあります: ${hiddenRoutes.join(", ")}`);
    console.warn(`  → 意図的な隠しページでなければ config.ts にナビを追加してください。`);
  }
}

// 5. モック実行基盤が開発限定の動的 import になっているか
const srcPath = path.join(root, "src");
if (fs.existsSync(srcPath)) {
  const pending = [srcPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;

      const content = fs.readFileSync(entryPath, "utf-8");
      if (!content.includes("createMockDataExecutor") && !content.includes("setDataOperationExecutor")) continue;

      const hasDevelopmentGuards = content.includes("import.meta.env.DEV") && content.includes("VITE_USE_MOCK");
      const hasDynamicImports = /import\(\s*["']@microsoft\/power-apps\/data\/executors["']\s*\)/.test(content)
        && /import\(\s*["']@microsoft\/power-apps\/internal\/data["']\s*\)/.test(content);
      if (!hasDevelopmentGuards || !hasDynamicImports) {
        errors.push(
          `${path.relative(root, entryPath)} のモックデータ実行基盤が開発限定の動的 import になっていません。\n` +
          `     → import.meta.env.DEV && VITE_USE_MOCK === "1" で制限し、SDK の 2 モジュールを動的 import してください。`
        );
      }
    }
  }
}

// 6. 本番成果物にモック実行基盤が混入していないか
const distPath = path.join(root, "dist");
if (fs.existsSync(distPath)) {
  const mockMarkers = ["createMockDataExecutor", "setDataOperationExecutor", "@microsoft/power-apps/data/executors"];
  const pending = [distPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || entry.name.endsWith(".map")) continue;

      const content = fs.readFileSync(entryPath, "utf-8");
      if (mockMarkers.some(marker => content.includes(marker))) {
        errors.push(
          `本番成果物 ${path.relative(root, entryPath)} にモックデータ実行基盤が含まれています。\n` +
          `     → import.meta.env.DEV && VITE_USE_MOCK === "1" の動的 import に限定してください。`
        );
      }
    }
  }
}

// 7. レイアウト崩れ（横スクロール）を招く書き方が無いか
if (fs.existsSync(srcPath)) {
  const layoutWarnings = [];
  const pending = [srcPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;

      const content = fs.readFileSync(entryPath, "utf-8");
      const rel = path.relative(root, entryPath);
      const lines = content.split("\n");

      lines.forEach((line, i) => {
        const at = `${rel}:${i + 1}`;

        // 7a. grid-cols に素の 1fr（min-content 以下に縮まないため長文で溢れる）
        const cols = line.match(/grid-cols-\[[^\]]*\]/g) ?? [];
        for (const col of cols) {
          if (/(^|[[_])\d*fr/.test(col.replace(/minmax\([^)]*\)/g, ""))) {
            layoutWarnings.push(`${at} ${col} に素の fr があります → minmax(0,1fr) にしてください。`);
          }
        }

        // 7b. 明示トラックのグリッド直下の子要素に min-w-0 が無い（トラックを突き破って横スクロールになる）
        if (cols.length > 0) {
          const child = lines[i + 1] ?? "";
          const isElement = /^\s*<[A-Za-z]/.test(child);
          const hasSizing = /min-w-0|w-\d|w-\[/.test(child);
          if (isElement && !hasSizing) {
            layoutWarnings.push(`${at} のグリッド直下の子要素に min-w-0 がありません。`);
          }
        }

        // 7c. ScrollArea と truncate の併用（Viewport が横に膨らみ省略が効かない）
        if (line.includes("<ScrollArea") && /truncate|line-clamp/.test(content)) {
          layoutWarnings.push(`${at} ScrollArea と truncate/line-clamp が同居しています → div + overflow-y-auto overflow-x-hidden に置き換えてください。`);
        }
      });
    }
  }

  if (layoutWarnings.length > 0) {
    console.warn(`⚠ レスポンシブが崩れる可能性のある箇所が ${layoutWarnings.length} 件あります:`);
    for (const w of layoutWarnings.slice(0, 20)) console.warn(`  ${w}`);
    if (layoutWarnings.length > 20) console.warn(`  ... 他 ${layoutWarnings.length - 20} 件`);
    console.warn("  → references/design-pattern.md「レスポンシブファースト設計原則」を参照。");
  }
}

// 8. 表示名が 3 箇所で食い違っていないか（改名時の取り残し）
if (fs.existsSync(envPath) && fs.existsSync(configPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  const readEnv = (key) => envContent.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1].trim();
  const appName = readEnv("VITE_CODEAPPS_APP_NAME");
  const docTitle = readEnv("VITE_CODEAPPS_DOCUMENT_TITLE");
  let displayName;
  try {
    displayName = JSON.parse(fs.readFileSync(configPath, "utf-8")).appDisplayName;
  } catch {
    displayName = undefined;
  }

  const names = [appName, docTitle, displayName].filter(Boolean);
  if (names.length > 1 && new Set(names).size > 1) {
    console.warn("⚠ アプリ表示名が箇所によって違います:");
    console.warn(`  .env VITE_CODEAPPS_APP_NAME       : ${appName ?? "(未設定)"}`);
    console.warn(`  .env VITE_CODEAPPS_DOCUMENT_TITLE : ${docTitle ?? "(未設定)"}`);
    console.warn(`  power.config.json appDisplayName  : ${displayName ?? "(未設定)"}`);
    console.warn("  → 意図的な使い分けでなければ揃えてください（改名時の直し忘れ）。");
  }
}

// 9. 遷移リンクのクエリを受け取る画面が無い（KPI カードを押しても何も起きない事故）
if (fs.existsSync(srcPath)) {
  const linked = new Map(); // key -> 最初に見つけた場所
  const read = new Set();
  const pending = [srcPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;

      const content = fs.readFileSync(entryPath, "utf-8");
      const rel = path.relative(root, entryPath);

      for (const m of content.matchAll(/\.get\(\s*["']([\w-]+)["']/g)) read.add(m[1]);
      for (const m of content.matchAll(/(?:to=|navigate\()\s*["'`]\/[^"'`?]*\?([^"'`]+)["'`]/g)) {
        const line = content.slice(0, m.index).split("\n").length;
        for (const pair of m[1].split("&")) {
          const key = pair.split("=")[0].trim();
          if (key && !linked.has(key)) linked.set(key, `${rel}:${line}`);
        }
      }
    }
  }

  const orphans = [...linked].filter(([key]) => !read.has(key));
  if (orphans.length > 0) {
    console.warn(`⚠ 遷移先で読まれていないクエリパラメータが ${orphans.length} 件あります:`);
    for (const [key, at] of orphans) console.warn(`  ${at} ?${key}=... を useSearchParams で受け取る画面がありません。`);
    console.warn("  → 押しても何も起きないボタンになります。遷移先でタブ/フィルターに反映してください。");
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
