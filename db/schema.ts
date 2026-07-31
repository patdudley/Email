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
