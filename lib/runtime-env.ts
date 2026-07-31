import { env } from "cloudflare:workers";

type RuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_PRICE_ID?: string;
};

export function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function requireRuntimeEnv<K extends keyof RuntimeEnv>(key: K): string {
  const value = runtimeEnv()[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}
