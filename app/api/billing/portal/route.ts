import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureUser, getStripeCustomerId } from "../../../../lib/billing";
import { stripePost } from "../../../../lib/stripe";

type StripePortalSession = { url: string };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    await ensureUser(user);
    const customerId = await getStripeCustomerId(user.email);
    if (!customerId) return Response.json({ error: "No billing account found" }, { status: 404 });
    const session = await stripePost<StripePortalSession>("/billing_portal/sessions", {
      customer: customerId,
      return_url: new URL(request.url).origin,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Billing portal unavailable" }, { status: 503 });
  }
}
