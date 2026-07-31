import { getD1 } from "../../../../db";
import { verifyStripeWebhook } from "../../../../lib/stripe";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!signature || !(await verifyStripeWebhook(payload, signature))) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as StripeEvent;
  const db = getD1();
  const prior = await db.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(event.id).first();
  if (prior) return Response.json({ received: true, duplicate: true });

  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const customerId = asString(object.customer);
    const metadata = object.metadata as Record<string, unknown> | undefined;
    const email = asString(metadata?.user_email)?.toLowerCase();
    if (customerId && email) {
      await db.prepare("UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE email = ?")
        .bind(customerId, Math.floor(Date.now() / 1000), email).run();
    }
  }

  if (event.type.startsWith("customer.subscription.")) {
    const metadata = object.metadata as Record<string, unknown> | undefined;
    const email = asString(metadata?.user_email)?.toLowerCase();
    const subscriptionId = asString(object.id);
    const status = asString(object.status);
    const items = object.items as { data?: Array<{ price?: { id?: string }; current_period_end?: number }> } | undefined;
    const priceId = items?.data?.[0]?.price?.id ?? null;
    const currentPeriodEnd = asNumber(object.current_period_end) ?? items?.data?.[0]?.current_period_end ?? null;
    const cancelAtPeriodEnd = object.cancel_at_period_end === true ? 1 : 0;
    if (email && subscriptionId && status) {
      await db.prepare(`
        INSERT INTO subscriptions
          (user_email, stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_email) DO UPDATE SET
          stripe_subscription_id = excluded.stripe_subscription_id,
          stripe_price_id = excluded.stripe_price_id,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          updated_at = excluded.updated_at
      `).bind(email, subscriptionId, priceId, status, currentPeriodEnd, cancelAtPeriodEnd, Math.floor(Date.now() / 1000)).run();
    }
  }

  await db.prepare("INSERT INTO stripe_events (event_id, event_type, processed_at) VALUES (?, ?, ?)")
    .bind(event.id, event.type, Math.floor(Date.now() / 1000)).run();
  return Response.json({ received: true });
}
