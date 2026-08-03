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
  assert.match(html, /Loading your Gmail inbox/i);
  assert.doesNotMatch(html, /Priya Shah|West Elm|Acme Supply|HealthCo Claims|Fontainebleau/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("includes baseline mailbox actions", async () => {
  const [page, css, gmailMessage, recipients, suggestions, sendRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/gmail-message.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gmail/recipients/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gmail/suggestions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gmail/send/route.ts", import.meta.url), "utf8"),
  ]);
  for (const action of ["Archive", "Spam", "Trash", "Forward", "Reply all", "Mark unread", "Snooze"]) {
    assert.match(page, new RegExp(action, "i"));
  }
  assert.match(gmailMessage, /remoteImagesFromPart/);
  assert.match(gmailMessage, /remoteImagesFromText/);
  assert.match(gmailMessage, /View image:/);
  assert.match(gmailMessage, /\.\.\.body\.flatMap\(remoteImagesFromText\)/);
  assert.match(gmailMessage, /\^https\?:\\\/\\\//);
  assert.match(page, /className="email-images"/);
  assert.match(page, /className="inline-email-image"/);
  assert.match(page, /function EmailBodyText/);
  assert.match(page, /function EmailHtml/);
  assert.match(page, /sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
  for (const tooltip of ["Back", "Archive", "Report spam", "Move to Trash", "Snooze", "Mark unread"]) {
    assert.match(page, new RegExp(`data-tooltip="${tooltip}"`, "i"));
  }
  assert.match(page, /referrerPolicy="no-referrer"/);
  assert.match(page, /Frequently contacted/);
  assert.match(page, /Search anyone in Gmail/);
  assert.match(page, /scheduleRecipientSearch/);
  assert.match(page, /Promise\.allSettled\(lookups\)/);
  assert.match(page, /\/api\/gmail\/suggestions\?q=/);
  assert.match(page, /,60\);/);
  assert.match(page, /recipientQuery\.length>=2\?16:8/);
  assert.match(page, /aria-autocomplete="list"/);
  assert.match(page, /handleRecipientKey/);
  assert.match(recipients, /maxResults:\s*escapedSearch\s*\?\s*"30"\s*:\s*"60"/);
  assert.match(recipients, /format=metadata&metadataHeaders=From&metadataHeaders=To/);
  assert.match(recipients, /message\.labelIds\?\.includes\("SENT"\)/);
  assert.match(recipients, /from:\$\{escapedSearch\} OR to:\$\{escapedSearch\}/);
  assert.match(recipients, /people:searchContacts/);
  assert.match(recipients, /otherContacts:search/);
  assert.match(recipients, /automatedAddress/);
  assert.match(recipients, /Promise\.allSettled\(queries\.map/);
  assert.match(page, /loadRecipientSuggestions\(query\)/);
  assert.match(page, /Get Gmail-quality contact suggestions/);
  assert.match(page, /console\.cloud\.google\.com\/apis\/library\/people\.googleapis\.com/);
  assert.match(page, /Recent matching emails/);
  assert.match(page, /Search all email for/);
  assert.match(page, /function inboxDate/);
  assert.match(page, /dateTime=\{m\.date\}/);
  assert.match(page, /<b>\{inboxDate\(m\.date\)\}<\/b><small>\{m\.time\}<\/small>/);
  assert.doesNotMatch(page, /Suggested action:/);
  assert.doesNotMatch(page, /runSuggestedAction/);
  assert.match(page, /className="row-archive"/);
  assert.match(page, /archiveMessage/);
  assert.match(page, /Inbox display size/);
  assert.match(page, /resolve-mail-density/);
  for (const density of ["compact", "standard", "large"]) {
    assert.match(page, new RegExp(`value="${density}"`, "i"));
    assert.match(css, new RegExp(`density-${density}`, "i"));
  }
  assert.match(css, /\.row-archive/);
  assert.match(page, /localSearchSuggestions/);
  assert.match(page, /scheduleSearchPreview/);
  assert.match(page, /\/api\/gmail\/suggestions/);
  assert.match(page, /},90\)/);
  assert.match(suggestions, /getChatGPTUser/);
  assert.match(suggestions, /maxResults:\s*"8"/);
  assert.match(suggestions, /threads\.map\(summarizeThread\)/);
  assert.match(suggestions, /emailAddresses\(header\(message, name\)\)/);
  for (const capability of ["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Insert link"]) assert.match(page, new RegExp(capability));
  assert.match(page, /contentEditable/);
  assert.match(page, /addAttachments/);
  assert.match(page, /type="file" multiple/);
  assert.match(page, /composeAttachments/);
  assert.match(gmailMessage, /multipart\/mixed/);
  assert.match(gmailMessage, /multipart\/alternative/);
  assert.match(gmailMessage, /Content-Disposition: attachment/);
  assert.match(sendRoute, /encodedAttachmentBytes/);
  assert.match(sendRoute, /10\*1024\*1024/);
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
  const [threads, chat, page, css, gmailMessage] = await Promise.all([
    readFile(new URL("../app/api/gmail/threads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/gmail-message.ts", import.meta.url), "utf8"),
  ]);
  assert.match(threads, /maxResults:\s*query\s*\?\s*"25"\s*:\s*"50"/);
  assert.match(threads, /pageToken/);
  assert.match(page, /changeGmailPage/);
  assert.match(css, /\.mail-list\{[^}]*overflow-y:auto/);
  assert.match(chat, /compactEmailContext/);
  assert.match(chat, /searchGmail/);
  assert.match(chat, /maxResults:\s*"25"/);
  assert.match(chat, /body\.searchOnly/);
  assert.match(chat, /!body\.skipGmailSearch/);
  assert.match(chat, /gmailSearchQuery/);
  assert.match(chat, /matches:\s*accountMatches/);
  assert.match(threads, /url\.searchParams\.get\("query"\)/);
  assert.match(page, /Summary of.*matching email/);
  assert.match(page, /Results for/);
  assert.match(page, /loadGmailSearchPage/);
  assert.match(page, /searchOnly:true/);
  assert.match(page, /skipGmailSearch:true/);
  assert.match(page, /Summarizing the recent matches/);
  assert.match(css, /\.ai-answer\.search-summary/);
  assert.match(chat, /42_000/);
  assert.doesNotMatch(chat, /Email context is too large/);
  assert.match(threads, /threadId/);
  assert.match(threads, /summarizeDetailedThread/);
  assert.match(gmailMessage, /sanitizeEmailHtml/);
  assert.match(gmailMessage, /script\|iframe\|object\|embed/);
});

