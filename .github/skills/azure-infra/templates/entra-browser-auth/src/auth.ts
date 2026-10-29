import { PublicClientApplication } from "@azure/msal-browser";

export interface BrowserAuthConfig {
  tenantId: string;
  clientId: string;
  apiScope: string;
  allowedReturnPaths?: readonly string[];
}

export function createBrowserAuth(config: BrowserAuthConfig) {
  if (!/^[a-z0-9.-]+$/i.test(config.tenantId) || !config.clientId.trim() || !config.apiScope.includes("/")) {
    throw new Error("Configure the Entra tenant, SPA client and delegated API scope before sign-in.");
  }
  const allowedPaths = config.allowedReturnPaths ?? ["/"];
  const modeKey = "entra-browser-auth-mode";
  const returnKey = "entra-browser-auth-return";
  const identity = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: new URL("/auth-callback.html", window.location.origin).href,
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: "sessionStorage" },
  });
  let initializing: Promise<void> | undefined;

  function localReturnUrl(value: string) {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !allowedPaths.includes(url.pathname)) {
      throw new Error("The saved sign-in return route is not permitted. Reload the application.");
    }
    url.hash = "";
    return url;
  }

  function initialize() {
    initializing ??= (async () => {
      await identity.initialize();
      const result = await identity.handleRedirectPromise();
      if (result) {
        if (!result.account) throw new Error("Microsoft sign-in returned no account. Sign in again.");
        identity.setActiveAccount(result.account);
        sessionStorage.setItem(modeKey, "entra");
        const saved = sessionStorage.getItem(returnKey);
        sessionStorage.removeItem(returnKey);
        if (saved) window.history.replaceState(null, "", localReturnUrl(saved));
        return;
      }
      if (sessionStorage.getItem(modeKey) === "entra") {
        const accounts = identity.getAllAccounts();
        const account = identity.getActiveAccount() ?? (accounts.length === 1 ? accounts[0] : null);
        if (account) identity.setActiveAccount(account);
      }
    })();
    return initializing;
  }

  async function signIn() {
    await initialize();
    if (window.self !== window.top) {
      throw new Error("Open this application in a normal browser tab before Microsoft sign-in.");
    }
    const previousMode = sessionStorage.getItem(modeKey);
    const returnUrl = localReturnUrl(window.location.href);
    sessionStorage.setItem(returnKey, returnUrl.pathname + returnUrl.search);
    sessionStorage.setItem(modeKey, "entra");
    try {
      await identity.loginRedirect({
        scopes: [config.apiScope],
        prompt: "select_account",
        redirectUri: new URL("/", window.location.origin).href,
      });
    } catch (error) {
      if (previousMode) sessionStorage.setItem(modeKey, previousMode);
      else sessionStorage.removeItem(modeKey);
      sessionStorage.removeItem(returnKey);
      throw error;
    }
  }

  async function getAccessToken() {
    await initialize();
    const account = identity.getActiveAccount();
    if (sessionStorage.getItem(modeKey) !== "entra" || !account) {
      throw new Error("Microsoft sign-in is required before accessing this API.");
    }
    const result = await identity.acquireTokenSilent({ scopes: [config.apiScope], account });
    if (!result.accessToken) throw new Error("Microsoft returned no API access token. Sign in again.");
    return result.accessToken;
  }

  function useSessionCookie() {
    identity.setActiveAccount(null);
    sessionStorage.setItem(modeKey, "cookie");
  }

  function clearIdentity() {
    identity.setActiveAccount(null);
    sessionStorage.setItem(modeKey, "signed-out");
    sessionStorage.removeItem(returnKey);
  }

  return { initialize, signIn, getAccessToken, useSessionCookie, clearIdentity };
}
