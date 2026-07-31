import { getChatGPTUser, chatGPTSignInPath } from "../../chatgpt-auth";
import { getAccount } from "../../../lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Authentication required", signInUrl: chatGPTSignInPath("/") }, { status: 401 });
  }
  try {
    return Response.json({ account: await getAccount(user) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Account unavailable" }, { status: 500 });
  }
}
