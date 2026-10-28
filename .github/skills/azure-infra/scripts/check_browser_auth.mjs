import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function checkBrowserAuth(source, callback, ts) {
  const errors = [];
  const tree = ts.createSourceFile("auth.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const methods = new Set();
  let manualReturnNavigation = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      methods.add(method);
      if (["loginPopup", "acquireTokenPopup"].includes(method)) {
        errors.push(`${method} is not permitted in the default same-tab auth entry.`);
      }
      if (method === "handleRedirectPromise" && !ts.isAwaitExpression(node.parent)) {
        errors.push("Await handleRedirectPromise before account/API/router initialization.");
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(tree).replace(/['"]/g, "") === "navigateToLoginRequestUrl") {
      manualReturnNavigation ||= node.initializer.kind === ts.SyntaxKind.FalseKeyword;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (tree.parseDiagnostics.length) errors.push("The auth entry contains TypeScript syntax errors.");
  for (const required of ["initialize", "loginRedirect", "handleRedirectPromise", "setActiveAccount", "acquireTokenSilent"]) {
    if (!methods.has(required)) errors.push(`The auth entry must implement ${required}.`);
  }
  if (!manualReturnNavigation) errors.push("Set navigateToLoginRequestUrl: false and restore only allowlisted local routes.");
  const html = callback.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<!doctype\s+html\b/i.test(html) || !/<html\b/i.test(html)) errors.push("Provide the dedicated static HTML callback, not an SPA route.");
  if (/<\s*(script|iframe|object|embed|form|base)\b|\bon[a-z]+\s*=|\bjavascript\s*:|http-equiv\s*=\s*["']?refresh/i.test(html)) {
    errors.push("The silent callback must not execute scripts, embed the app or navigate.");
  }
  return errors;
}

export function checkProject(project, authFile, callbackFile) {
  const root = path.resolve(project);
  const require = createRequire(path.join(root, "package.json"));
  const ts = require("typescript");
  return checkBrowserAuth(
    readFileSync(path.resolve(root, authFile), "utf8"),
    readFileSync(path.resolve(root, callbackFile), "utf8"),
    ts,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        project: { type: "string", default: "." },
        "auth-file": { type: "string", default: "src/auth.ts" },
        "callback-file": { type: "string", default: "public/auth-callback.html" },
      },
    });
    const errors = checkProject(values.project, values["auth-file"], values["callback-file"]);
    if (errors.length) {
      for (const message of errors) console.error(`FAIL: ${message}`);
      process.exitCode = 1;
    } else {
      console.log("PASS: Static redirect/callback preflight. Interactive sign-in and API authorization still require verification.");
    }
  } catch (error) {
    console.error(`FAIL: Browser auth preflight could not run (${error.code ?? error.name}). Check arguments, files and the project's TypeScript dependency.`);
    process.exitCode = 1;
  }
}
