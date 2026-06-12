import { useState, useEffect, useCallback, useRef } from "react";

export interface AuthUser {
  contactId: string;
  fullName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Power Pages authentication hook.
 *
 * Based on microsoft/power-platform-skills setup-auth pattern:
 * - Auth state from window.Microsoft.Dynamic365.Portal.User (no API call)
 * - Login via form POST to /Account/Login/ExternalLogin
 *   with provider resolved at runtime from Portal.tenant
 * - Anti-forgery token fetched from /_layout/tokenhtml
 * - Session keepalive via periodic /_layout/tokenhtml fetch
 */
export function useAuth() {
  const [state, setState] = useState<{
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
  }>({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    // Power Pages injects user info via liquid template into the page
    const portalUser = (window as any)["Microsoft"]?.Dynamic365?.Portal?.User;
    const contactId = portalUser?.contactId || portalUser?.id || "";

    if (contactId) {
      setState({
        isAuthenticated: true,
        user: {
          contactId,
          fullName: portalUser?.fullName || portalUser?.fullname || "",
          email: portalUser?.emailAddress || portalUser?.emailaddress1 || "",
          firstName: portalUser?.firstName || portalUser?.firstname || "",
          lastName: portalUser?.lastName || portalUser?.lastname || "",
          phone: portalUser?.telephone1 || "",
        },
        loading: false,
      });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  // Session keepalive: periodically ping /_layout/tokenhtml to renew session cookie
  // Based on microsoft/power-platform-skills setup-auth Session KeepAlive pattern
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!state.isAuthenticated) return;
    const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    keepAliveRef.current = setInterval(() => {
      fetch("/_layout/tokenhtml", { credentials: "same-origin" }).catch(() => {});
    }, INTERVAL_MS);
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, [state.isAuthenticated]);

  const login = useCallback(async () => {
    // Save current hash route so we can restore after SSO redirect
    if (window.location.hash) {
      sessionStorage.setItem("pp_return_hash", window.location.hash);
    }

    // Resolve Entra ID provider identifier at runtime from Portal.tenant
    // Ref: microsoft/power-platform-skills setup-auth resolveProviderIdentifier()
    const tenantId = (window as any)["Microsoft"]?.Dynamic365?.Portal?.tenant;

    if (tenantId) {
      try {
        // Fetch anti-forgery token from /_layout/tokenhtml (lightweight endpoint)
        const tokenRes = await fetch("/_layout/tokenhtml", { credentials: "same-origin" });
        const tokenHtml = await tokenRes.text();
        const tokenMatch = tokenHtml.match(/value="([^"]+)"/);

        if (tokenMatch) {
          // Form POST directly to ExternalLogin — skips provider selection page
          const form = document.createElement("form");
          form.method = "POST";
          form.action = "/Account/Login/ExternalLogin";
          form.style.display = "none";

          const fields: Record<string, string> = {
            provider: `https://login.windows.net/${tenantId}/`,
            returnUrl: "/",
            __RequestVerificationToken: tokenMatch[1],
          };
          for (const [name, value] of Object.entries(fields)) {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.appendChild(input);
          }
          document.body.appendChild(form);
          form.submit();
          return;
        }
      } catch { /* fallback below */ }
    }

    // Fallback: redirect to standard sign-in page
    window.location.href = "/SignIn?returnUrl=/";
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("pp_return_hash");
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
