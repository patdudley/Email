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
