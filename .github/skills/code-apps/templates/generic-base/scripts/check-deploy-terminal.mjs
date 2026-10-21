import { fileURLToPath } from "node:url";
import path from "node:path";

export function deploymentTerminalError({ isCI, stdinIsTTY, stdoutIsTTY }) {
  if (isCI || (stdinIsTTY && stdoutIsTTY)) {
    return null;
  }

  return [
    "ERROR: Code Apps deployment requires an interactive terminal for delegated-user authentication.",
    "`pa auth status` only lists cached accounts; it does not prove that a push-time token challenge can be completed.",
    "Run `npm run deploy` from the VS Code integrated terminal so the CLI can complete an authentication challenge.",
    "CI deployments must use a supported non-interactive authentication setup and set CI=true.",
  ].join("\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const error = deploymentTerminalError({
    isCI: /^(1|true)$/i.test(process.env.CI ?? ""),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
  });

  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
