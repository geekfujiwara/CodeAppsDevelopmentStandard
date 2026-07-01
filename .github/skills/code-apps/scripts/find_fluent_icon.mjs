/**
 * find_fluent_icon.mjs — @fluentui/react-icons から適切なアイコンを検索する
 *
 * キーワード（英語）にマッチするアイコンを、インストール済みの
 * @fluentui/react-icons から探し、そのまま貼れる import 文を出力する。
 * インストール済みバージョンを走査するため、存在しない名前を選ぶ事故を防げる。
 *
 * Usage:
 *   node .github/skills/code-apps/scripts/find_fluent_icon.mjs <keyword> [--size 24] [--variant Regular|Filled] [--limit 40]
 *
 * 例:
 *   node .github/skills/code-apps/scripts/find_fluent_icon.mjs add
 *   node .github/skills/code-apps/scripts/find_fluent_icon.mjs delete --size 20 --variant Regular
 *   node .github/skills/code-apps/scripts/find_fluent_icon.mjs person
 *
 * 前提: プロジェクトに @fluentui/react-icons がインストール済み
 *   npm i @fluentui/react-icons
 */
import process from "node:process";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("--")) {
  console.error(
    "Usage: node find_fluent_icon.mjs <keyword> [--size 24] [--variant Regular|Filled] [--limit 40]"
  );
  process.exit(1);
}

const keyword = args[0].toLowerCase();
const getOpt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const size = getOpt("--size");
const variant = getOpt("--variant");
const limit = Number.parseInt(getOpt("--limit") ?? "40", 10);

let mod;
try {
  // プロジェクトルート（npm i を実行した場所 = cwd）から解決する
  const req = createRequire(pathToFileURL(path.join(process.cwd(), "package.json")).href);
  const resolved = req.resolve("@fluentui/react-icons");
  mod = await import(pathToFileURL(resolved).href);
} catch {
  console.error(
    "@fluentui/react-icons が見つかりません。プロジェクトルートで先に `npm i @fluentui/react-icons` を実行してください。"
  );
  process.exit(1);
}

// アイコン名は {Name}{Size}{Variant} 形式（Variant: Regular|Filled、Size: 数値）
const ICON_RE = /^([A-Za-z0-9]+?)(\d+)(Regular|Filled)$/;
const rows = [];
for (const name of Object.keys(mod)) {
  const m = name.match(ICON_RE);
  if (!m) continue;
  const [, base, sz, vr] = m;
  if (!base.toLowerCase().includes(keyword)) continue;
  if (size && sz !== String(size)) continue;
  if (variant && vr.toLowerCase() !== variant.toLowerCase()) continue;
  rows.push({ name, base, size: Number(sz), variant: vr });
}

if (rows.length === 0) {
  console.log(
    `"${keyword}" に一致するアイコンはありません。別の英語キーワードを試してください。`
  );
  process.exit(0);
}

// base 名でグルーピング
const byBase = new Map();
for (const r of rows) {
  if (!byBase.has(r.base)) byBase.set(r.base, []);
  byBase.get(r.base).push(r);
}

console.log(`"${keyword}" にマッチするアイコン（${byBase.size} 種）:\n`);
let shown = 0;
for (const [base, list] of [...byBase.entries()].sort()) {
  const sizes = [...new Set(list.map((r) => r.size))].sort((a, b) => a - b).join(", ");
  const variants = [...new Set(list.map((r) => r.variant))].join("/");
  // 代表 import 例（24 Regular があれば優先）
  const rep = list.find((r) => r.size === 24 && r.variant === "Regular") ?? list[0];
  console.log(`● ${base}  (size: ${sizes} / ${variants})`);
  console.log(`   import { ${rep.name} } from "@fluentui/react-icons";`);
  shown++;
  if (shown >= limit) {
    console.log(`\n... 他 ${byBase.size - shown} 種を省略（--limit で調整）`);
    break;
  }
}
