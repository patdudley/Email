import { getChatGPTUser } from "../../../chatgpt-auth";
import { gmailFetch } from "../../../../lib/google";
import { type GmailThread, header, mimeMessage } from "../../../../lib/gmail-message";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json() as { to?: string; cc?: string; subject?: string; body?: string; html?: string; attachments?: Array<{name?:string;type?:string;data?:string;size?:number}>; threadId?: string };
  const attachments=(body.attachments??[]).slice(0,5).map(file=>({name:file.name?.slice(0,240).trim()||"attachment",type:file.type?.slice(0,120)||"application/octet-stream",data:file.data?.replace(/\s+/g,"")??"",size:Math.max(0,file.size??0)}));
  if (!body.to?.trim()) return Response.json({ error: "A recipient is required" }, { status: 400 });
  if (!body.body?.trim()&&!body.html?.trim()&&!attachments.length) return Response.json({ error: "Add a message or attachment" }, { status: 400 });
  const encodedAttachmentBytes=attachments.reduce((total,file)=>total+Math.floor(file.data.replace(/=+$/,"").length*3/4),0);
  if((body.attachments?.length??0)>5||attachments.some(file=>!file.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))||encodedAttachmentBytes>10*1024*1024)return Response.json({error:"Attach up to 5 files totaling 10 MB or less"},{status:400});
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
    const raw = mimeMessage({ to: body.to.trim(), cc: body.cc?.trim(), subject: body.subject?.trim()??"", body: body.body??"", html:body.html, attachments, inReplyTo, references });
    const sent = await gmailFetch<{ id: string; threadId: string }>(user.email, "/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(body.threadId ? { threadId: body.threadId } : {}) }) });
    return Response.json({ sent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send email" }, { status: 502 });
  }
}
