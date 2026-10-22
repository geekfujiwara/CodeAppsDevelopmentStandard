import fs from "node:fs";
import path from "node:path";

export function tutorialHazards(source) {
  if (!source.includes("data-tutorial-spotlight")) return [];
  const hazards = [];
  if (/<(?:DialogPrimitive\.Overlay|DialogOverlay)\b/.test(source)) {
    hazards.push("スポットライトと Radix Overlay を併用すると対象も暗くなり、ページスクロールがロックされます。透明な入力ブロッカーを使ってください。");
  }
  for (const tag of source.match(/<div\b[^>]*>/gs) ?? []) {
    if (/\bfixed\b/.test(tag) && /\binset-0\b/.test(tag) && /\bbg-(?:black|slate-950)\/\d+/.test(tag)) {
      hazards.push("全面の固定暗幕がスポットライト内も覆っています。暗幕は枠外の box-shadow だけにしてください。");
    }
    if (tag.includes("data-tutorial-spotlight") && tag.includes("boxShadow") && /\bring-(?:1|2|4|8)\b/.test(tag)) {
      hazards.push("ring と暗幕の box-shadow が競合します。ハイライト枠には outline を使ってください。");
    }
  }
  return hazards;
}

export function findTutorialHazards(root) {
  const findings = [];
  const pending = [path.join(root, "src")];
  while (pending.length) {
    const dir = pending.pop();
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && /\.[jt]sx$/.test(entry.name)) {
        for (const message of tutorialHazards(fs.readFileSync(file, "utf8"))) {
          findings.push(`${path.relative(root, file)}: ${message}`);
        }
      }
    }
  }
  return findings;
}
