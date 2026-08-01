# Resolve

Resolve is an inbox-first email platform with tasks and AI built directly into every thread. It combines a familiar Gmail-style mailbox with natural-language search, concise email summaries, and contextual tasks.

## MVP

- Minimal inbox, reader, compose, and reply experience
- Reply, reply-all, forward, star, mark unread, snooze, archive, spam, trash, and attachment controls
- Natural-language AI search for questions such as “What hotel am I staying at in Vegas?”
- AI summaries on every inbox row for fast scanning
- Familiar Inbox, Starred, Snoozed, Sent, Drafts, Archive, Spam, and Trash navigation
- Prominent Mail and Tasks tabs inspired by focused writing tools
- One-click conversion from any email into a tracked task
- Full email-thread, people, attachment, deadline, and instruction context for the AI agent
- AI-prepared replies and actions with explicit approval
- Responsive desktop and mobile layouts
- Authenticated Resolve accounts with durable plan and usage records
- Stripe-hosted subscription checkout and customer billing portal
- Verified Stripe webhooks and hard server-side AI usage limits
- Realistic demonstration data for returns, claims, reimbursements, and billing disputes

Resolve supports an owner-only Gmail test connection using Google OAuth, encrypted refresh-token storage, live folder loading, send/reply/forward, and core mailbox actions. The UI falls back to demonstration messages until Gmail is connected. Broader public rollout still requires Google restricted-scope verification, a security assessment where applicable, privacy-policy review, push/history synchronization, and expanded integration testing.

## Billing and AI configuration

Resolve Free includes 30 successful AI answers per calendar month. Resolve Pro is a flat $20 monthly subscription with 500 answers. Usage is reserved atomically on the server and returned when a model request fails.

Copy `.env.example` to `.env.local` for local development and configure the corresponding production values as Sites runtime variables. Stripe should send `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` to `/api/billing/webhook`. Never commit API or webhook secrets.

For Gmail, enable the Gmail API and register `/api/connectors/google/callback` on the deployed origin as an authorized redirect URI. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a random 32-byte base64 `CONNECTOR_ENCRYPTION_KEY` as hosted environment values. Resolve requests `gmail.modify`, validates a single-use OAuth state, requests offline access, and encrypts refresh tokens with AES-GCM before writing them to D1.

## Run locally

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm run dev
```

Build for production with `pnpm run build`.
