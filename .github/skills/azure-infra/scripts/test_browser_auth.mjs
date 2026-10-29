import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { checkBrowserAuth } from "./check_browser_auth.mjs";

// Run from the generated sample directory so tests use its declared TypeScript dependency.
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const source = readFileSync(new URL("../templates/entra-browser-auth/src/auth.ts", import.meta.url), "utf8");
const callback = readFileSync(new URL("../templates/entra-browser-auth/public/auth-callback.html", import.meta.url), "utf8");

test("the complete redirect template passes static preflight", () => {
  assert.deepEqual(checkBrowserAuth(source, callback, ts), []);
});

for (const method of ["loginPopup", "acquireTokenPopup"]) {
  test(`rejects actual ${method} calls but not comments or strings`, () => {
    assert.ok(checkBrowserAuth(source + `\nidentity.${method}({});`, callback, ts).some(error => error.includes(method)));
    assert.deepEqual(checkBrowserAuth(source + `\n// identity.${method}({});\nconst example = "${method}()";`, callback, ts), []);
  });
}

test("rejects missing and unawaited redirect return handling", () => {
  assert.ok(checkBrowserAuth(source.replace("handleRedirectPromise()", "otherMethod()"), callback, ts).some(error => error.includes("handleRedirectPromise")));
  assert.ok(checkBrowserAuth(source.replace("await identity.handleRedirectPromise()", "identity.handleRedirectPromise()"), callback, ts).some(error => error.includes("Await")));
});

test("rejects missing loginRedirect or automatic request-URL navigation", () => {
  assert.ok(checkBrowserAuth(source.replace("identity.loginRedirect(", "identity.otherMethod("), callback, ts).some(error => error.includes("loginRedirect")));
  assert.ok(checkBrowserAuth(source.replace("navigateToLoginRequestUrl: false", "navigateToLoginRequestUrl: true"), callback, ts).some(error => error.includes("navigateToLoginRequestUrl")));
});

for (const content of [
  '<script type="module" src="/src/main.tsx"></script>',
  '<body onload="startApp()">',
  '<iframe src="/"></iframe>',
  '<meta http-equiv="refresh" content="0;url=/">',
  '<form action="/api/me"></form>',
]) {
  test(`rejects a non-inert callback: ${content}`, () => {
    assert.ok(checkBrowserAuth(source, callback.replace("</body>", content + "</body>"), ts).some(error => error.includes("silent callback")));
  });
}

test("rejects a callback that is only an SPA route instead of HTML", () => {
  assert.ok(checkBrowserAuth(source, "export default App;", ts).some(error => error.includes("static HTML")));
});

test("rejects invalid TypeScript instead of reporting success", () => {
  assert.ok(checkBrowserAuth(source + "\nconst broken = ;", callback, ts).some(error => error.includes("syntax errors")));
});

test("CLI returns failure for popup regression and never prints PASS", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "browser-auth-preflight-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const authFile = path.join(directory, "auth.ts");
  const callbackFile = path.join(directory, "auth-callback.html");
  writeFileSync(authFile, source + "\nidentity.loginPopup({});");
  writeFileSync(callbackFile, callback);
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./check_browser_auth.mjs", import.meta.url)),
    "--project", process.cwd(), "--auth-file", authFile, "--callback-file", callbackFile,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /FAIL:.*loginPopup/);
  assert.doesNotMatch(result.stdout, /PASS/);
});

test("CLI reports missing input as a failure rather than a success-shaped fallback", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./check_browser_auth.mjs", import.meta.url)),
    "--project", process.cwd(), "--auth-file", "missing-browser-auth-file.ts",
  ], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /FAIL:.*ENOENT/);
  assert.doesNotMatch(result.stdout, /PASS/);
});
