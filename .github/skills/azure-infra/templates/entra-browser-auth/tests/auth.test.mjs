import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const config = {
  tenantId: "tenant.example.invalid",
  clientId: "test-client",
  apiScope: "api://test-api/access",
  allowedReturnPaths: ["/", "/dashboard"],
};
const account = { homeAccountId: "test-account" };
const modeKey = "entra-browser-auth-mode";
const returnKey = "entra-browser-auth-return";
let fixtureId = 0;

async function fixture(t, options = {}) {
  const calls = { initialized: 0, handled: 0, silent: [], ...options };
  class Identity {
    active = null;
    constructor(settings) { calls.settings = settings; }
    async initialize() { calls.initialized++; }
    async handleRedirectPromise() {
      calls.handled++;
      if (calls.gate) await calls.gate;
      if (calls.returnError) throw calls.returnError;
      return calls.returned ? { account: calls.noAccount ? null : account } : null;
    }
    setActiveAccount(value) { this.active = value; }
    getActiveAccount() { return this.active; }
    getAllAccounts() { return calls.accounts ?? [account]; }
    async loginRedirect(request) {
      calls.login = request;
      if (calls.loginError) throw calls.loginError;
    }
    async acquireTokenSilent(request) {
      calls.silent.push(request);
      if (calls.tokenError) throw calls.tokenError;
      return { accessToken: "test-api-access-token", idToken: "not-an-api-token" };
    }
  }
  const storage = new Map(options.storage);
  const browser = {
    location: { origin: "https://app.example.invalid", href: "https://app.example.invalid/dashboard?date=example#discard" },
    history: { replaceState: (_state, _unused, url) => { calls.restoredUrl = url.href; } },
  };
  browser.self = browser;
  browser.top = browser;
  for (const [key, value] of Object.entries({
    __testIdentity: Identity,
    window: browser,
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const bundle = await build({
    entryPoints: ["src/auth.ts"], bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "test-identity", setup(builder) {
      builder.onResolve({ filter: /^@azure\/msal-browser$/ }, () => ({ path: "identity", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
        contents: "export const PublicClientApplication = globalThis.__testIdentity;", loader: "js",
      }));
    } }],
  });
  const encoded = Buffer.from(bundle.outputFiles[0].text).toString("base64");
  const module = await import(`data:text/javascript;base64,${encoded}#${++fixtureId}`);
  return { auth: module.createBrowserAuth(config), calls, storage, browser };
}

test("same-tab sign-in preserves local route and requests the API scope, without acquiring a token yet", async t => {
  const { auth, calls, storage } = await fixture(t);
  await Promise.all([auth.initialize(), auth.initialize()]);
  assert.equal(calls.initialized, 1);
  assert.equal(calls.handled, 1);
  assert.equal(calls.settings.auth.navigateToLoginRequestUrl, false);
  assert.equal(calls.settings.auth.redirectUri, "https://app.example.invalid/auth-callback.html");
  await auth.signIn();
  assert.deepEqual(calls.login.scopes, [config.apiScope]);
  assert.equal(calls.login.redirectUri, "https://app.example.invalid/");
  assert.equal(storage.get(returnKey), "/dashboard?date=example");
  assert.equal(calls.silent.length, 0);
});

test("token access waits for redirect handling and uses accessToken, never idToken", async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { auth, calls } = await fixture(t, { returned: true, gate });
  const pendingToken = auth.getAccessToken();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.silent.length, 0);
  release();
  assert.equal(await pendingToken, "test-api-access-token");
  assert.deepEqual(calls.silent[0], { scopes: [config.apiScope], account });
});

test("successful return restores only the approved path/query and removes the saved entry", async t => {
  const { auth, calls, storage } = await fixture(t, {
    returned: true, storage: [[returnKey, "/dashboard?date=example#not-restored"]],
  });
  await auth.initialize();
  assert.equal(calls.restoredUrl, "https://app.example.invalid/dashboard?date=example");
  assert.equal(storage.has(returnKey), false);
  assert.equal(storage.get(modeKey), "entra");
});

for (const saved of ["https://external.example.invalid/", "//external.example.invalid/", "/admin", "javascript:alert(1)"]) {
  test(`rejects unsafe saved route ${saved}`, async t => {
    const { auth, calls, storage } = await fixture(t, { returned: true, storage: [[returnKey, saved]] });
    await assert.rejects(auth.initialize(), /not permitted/);
    assert.equal(calls.restoredUrl, undefined);
    assert.equal(storage.has(returnKey), false);
  });
}

test("cookie mode and local sign-out cannot reuse cached Microsoft accounts", async t => {
  const { auth, calls, storage } = await fixture(t, { returned: true });
  await auth.initialize();
  auth.useSessionCookie();
  await assert.rejects(auth.getAccessToken(), /sign-in is required/);
  auth.clearIdentity();
  await assert.rejects(auth.getAccessToken(), /sign-in is required/);
  assert.equal(storage.get(modeKey), "signed-out");
  assert.equal(calls.silent.length, 0);
});

test("cached accounts alone do not enable Microsoft mode", async t => {
  const { auth, calls } = await fixture(t);
  await assert.rejects(auth.getAccessToken(), /sign-in is required/);
  assert.equal(calls.silent.length, 0);
});

test("explicit Microsoft mode restores one cached account but does not choose between multiple accounts", async t => {
  const { auth } = await fixture(t, { storage: [[modeKey, "entra"]] });
  assert.equal(await auth.getAccessToken(), "test-api-access-token");
  const multiple = await fixture(t, { storage: [[modeKey, "entra"]], accounts: [account, { homeAccountId: "other" }] });
  await assert.rejects(multiple.auth.getAccessToken(), /sign-in is required/);
});

test("redirect launch failure restores the previous authentication mode", async t => {
  const rejection = new Error("redirect start rejected");
  const { auth, storage } = await fixture(t, { loginError: rejection, storage: [[modeKey, "cookie"]] });
  await assert.rejects(auth.signIn(), error => error === rejection);
  assert.equal(storage.get(modeKey), "cookie");
  assert.equal(storage.has(returnKey), false);
});

test("redirect processing and missing-account failures are surfaced before token access", async t => {
  const rejection = new Error("redirect processing rejected");
  const { auth, calls } = await fixture(t, { returnError: rejection });
  await assert.rejects(auth.getAccessToken(), error => error === rejection);
  assert.equal(calls.silent.length, 0);
  const missing = await fixture(t, { returned: true, noAccount: true });
  await assert.rejects(missing.auth.initialize(), /no account/);
});

test("silent token failures propagate and never fall back to cookie authentication", async t => {
  const rejection = new Error("interaction required");
  const { auth, storage } = await fixture(t, { returned: true, tokenError: rejection });
  await assert.rejects(auth.getAccessToken(), error => error === rejection);
  assert.equal(storage.get(modeKey), "entra");
});

test("interactive sign-in is refused inside an iframe", async t => {
  const { auth, calls, browser } = await fixture(t);
  browser.top = {};
  await assert.rejects(auth.signIn(), /normal browser tab/);
  assert.equal(calls.login, undefined);
});
