export interface OAuthProvider {
  id: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: "GITHUB_CLIENT_ID" | "GOOGLE_CLIENT_ID";
  clientSecretEnv: "GITHUB_CLIENT_SECRET" | "GOOGLE_CLIENT_SECRET";
}

// Add a provider by appending one entry and its two Worker secrets.
// GitHub and Google use the same callback: /auth/callback/<id>
export const OAUTH_PROVIDERS: OAuthProvider[] = [
  {
    id: "github",
    label: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  {
    id: "google",
    label: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
];

export function providerById(id: string): OAuthProvider | null {
  return OAUTH_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function configuredProviders(env: Env): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => {
    const id = env[provider.clientIdEnv];
    const secret = env[provider.clientSecretEnv];
    return typeof id === "string" && id.length > 0 && typeof secret === "string" && secret.length > 0;
  });
}
