import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureUser, getStripeCustomerId, setStripeCustomerId } from "../../../../lib/billing";
import { requireRuntimeEnv } from "../../../../lib/runtime-env";
import { stripePost } from "../../../../lib/stripe";

type StripeCustomer = { id: string };
type StripeSession = { url: string };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    await ensureUser(user);
    let customerId = await getStripeCustomerId(user.email);
    if (!customerId) {
      const customer = await stripePost<StripeCustomer>("/customers", {
        email: user.email,
        name: user.displayName,
        "metadata[user_email]": user.email.toLowerCase(),
      });
      customerId = customer.id;
      await setStripeCustomerId(user.email, customerId);
    }
    const origin = new URL(request.url).origin;
    const session = await stripePost<StripeSession>("/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": requireRuntimeEnv("STRIPE_PRO_PRICE_ID"),
      "line_items[0][quantity]": 1,
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
      allow_promotion_codes: true,
      "subscription_data[metadata][user_email]": user.email.toLowerCase(),
      "metadata[user_email]": user.email.toLowerCase(),
    });
    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Checkout unavailable" }, { status: 503 });
  }
}
