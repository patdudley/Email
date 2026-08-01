import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("users_stripe_customer_idx").on(table.stripeCustomerId)]);

export const subscriptions = sqliteTable("subscriptions", {
  userEmail: text("user_email").primaryKey().references(() => users.email, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").notNull(),
  currentPeriodEnd: integer("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("subscriptions_stripe_id_idx").on(table.stripeSubscriptionId)]);

export const usageMonths = sqliteTable("usage_months", {
  userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  aiAnswers: integer("ai_answers").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userEmail, table.periodStart] })]);

export const stripeEvents = sqliteTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: integer("processed_at").notNull(),
});

export const oauthStates = sqliteTable("oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const connectorAccounts = sqliteTable("connector_accounts", {
  userEmail: text("user_email").notNull().references(() => users.email, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerEmail: text("provider_email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  scopes: text("scopes").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userEmail, table.provider] })]);
