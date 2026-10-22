import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("GeekPowerCode enables VS Code browser group and documents runtime availability", () => {
  const agent = fs.readFileSync(new URL("../agents/GeekPowerCode.agent.md", import.meta.url), "utf8");
  const frontmatter = agent.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  const tools = frontmatter.match(/^tools:\s*\[([^\]]+)\]/m)[1]
    .split(",").map((tool) => tool.trim().replace(/^['"]|['"]$/g, ""));
  assert.ok(tools.includes("browser"));
  assert.match(frontmatter, /^model:\s*auto\s*$/m);
  assert.match(agent, /ホストがツールを提供/);
  assert.match(agent, /ツール検索/);
});
