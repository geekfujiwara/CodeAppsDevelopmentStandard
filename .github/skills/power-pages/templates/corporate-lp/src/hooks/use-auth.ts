import { useState, useEffect, useCallback } from "react";

/**
 * Power Pages SSO 認証フック（デフォルト実装）
 *
 * - Power Pages が Liquid テンプレートで注入するユーザーコンテキストを読み取る
 *   - `window.Microsoft.Dynamic365.Portal.User`（標準）
 *   - `window.__PP_USER__`（Code Site テンプレートで注入する場合）
 * - localhost 開発時はモックユーザーを返す（デプロイ不要で UI 確認可能）
 * - login() は `/SignIn` に直行 → Entra ID が唯一の IdP なら自動 SSO
 *
 * 詳細: references/default-implementation.md / references/authentication-reference.md
 */

export interface AuthUser {
  contactId: string;
  fullName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  loading: boolean;
}

const IS_DEV =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const DEV_USER: AuthUser = {
  contactId: "00000000-0000-0000-0000-000000000001",
  fullName: "開発 ユーザー",
  email: "dev@example.com",
  firstName: "開発",
  lastName: "ユーザー",
  phone: "",
};

declare global {
  interface Window {
    Microsoft?: {
      Dynamic365?: {
        Portal?: {
          User?: Record<string, string> | null;
        };
      };
    };
    __PP_USER__?: Record<string, string> | null;
  }
}

/** Power Pages が注入したユーザーコンテキストを正規化して返す */
function resolvePortalUser(): AuthUser | null {
  if (IS_DEV) return DEV_USER;

  const portalUser =
    window.Microsoft?.Dynamic365?.Portal?.User ?? window.__PP_USER__ ?? null;
  if (!portalUser) return null;

  const contactId = portalUser.contactId || portalUser.id || "";
  if (!contactId) return null;

  return {
    contactId,
    fullName: portalUser.fullName || portalUser.fullname || "",
    email: portalUser.emailAddress || portalUser.emailaddress1 || "",
    firstName: portalUser.firstName || portalUser.firstname || "",
    lastName: portalUser.lastName || portalUser.lastname || "",
    phone: portalUser.telephone1 || "",
  };
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  });

  useEffect(() => {
    const user = resolvePortalUser();
    setState({ isAuthenticated: !!user, user, loading: false });
  }, []);

  const login = useCallback(() => {
    if (IS_DEV) return; // dev mode: no-op
    const returnUrl = encodeURIComponent(
      window.location.pathname + window.location.hash,
    );
    // Entra ID が唯一の IdP の場合、/SignIn は自動で SSO に直行する
    window.location.href = `/SignIn?returnUrl=${returnUrl}`;
  }, []);

  const logout = useCallback(() => {
    if (IS_DEV) return;
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
