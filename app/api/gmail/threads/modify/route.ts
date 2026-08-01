import { getChatGPTUser } from "../../../../chatgpt-auth";
import { gmailFetch } from "../../../../../lib/google";

type Action = "archive" | "spam" | "trash" | "restore" | "read" | "unread" | "star" | "unstar";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { ids?: string[]; action?: Action };
  const ids = [...new Set((body.ids ?? []).filter(Boolean))].slice(0, 50);
  if (!ids.length || !body.action) return Response.json({ error: "Thread IDs and action are required" }, { status: 400 });
  try {
    await Promise.all(ids.map(async (id) => {
      const path = `/threads/${encodeURIComponent(id)}`;
      if (body.action === "trash") return gmailFetch(user.email, `${path}/trash`, { method: "POST" });
      if (body.action === "restore") return gmailFetch(user.email, `${path}/untrash`, { method: "POST" });
      const changes: Record<Action, { addLabelIds?: string[]; removeLabelIds?: string[] }> = {
        archive: { removeLabelIds: ["INBOX"] }, spam: { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }, trash: {}, restore: {}, read: { removeLabelIds: ["UNREAD"] }, unread: { addLabelIds: ["UNREAD"] }, star: { addLabelIds: ["STARRED"] }, unstar: { removeLabelIds: ["STARRED"] },
      };
      return gmailFetch(user.email, `${path}/modify`, { method: "POST", body: JSON.stringify(changes[body.action!]) });
    }));
    return Response.json({ ok: true, count: ids.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gmail action failed" }, { status: 502 });
  }
}
