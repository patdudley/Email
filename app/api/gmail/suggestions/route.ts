import { getChatGPTUser } from "../../../chatgpt-auth";
import { emailAddresses, header, summarizeThread, type GmailThread } from "../../../../lib/gmail-message";
import { gmailFetch } from "../../../../lib/google";

type ThreadList = { threads?: Array<{ id: string }> };
type Contact = { name: string; email: string; count: number };

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    if (!query) return Response.json({ contacts: [], emails: [] });
    const params = new URLSearchParams({ maxResults: "8", q: query });
    const list = await gmailFetch<ThreadList>(user.email, `/threads?${params}`);
    const threads = await Promise.all((list.threads ?? []).map(({ id }) =>
      gmailFetch<GmailThread>(user.email, `/threads/${encodeURIComponent(id)}?format=full`),
    ));
    const counts = new Map<string, Contact>();
    const ownEmail = user.email.toLowerCase();
    for (const thread of threads) {
      for (const message of thread.messages ?? []) {
        for (const name of ["From", "To", "Cc"]) {
          for (const contact of emailAddresses(header(message, name))) {
            if (contact.email === ownEmail) continue;
            const current = counts.get(contact.email);
            counts.set(contact.email, current
              ? { ...current, name: current.name.includes("@") ? contact.name : current.name, count: current.count + 1 }
              : { ...contact, count: 1 });
          }
        }
      }
    }
    const needle = query.toLowerCase();
    const contacts = [...counts.values()]
      .filter(contact => contact.name.toLowerCase().includes(needle) || contact.email.includes(needle))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6);
    return Response.json({ contacts, emails: threads.map(summarizeThread).slice(0, 8) }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load email suggestions" }, { status: 502 });
  }
}
