import { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    __PP_USER__?: {
      contactId?: string;
      id?: string;
      fullname?: string;
      fullName?: string;
      emailaddress1?: string;
    } | null;
  }
}

export interface AuthUser {
  contactId: string;
  fullName: string;
  email: string;
}

export function useAuth() {
  const [state, setState] = useState<{
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
  }>({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    const pp = window.__PP_USER__;
    const id = pp?.contactId || pp?.id;
    if (id) {
      setState({
        isAuthenticated: true,
        user: {
          contactId: id,
          fullName: pp?.fullName || pp?.fullname || "",
          email: pp?.emailaddress1 || "",
        },
        loading: false,
      });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  const login = useCallback(() => {
    window.location.href = "/Account/Login";
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/Account/Login/LogOff";
  }, []);

  return { ...state, login, logout };
}
