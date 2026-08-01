import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Resolve application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Resolve — Finish the work buried in your email<\/title>/i);
  assert.match(html, /Ask anything about your email/i);
  assert.match(html, /Connectors/i);
  assert.match(html, /Gmail not connected/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("includes baseline mailbox actions", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const action of ["Archive", "Spam", "Trash", "Forward", "Reply all", "Mark unread", "Snooze"]) {
    assert.match(page, new RegExp(action, "i"));
  }
});

test("enforces AI usage and paid access on the server", async () => {
  const [billing, chat, webhook, checkout] = await Promise.all([
    readFile(new URL("../lib/billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(billing, /FREE_MONTHLY_ANSWERS\s*=\s*30/);
  assert.match(billing, /ai_answers\s*<\s*\?/);
  assert.match(chat, /reserveAiAnswer/);
  assert.match(chat, /rollbackAiAnswer/);
  assert.match(webhook, /verifyStripeWebhook/);
  assert.match(webhook, /stripe_events/);
  assert.match(checkout, /mode:\s*"subscription"/);
  assert.match(checkout, /STRIPE_PRO_PRICE_ID/);
});

test("supports scrollable 50-message Gmail pages and bounded AI context", async () => {
  const [threads, chat, page, css] = await Promise.all([
    readFile(new URL("../app/api/gmail/threads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(threads, /maxResults:\s*"50"/);
  assert.match(threads, /pageToken/);
  assert.match(page, /changeGmailPage/);
  assert.match(css, /\.mail-list\{[^}]*overflow-y:auto/);
  assert.match(chat, /compactEmailContext/);
  assert.match(chat, /searchGmail/);
  assert.match(chat, /maxResults:\s*"30"/);
  assert.match(chat, /42_000/);
  assert.doesNotMatch(chat, /Email context is too large/);
});

test("protects Gmail authorization and connector credentials", async () => {
  const [start, callback, cryptoSource, googleSource, page] = await Promise.all([
    readFile(new URL("../app/api/connectors/google/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/google/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/crypto.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(start, /access_type:\s*"offline"/);
  assert.match(start, /sha256\(state\)/);
  assert.match(googleSource, /gmail\.modify/);
  assert.match(callback, /DELETE FROM oauth_states/);
  assert.match(callback, /saveGoogleConnection/);
  assert.match(cryptoSource, /AES-GCM/);
  assert.match(page, /\/api\/connectors\/google\/start/);
});
