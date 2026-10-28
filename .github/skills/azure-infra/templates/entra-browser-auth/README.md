# Entra same-tab browser authentication adapter

This is an authentication module, **not a complete application or an API authorization implementation**.
It targets a root-hosted, top-level SPA with MSAL Browser 4.30.x. Do not copy it into Code Apps or another host that already owns sign-in.
Major MSAL upgrades require rechecking callback/bridge requirements and real browser sign-in.

## Integration

1. Install the declared dependencies, run `npm run check` and `npm test`. Copy [src/auth.ts](src/auth.ts) and [public/auth-callback.html](public/auth-callback.html) into the app. Integrate the dependencies with its package manager rather than replacing its package manifest.
2. Load public configuration from the application's existing config endpoint or build settings. [.env.example](.env.example) lists the environment contract; this module does not automatically read `.env`. Never provide a client secret to the browser.
3. Create **one** adapter before rendering React and share it. The sample below uses the app's public config (tenantId/clientId/apiScope), not a token response.

```ts
const auth = createBrowserAuth({
  tenantId: config.tenantId,
  clientId: config.clientId,
  apiScope: config.apiScope,
  allowedReturnPaths: ["/", "/dashboard"],
});
await auth.initialize();
// Only now start the router and session/role loading.
```

For the Microsoft login button:

```ts
await auth.signIn();
return; // Navigation starts here; do not immediately call /api/me.
```

For a protected API request in **Entra mode**:

```ts
const accessToken = await auth.getAccessToken();
const response = await fetch("/api/me", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!response.ok) throw new Error(`Account lookup failed (${response.status}).`);
```

Display initialization, sign-in, token and API failures through the application's error UI. Do not print tokens, auth URLs/hashes or MSAL storage.
Token renewal failure is **not** a successful login: offer an explicit same-tab reauthentication action and warn that unsaved input may be lost.
Do not silently retry with cookies or redirect on every failing request.

4. If the app also supports cookie/guest sessions, keep its existing explicit mode selection. Call `useSessionCookie()` when that mode is selected, and use the cookie-only API path, **not** `getAccessToken()`. On a successful Entra return clear app-specific stale demo markers without changing their expiry/revocation rules. `clearIdentity()` clears local selection only; it is not server-session invalidation or global Microsoft logout.
5. Register both the root SPA and `/auth-callback.html` URIs for each approved origin. Add to existing `spa.redirectUris`; preserve unrelated registrations. Subpath hosting and hash routers need a deliberately adapted redirect/return contract.
6. Serve the static callback before SPA fallback, without a login guard or injected scripts. Use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and maintain `Cross-Origin-Opener-Policy: same-origin`.
7. The API independently validates the access token signature, issuer, tenant, audience, expiry, scope and application permissions. A successful Microsoft login never implies administrator authorization.

## Deployment gate

From the development-standard repository run:

```powershell
node .github\skills\azure-infra\scripts\check_browser_auth.mjs `
  --project <APP_DIR> --auth-file src\auth.ts --callback-file public\auth-callback.html
```

This is a static preflight, not proof of portal configuration or interactive authentication.
After deploying, check the actual revision/assets, callback HTML and headers, anonymous API `401`,
then **user-operated** Microsoft sign-in/MFA in the approved browser profile, same-tab return, protected API `200` and authorized role.
Unit tests with a mocked provider and CLI/API smoke results must be recorded separately from real interactive verification.
