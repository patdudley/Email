import { getD1 } from "../db";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export const FREE_MONTHLY_ANSWERS = 30;
export const PRO_MONTHLY_ANSWERS = 500;

export type AccountSummary = {
  email: string;
  displayName: string;
  plan: "free" | "pro";
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number | null;
  usage: number;
  limit: number;
  periodStart: string;
  hasBillingAccount: boolean;
};

export function currentPeriodStart(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function ensureUser(user: ChatGPTUser): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await getD1().prepare(`
    INSERT INTO users (email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
  `).bind(user.email.toLowerCase(), user.displayName, now, now).run();
}

export async function getAccount(user: ChatGPTUser): Promise<AccountSummary> {
  await ensureUser(user);
  const email = user.email.toLowerCase();
  const periodStart = currentPeriodStart();
  const row = await getD1().prepare(`
    SELECT u.stripe_customer_id AS stripeCustomerId,
           s.status AS subscriptionStatus,
           s.current_period_end AS currentPeriodEnd,
           s.cancel_at_period_end AS cancelAtPeriodEnd,
           COALESCE(m.ai_answers, 0) AS usage
    FROM users u
    LEFT JOIN subscriptions s ON s.user_email = u.email
    LEFT JOIN usage_months m ON m.user_email = u.email AND m.period_start = ?
    WHERE u.email = ?
  `).bind(periodStart, email).first<{
    stripeCustomerId: string | null;
    subscriptionStatus: string | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: number | null;
    usage: number;
  }>();
  const isPro = row?.subscriptionStatus === "active" || row?.subscriptionStatus === "trialing";
  return {
    email,
    displayName: user.displayName,
    plan: isPro ? "pro" : "free",
    subscriptionStatus: row?.subscriptionStatus ?? null,
    cancelAtPeriodEnd: Boolean(row?.cancelAtPeriodEnd),
    currentPeriodEnd: row?.currentPeriodEnd ?? null,
    usage: Number(row?.usage ?? 0),
    limit: isPro ? PRO_MONTHLY_ANSWERS : FREE_MONTHLY_ANSWERS,
    periodStart,
    hasBillingAccount: Boolean(row?.stripeCustomerId),
  };
}

export async function reserveAiAnswer(user: ChatGPTUser): Promise<AccountSummary> {
  const account = await getAccount(user);
  const now = Math.floor(Date.now() / 1000);
  const db = getD1();
  await db.prepare(`
    INSERT OR IGNORE INTO usage_months
      (user_email, period_start, ai_answers, input_tokens, output_tokens, updated_at)
    VALUES (?, ?, 0, 0, 0, ?)
  `).bind(account.email, account.periodStart, now).run();
  const result = await db.prepare(`
    UPDATE usage_months
    SET ai_answers = ai_answers + 1, updated_at = ?
    WHERE user_email = ? AND period_start = ? AND ai_answers < ?
  `).bind(now, account.email, account.periodStart, account.limit).run();
  if (!result.meta.changes) {
    const error = new Error("AI usage limit reached");
    error.name = "UsageLimitError";
    throw error;
  }
  return { ...account, usage: account.usage + 1 };
}

export async function rollbackAiAnswer(userEmail: string, periodStart: string): Promise<void> {
  await getD1().prepare(`
    UPDATE usage_months SET ai_answers = ai_answers - 1, updated_at = ?
    WHERE user_email = ? AND period_start = ? AND ai_answers > 0
  `).bind(Math.floor(Date.now() / 1000), userEmail, periodStart).run();
}

export async function recordAiTokens(userEmail: string, periodStart: string, inputTokens: number, outputTokens: number): Promise<void> {
  await getD1().prepare(`
    UPDATE usage_months
    SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ?
    WHERE user_email = ? AND period_start = ?
  `).bind(inputTokens, outputTokens, Math.floor(Date.now() / 1000), userEmail, periodStart).run();
}

export async function getStripeCustomerId(email: string): Promise<string | null> {
  const row = await getD1().prepare("SELECT stripe_customer_id AS id FROM users WHERE email = ?")
    .bind(email.toLowerCase()).first<{ id: string | null }>();
  return row?.id ?? null;
}

export async function setStripeCustomerId(email: string, customerId: string): Promise<void> {
  await getD1().prepare("UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE email = ?")
    .bind(customerId, Math.floor(Date.now() / 1000), email.toLowerCase()).run();
}
