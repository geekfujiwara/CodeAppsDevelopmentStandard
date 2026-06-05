export interface AuthProvider {
  id: string;
  type: "entra-id" | "oidc" | "saml2" | "ws-federation" | "local" | "social";
  displayName: string;
  providerIdentifier?: string;
}

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: "entra-id",
    type: "entra-id",
    displayName: "Microsoft アカウントでサインイン",
  },
];

export function resolveProviderIdentifier(provider: AuthProvider): string {
  if (provider.type === "entra-id") {
    const tenantId = window.Microsoft?.Dynamic365?.Portal?.tenant;
    return tenantId ? `https://login.windows.net/${tenantId}/` : "";
  }
  return provider.providerIdentifier ?? "";
}
