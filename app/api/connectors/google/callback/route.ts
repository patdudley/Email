import { getD1 } from "../../../../../db";
import { sha256 } from "../../../../../lib/crypto";
import { exchangeGoogleCode, GOOGLE_REDIRECT_PATH, saveGoogleConnection } from "../../../../../lib/google";

type Profile = { emailAddress?: string; error?: { message?: string } };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return Response.redirect(new URL(`/?gmail=denied`, url.origin));
  if (!state || !code) return Response.redirect(new URL(`/?gmail=invalid`, url.origin));
  const stateHash = await sha256(state);
  const record = await getD1().prepare("SELECT user_email AS userEmail, expires_at AS expiresAt FROM oauth_states WHERE state_hash = ? AND provider = 'google'")
    .bind(stateHash).first<{ userEmail: string; expiresAt: number }>();
  await getD1().prepare("DELETE FROM oauth_states WHERE state_hash = ?").bind(stateHash).run();
  if (!record || record.expiresAt < Math.floor(Date.now() / 1000)) return Response.redirect(new URL(`/?gmail=expired`, url.origin));
  try {
    const tokens = await exchangeGoogleCode(code, `${url.origin}${GOOGLE_REDIRECT_PATH}`);
    if (!tokens.refresh_token) throw new Error("Google did not return offline access");
    const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json() as Profile;
    if (!profileResponse.ok || !profile.emailAddress) {
      const detail = profile.error?.message ?? "Could not read Gmail profile";
      throw new Error(`Gmail profile request failed (${profileResponse.status}): ${detail}`);
    }
    await saveGoogleConnection(record.userEmail, profile.emailAddress, tokens.refresh_token, tokens.scope ?? "");
    return Response.redirect(new URL(`/?gmail=connected`, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google connection error";
    console.error("Google OAuth callback failed", message);
    const reason = message.includes("Gmail profile request failed (403)")
      ? "api-disabled"
      : message.includes("offline access")
        ? "offline-access"
        : "failed";
    return Response.redirect(new URL(`/?gmail=${reason}`, url.origin));
  }
}
