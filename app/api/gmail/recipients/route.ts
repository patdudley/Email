import { getChatGPTUser } from "../../../chatgpt-auth";
import { gmailFetch } from "../../../../lib/google";
import { type GmailMessage, header } from "../../../../lib/gmail-message";

type MessageList = { messages?: Array<{ id: string }> };
type Recipient = { name: string; email: string; count: number };

function recipientsFromHeader(value: string): Array<{ name: string; email: string }> {
  const recipients: Array<{ name: string; email: string }> = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(/(?:"([^"]+)"|([^,<"]+?))?\s*<([^<>\s@]+@[^<>\s]+)>|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    const email = (match[3] ?? match[4] ?? "").replace(/[;,]+$/, "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const rawName = (match[1] ?? match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
    recipients.push({ name: rawName || email.split("@")[0], email });
  }
  return recipients;
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const search = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const escapedSearch = search.replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim();
    const gmailQuery = escapedSearch ? `{from:"${escapedSearch}" to:"${escapedSearch}"}` : "newer_than:2y";
    const params = new URLSearchParams({ maxResults: escapedSearch ? "50" : "200", q: gmailQuery });
    const list = await gmailFetch<MessageList>(user.email, `/messages?${params}`);
    const messages: GmailMessage[] = [];
    const ids = list.messages ?? [];
    for (let index = 0; index < ids.length; index += 20) {
      messages.push(...await Promise.all(ids.slice(index, index + 20).map(({ id }) =>
        gmailFetch<GmailMessage>(user.email, `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To`),
      )));
    }
    const counts = new Map<string, Recipient>();
    for (const message of messages) {
      const sent = message.labelIds?.includes("SENT") ?? false;
      const correspondents = recipientsFromHeader(header(message, sent ? "To" : "From"));
      for (const recipient of correspondents) {
        if (recipient.email === user.email.toLowerCase()) continue;
        const current = counts.get(recipient.email);
        const weight = sent ? 2 : 1;
        counts.set(recipient.email, current ? { ...current, name: current.name.includes("@") ? recipient.name : current.name, count: current.count + weight } : { ...recipient, count: weight });
      }
    }
    const needle = escapedSearch.toLowerCase();
    const recipients = [...counts.values()]
      .filter(recipient => !needle || recipient.name.toLowerCase().includes(needle) || recipient.email.includes(needle))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, escapedSearch ? 50 : 150);
    return Response.json({ recipients }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load frequent recipients" }, { status: 502 });
  }
}
