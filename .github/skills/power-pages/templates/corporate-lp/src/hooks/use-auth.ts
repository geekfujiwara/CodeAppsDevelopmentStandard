import { useState, useEffect, useCallback, useRef } from "react";
import { AUTH_PROVIDERS, resolveProviderIdentifier } from "@/services/auth-service";

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
  contactId: "00000000-0000-0000-0000-000000000000",
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
          tenant?: string;
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

    // ログイン完了後、元のページ（ハッシュ）へ戻す。
    // Power Pages の returnUrl はサーバーパス（Code Site では "/"）なので、
    // SPA 内のルート（ハッシュ）はクライアント側で復元する。
    // これにより「profile を経由せず、もとのページに戻る」を実現する。
    // ※ サーバー側でも Authentication/Registration/ProfileRedirectEnabled=false が必須
    //   （scripts/setup_auth.py で設定）。
    if (user && !IS_DEV) {
      const savedHash = sessionStorage.getItem("pp_return_hash");
      if (savedHash) {
        sessionStorage.removeItem("pp_return_hash");
        const current = window.location.hash;
        const atRoot = !current || current === "#" || current === "#/";
        if (atRoot && savedHash !== current) {
          window.location.hash = savedHash;
        }
      }
    }
  }, []);

  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!state.isAuthenticated || IS_DEV) return;
    const intervalMs = 10 * 60 * 1000;
    keepAliveRef.current = setInterval(() => {
      fetch("/_layout/tokenhtml", { credentials: "same-origin" }).catch(() => {});
    }, intervalMs);
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, [state.isAuthenticated]);

  const login = useCallback(() => {
    void (async (providerId?: string) => {
      if (IS_DEV) return;
      if (window.location.hash) {
        sessionStorage.setItem("pp_return_hash", window.location.hash);
      }

      const provider = providerId
        ? AUTH_PROVIDERS.find((item) => item.id === providerId) ?? AUTH_PROVIDERS[0]
        : AUTH_PROVIDERS[0];

      if (!provider || provider.type === "local") {
        window.location.href = "/SignIn?returnUrl=/";
        return;
      }

      const providerIdentifier = resolveProviderIdentifier(provider);
      if (!providerIdentifier) {
        window.location.href = "/SignIn?returnUrl=/";
        return;
      }

      try {
        const tokenRes = await fetch("/_layout/tokenhtml", {
          credentials: "same-origin",
        });
        const tokenHtml = await tokenRes.text();
        const tokenMatch = tokenHtml.match(/value="([^"]+)"/);

        if (!tokenMatch) {
          window.location.href = "/SignIn?returnUrl=/";
          return;
        }

        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/Account/Login/ExternalLogin";
        form.style.display = "none";

        const fields: Record<string, string> = {
          provider: providerIdentifier,
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
      } catch {
        window.location.href = "/SignIn?returnUrl=/";
      }
    })();
  }, []);

  const logout = useCallback(() => {
    if (IS_DEV) return;
    sessionStorage.removeItem("pp_return_hash");
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
