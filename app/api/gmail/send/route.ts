import { getChatGPTUser } from "../../../chatgpt-auth";
import { gmailFetch } from "../../../../lib/google";
import { type GmailThread, header, mimeMessage } from "../../../../lib/gmail-message";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { to?: string; cc?: string; subject?: string; body?: string; threadId?: string };
  if (!body.to?.trim() || !body.subject?.trim() || !body.body?.trim()) return Response.json({ error: "Recipient, subject, and message are required" }, { status: 400 });
  try {
    let inReplyTo: string | undefined;
    let references: string | undefined;
    if (body.threadId) {
      const thread = await gmailFetch<GmailThread>(user.email, `/threads/${encodeURIComponent(body.threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`);
      const latest = thread.messages?.at(-1);
      if (latest) {
        inReplyTo = header(latest, "Message-ID") || undefined;
        references = [header(latest, "References"), inReplyTo].filter(Boolean).join(" ") || undefined;
      }
    }
    const raw = mimeMessage({ to: body.to.trim(), cc: body.cc?.trim(), subject: body.subject.trim(), body: body.body, inReplyTo, references });
    const sent = await gmailFetch<{ id: string; threadId: string }>(user.email, "/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(body.threadId ? { threadId: body.threadId } : {}) }) });
    return Response.json({ sent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send email" }, { status: 502 });
  }
}
