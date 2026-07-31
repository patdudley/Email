import { requireRuntimeEnv } from "./runtime-env";

type StripeParams = Record<string, string | number | boolean | null | undefined>;

export async function stripePost<T>(path: string, params: StripeParams): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireRuntimeEnv("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? "Stripe request failed");
  return json;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyStripeWebhook(payload: string, signatureHeader: string): Promise<boolean> {
  const fields = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireRuntimeEnv("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}
