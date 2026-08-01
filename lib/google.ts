import { getD1 } from "../db";
import { decryptSecret, encryptSecret } from "./crypto";
import { requireRuntimeEnv } from "./runtime-env";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GOOGLE_REDIRECT_PATH = "/api/connectors/google/callback";

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireRuntimeEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireRuntimeEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await response.json() as TokenResponse;
  if (!response.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? "Google authorization failed");
  return json;
}

export async function getGoogleConnection(userEmail: string): Promise<{ providerEmail: string; encryptedRefreshToken: string; scopes: string } | null> {
  return getD1().prepare(`SELECT provider_email AS providerEmail, encrypted_refresh_token AS encryptedRefreshToken, scopes FROM connector_accounts WHERE user_email = ? AND provider = 'google'`)
    .bind(userEmail.toLowerCase()).first<{ providerEmail: string; encryptedRefreshToken: string; scopes: string }>();
}

export async function saveGoogleConnection(userEmail: string, providerEmail: string, refreshToken: string, scopes: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await getD1().prepare(`
    INSERT INTO connector_accounts (user_email, provider, provider_email, encrypted_refresh_token, scopes, created_at, updated_at)
    VALUES (?, 'google', ?, ?, ?, ?, ?)
    ON CONFLICT(user_email, provider) DO UPDATE SET provider_email = excluded.provider_email, encrypted_refresh_token = excluded.encrypted_refresh_token, scopes = excluded.scopes, updated_at = excluded.updated_at
  `).bind(userEmail.toLowerCase(), providerEmail, await encryptSecret(refreshToken), scopes, now, now).run();
}

export async function deleteGoogleConnection(userEmail: string): Promise<void> {
  await getD1().prepare("DELETE FROM connector_accounts WHERE user_email = ? AND provider = 'google'").bind(userEmail.toLowerCase()).run();
}

export async function googleAccessToken(userEmail: string): Promise<string> {
  const connection = await getGoogleConnection(userEmail);
  if (!connection) throw new Error("Gmail is not connected");
  const body = new URLSearchParams({
    client_id: requireRuntimeEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireRuntimeEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: await decryptSecret(connection.encryptedRefreshToken),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await response.json() as TokenResponse;
  if (!response.ok || !json.access_token) {
    if (json.error === "invalid_grant") await deleteGoogleConnection(userEmail);
    throw new Error(json.error === "invalid_grant" ? "Gmail access expired. Reconnect your account." : (json.error_description ?? "Could not refresh Gmail access"));
  }
  return json.access_token;
}

export async function gmailFetch<T>(userEmail: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await googleAccessToken(userEmail)}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const json = response.status === 204 ? {} : await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error((json as { error?: { message?: string } }).error?.message ?? "Gmail request failed");
  return json as T;
}
