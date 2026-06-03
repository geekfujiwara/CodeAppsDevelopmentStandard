import { useState, useEffect, useCallback } from "react";

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
 * Reads the portal-injected user context from the liquid-rendered global.
 * If Entra ID is the sole IdP, login redirects to /SignIn which auto-triggers SSO.
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

  const login = useCallback(() => {
    // Save current hash route so we can restore after SSO redirect
    if (window.location.hash) {
      sessionStorage.setItem("pp_return_hash", window.location.hash);
    }
    // With LocalLoginEnabled=false, /SignIn auto-redirects to Entra ID SSO
    window.location.href = "/SignIn?returnUrl=/";
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("pp_return_hash");
    window.location.href = "/Account/Login/LogOff";
  }, []);

  return { ...state, login, logout };
}
