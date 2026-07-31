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
- Realistic demonstration data for returns, claims, reimbursements, and billing disputes

This first version is a polished, local-first product prototype. It uses demonstration messages and in-memory interactions. Do not connect a personal mailbox until Gmail OAuth, encrypted token storage, Gmail API sync/send routes, webhook or history synchronization, durable user data, and integration tests are implemented.

## Run locally

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm run dev
```

Build for production with `pnpm run build`.
