import { getChatGPTUser } from "../../../chatgpt-auth";
import { gmailFetch } from "../../../../lib/google";
import { type GmailThread, summarizeDetailedThread, summarizeThread } from "../../../../lib/gmail-message";

type ThreadList = { threads?: Array<{ id: string }>; nextPageToken?: string };

const folderQueries: Record<string, { label?: string; q?: string }> = {
  Inbox: { label: "INBOX" }, Starred: { label: "STARRED" }, Sent: { label: "SENT" }, Drafts: { label: "DRAFT" }, Spam: { label: "SPAM" }, Trash: { label: "TRASH" },
  Archive: { q: "-label:inbox -label:sent -label:drafts -label:spam -label:trash" },
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId")?.trim() ?? "";
    if (threadId) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(threadId)) return Response.json({ error: "Invalid Gmail thread" }, { status: 400 });
      const thread = await gmailFetch<GmailThread>(user.email, `/threads/${encodeURIComponent(threadId)}?format=full`);
      return Response.json({ thread: summarizeDetailedThread(thread) });
    }
    const folder = url.searchParams.get("folder") ?? "Inbox";
    const query = url.searchParams.get("query")?.trim().slice(0, 500) ?? "";
    const pageToken = url.searchParams.get("pageToken")?.trim() ?? "";
    const config = query ? { q: query } : (folderQueries[folder] ?? { label: folder });
    const params = new URLSearchParams({ maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken.slice(0, 1_000));
    if (config.label) params.set("labelIds", config.label);
    if (config.q) params.set("q", config.q);
    if (folder === "Spam" || folder === "Trash") params.set("includeSpamTrash", "true");
    const list = await gmailFetch<ThreadList>(user.email, `/threads?${params}`);
    const threads = await Promise.all((list.threads ?? []).map(({ id }) => gmailFetch<GmailThread>(user.email, `/threads/${encodeURIComponent(id)}?format=full`)));
    return Response.json({ threads: threads.map(summarizeThread), nextPageToken: list.nextPageToken ?? null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load Gmail" }, { status: 502 });
  }
}
