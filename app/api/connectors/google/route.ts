import { getChatGPTUser } from "../../../chatgpt-auth";
import { decryptSecret } from "../../../../lib/crypto";
import { deleteGoogleConnection, getGoogleConnection } from "../../../../lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ connected: false }, { status: 401 });
  const connection = await getGoogleConnection(user.email);
  return Response.json({ connected: Boolean(connection), email: connection?.providerEmail ?? null });
}

export async function DELETE() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const connection = await getGoogleConnection(user.email);
  if (connection) {
    try {
      const token = await decryptSecret(connection.encryptedRefreshToken);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    } catch { /* Delete locally even if Google is unavailable. */ }
  }
  await deleteGoogleConnection(user.email);
  return Response.json({ connected: false });
}