test("keeps Gmail navigation and mailbox actions responsive", async () => {
  const [page, threads, googleSource] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/gmail/threads/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const removeFromView=/);
  assert.match(page, /setLiveMail\(current=>current\.filter/);
  assert.match(page, /change reversed/);
  assert.match(page, /gmailMutationId/);
  assert.match(threads, /format:\s*"metadata"/);
  assert.match(threads, /metadataHeaders/);
  assert.match(googleSource, /accessTokenCache/);
  assert.match(googleSource, /accessTokenRefreshes/);
  assert.match(googleSource, /if \(refreshing\) return refreshing/);
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
  assert.match(googleSource, /contacts\.readonly/);
  assert.match(googleSource, /contacts\.other\.readonly/);
  assert.match(googleSource, /peopleFetch/);
  assert.match(start, /scope:\s*GOOGLE_SCOPES/);
  assert.match(callback, /DELETE FROM oauth_states/);
  assert.match(callback, /saveGoogleConnection/);
  assert.match(cryptoSource, /AES-GCM/);
  assert.match(page, /\/api\/connectors\/google\/start/);
});

test("supports persistent standalone tasks with an interactive research agent", async () => {
  const [page, css, schema, taskRoute, taskChat, completionRoute, completionRules, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/detect-completions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/task-completion.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_blue_magus.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /What are you working on\?/);
  assert.match(page, /Create task and start/);
  assert.match(page, /One-time/);
  assert.match(page, /Recurring/);
  assert.match(page, /Recurrence interval/);
  assert.match(page, /task-conversation/);
  assert.match(page, /Completed/);
  assert.match(page, /Mark complete/);
  assert.match(page, /Reopen/);
  assert.match(schema, /sqliteTable\("tasks"/);
  assert.match(schema, /sqliteTable\("task_messages"/);
  assert.match(schema, /recurrenceType/);
  assert.match(taskRoute, /WHERE user_email=\?/);
  assert.match(taskRoute, /export async function PATCH/);
  assert.match(taskRoute, /UPDATE tasks SET status=\?, updated_at=\? WHERE id=\? AND user_email=\?/);
  assert.match(taskChat, /WHERE id=\? AND user_email=\?/);
  assert.match(taskChat, /web_search_preview/);
  assert.match(taskChat, /reserveAiAnswer/);
  assert.match(schema, /sqliteTable\("task_completions"/);
  assert.match(migration, /CREATE TABLE `task_completions`/);
  assert.match(completionRoute, /gmailFetch/);
  assert.match(completionRoute, /ON CONFLICT\(task_id,period_key\) DO NOTHING/);
  assert.match(completionRoute, /task\.recurrenceType==="one_time"/);
  assert.match(completionRules, /isStrongCompletionEvidence/);
  assert.match(completionRules, /nonCompletionEvidence/);
  assert.match(completionRules, /positivePaymentEvidence/);
  assert.match(completionRules, /confirmedRentTransfer/);
  assert.match(completionRules, /amount>=500/);
  assert.match(completionRules, /You sent money with Zelle/);
  assert.match(completionRoute, /lookbackDays=isRentTask\?10:3/);
  assert.match(completionRoute, /format=full/);
  assert.match(taskRoute, /recurringOccurrence/);
  assert.match(taskRoute, /DELETE FROM task_completions/);
  assert.match(page, /detectTaskCompletions/);
  assert.match(page, /Completed automatically from email/);
  assert.match(page, /Paid this month/);
  assert.match(page, /Reopen this period/);
  assert.match(page, /function taskIsCompleted/);
  assert.match(page, /activeTaskCount/);
  assert.match(page, /completedTaskCount/);
  assert.match(page, /taskFilter==="completed"\?taskIsCompleted\(task\):!taskIsCompleted\(task\)/);
  assert.match(page, /sidebar-view-toggle/);
  assert.match(page, /view!=="tasks"/);
  assert.match(page, /Good morning/);
  assert.match(page, /Here’s your Resolve summary/);
  assert.match(page, /You’re all caught up/);
  assert.match(css, /\.app\.tasks-mode\{grid-template-columns:1fr\}/);
  assert.match(css, /\.ai-welcome/);
  assert.match(css, /task-evidence/);
});
