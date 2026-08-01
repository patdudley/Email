import { getChatGPTUser, chatGPTSignInPath } from "../../../../chatgpt-auth";
import { ensureUser } from "../../../../../lib/billing";
import { sha256 } from "../../../../../lib/crypto";
import { GMAIL_SCOPE, GOOGLE_REDIRECT_PATH } from "../../../../../lib/google";
import { requireRuntimeEnv } from "../../../../../lib/runtime-env";
import { getD1 } from "../../../../../db";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.redirect(new URL(chatGPTSignInPath("/"), request.url));
  await ensureUser(user);
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(stateBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  await getD1().prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now).run();
  await getD1().prepare("INSERT INTO oauth_states (state_hash, user_email, provider, expires_at, created_at) VALUES (?, ?, 'google', ?, ?)")
    .bind(await sha256(state), user.email.toLowerCase(), now + 600, now).run();
  const redirectUri = `${new URL(request.url).origin}${GOOGLE_REDIRECT_PATH}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: requireRuntimeEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  }).toString();
  return Response.redirect(auth);
}
