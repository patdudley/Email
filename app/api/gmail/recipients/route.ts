import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  getGoogleConnection,
  gmailFetch,
  GOOGLE_CONTACTS_SCOPE,
  GOOGLE_OTHER_CONTACTS_SCOPE,
  peopleFetch,
} from "../../../../lib/google";
import { emailAddresses, type GmailMessage, header } from "../../../../lib/gmail-message";

type MessageList = { messages?: Array<{ id: string }> };
type Person = { names?: Array<{ displayName?: string }>; emailAddresses?: Array<{ value?: string }> };
type PeopleSearch = { results?: Array<{ person?: Person }> };
type Connections = { connections?: Person[] };
type OtherContacts = { otherContacts?: Person[] };
type Recipient = { name: string; email: string; count: number };

function automatedAddress(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return /(?:^|[._+-])(no-?reply|do-?not-?reply|unsubscribe|mailer-daemon|bounce|abuse|notifications?)(?:$|[._+-])/i.test(local)
    || local.length > 48;
}

function personRecipients(person: Person, score: number): Recipient[] {
  const name = person.names?.find(item => item.displayName)?.displayName?.trim() ?? "";
  return (person.emailAddresses ?? []).flatMap(item => {
    const email = item.value?.trim().toLowerCase();
    if (!email || !email.includes("@") || automatedAddress(email)) return [];
    return [{ name: name || email, email, count: score }];
  });
}

function rankMatch(recipient: Recipient, needle: string): number {
  if (!needle) return recipient.count;
  const name = recipient.name.toLowerCase();
  const email = recipient.email.toLowerCase();
  const local = email.split("@")[0] ?? email;
  if (name === needle || local === needle) return recipient.count + 500;
  if (name.startsWith(needle) || local.startsWith(needle)) return recipient.count + 300;
  if (name.split(/\s+/).some(part => part.startsWith(needle))) return recipient.count + 200;
  return recipient.count;
}

async function gmailRecipients(userEmail: string, escapedSearch: string): Promise<Recipient[]> {
  const queries = escapedSearch
    ? [escapedSearch, `from:${escapedSearch} OR to:${escapedSearch}`, `in:sent ${escapedSearch}`]
    : ["newer_than:2y"];
  const listResults = await Promise.allSettled(queries.map(q => gmailFetch<MessageList>(userEmail, `/messages?${new URLSearchParams({ maxResults: escapedSearch ? "30" : "60", q })}`)));
  const lists = listResults.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (!lists.length) throw listResults.find(result => result.status === "rejected")?.reason ?? new Error("Gmail contact search failed");
  const uniqueIds = [...new Set(lists.flatMap(list => (list.messages ?? []).map(message => message.id)))].slice(0, 60);
  const messages: GmailMessage[] = [];
  for (let index = 0; index < uniqueIds.length; index += 20) {
    const results = await Promise.allSettled(uniqueIds.slice(index, index + 20).map(id =>
      gmailFetch<GmailMessage>(userEmail, `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To`),
    ));
    messages.push(...results.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
  }
  const counts = new Map<string, Recipient>();
  for (const message of messages) {
    const sent = message.labelIds?.includes("SENT") ?? false;
    for (const recipient of emailAddresses(header(message, sent ? "To" : "From"))) {
      if (recipient.email === userEmail.toLowerCase() || automatedAddress(recipient.email)) continue;
      const current = counts.get(recipient.email);
      const weight = sent ? 6 : 2;
      counts.set(recipient.email, current
        ? { ...current, name: current.name.includes("@") ? recipient.name : current.name, count: current.count + weight }
        : { ...recipient, count: weight });
    }
  }
  return [...counts.values()];
}

async function googleContacts(userEmail: string, search: string): Promise<Recipient[]> {
  if (search) {
    const query = encodeURIComponent(search);
    const readMask = "names,emailAddresses";
    const [contacts, other] = await Promise.allSettled([
      peopleFetch<PeopleSearch>(userEmail, `/people:searchContacts?query=${query}&readMask=${readMask}&pageSize=30`),
      peopleFetch<PeopleSearch>(userEmail, `/otherContacts:search?query=${query}&readMask=${readMask}&pageSize=30`),
    ]);
    if (contacts.status === "rejected" && other.status === "rejected") throw contacts.reason;
    return [
      ...(contacts.status === "fulfilled" ? contacts.value.results ?? [] : []).flatMap(result => result.person ? personRecipients(result.person, 2_000) : []),
      ...(other.status === "fulfilled" ? other.value.results ?? [] : []).flatMap(result => result.person ? personRecipients(result.person, 1_500) : []),
    ];
  }
  const [contacts, other] = await Promise.allSettled([
    peopleFetch<Connections>(userEmail, "/people/me/connections?personFields=names,emailAddresses&pageSize=250&sortOrder=LAST_MODIFIED_DESCENDING"),
    peopleFetch<OtherContacts>(userEmail, "/otherContacts?readMask=names,emailAddresses&pageSize=250"),
  ]);
  if (contacts.status === "rejected" && other.status === "rejected") throw contacts.reason;
  return [
    ...(contacts.status === "fulfilled" ? contacts.value.connections ?? [] : []).flatMap(person => personRecipients(person, 2_000)),
    ...(other.status === "fulfilled" ? other.value.otherContacts ?? [] : []).flatMap(person => personRecipients(person, 1_500)),
  ];
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const search = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const escapedSearch = search.replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim();
    const connection = await getGoogleConnection(user.email);
    const granted = new Set((connection?.scopes ?? "").split(/\s+/));
    const contactsAuthorized = granted.has(GOOGLE_CONTACTS_SCOPE) && granted.has(GOOGLE_OTHER_CONTACTS_SCOPE);
    const [gmailResult, contactsResult] = await Promise.allSettled([
      gmailRecipients(user.email, escapedSearch),
      contactsAuthorized ? googleContacts(user.email, escapedSearch) : Promise.resolve([]),
    ]);
    if (gmailResult.status === "rejected" && contactsResult.status === "rejected") throw gmailResult.reason;

    const needle = escapedSearch.toLowerCase();
    const merged = new Map<string, Recipient>();
    const candidates = [
      ...(contactsResult.status === "fulfilled" ? contactsResult.value : []),
      ...(gmailResult.status === "fulfilled" ? gmailResult.value : []),
    ];
    for (const recipient of candidates) {
      if (recipient.email === user.email.toLowerCase()) continue;
      if (needle && !`${recipient.name} ${recipient.email}`.toLowerCase().includes(needle)) continue;
      const current = merged.get(recipient.email);
      if (!current) merged.set(recipient.email, recipient);
      else merged.set(recipient.email, {
        name: current.name.includes("@") ? recipient.name : current.name,
        email: recipient.email,
        count: Math.max(current.count, recipient.count) + Math.min(current.count, recipient.count),
      });
    }
    const recipients = [...merged.values()]
      .sort((a, b) => rankMatch(b, needle) - rankMatch(a, needle) || a.name.localeCompare(b.name))
      .slice(0, escapedSearch ? 30 : 60);
    return Response.json({
      recipients,
      contactsAuthorized,
      contactsUnavailable: contactsAuthorized && contactsResult.status === "rejected",
    }, { headers: { "Cache-Control": escapedSearch ? "private, max-age=60" : "private, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load recipients" }, { status: 502 });
  }
}
