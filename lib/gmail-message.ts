type Header = { name?: string; value?: string };
type Part = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: Part[] };
export type GmailMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part & { headers?: Header[] } };
export type GmailThread = { id: string; historyId?: string; messages?: GmailMessage[] };

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function textFromPart(part?: Part): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const text = textFromPart(child);
    if (text) return text;
  }
  if (part.mimeType === "text/html" && part.body?.data) return decodeBase64Url(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

export function displayName(from: string): { name: string; email: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim() || match[2], email: match[2] };
  return { name: from.split("@")[0] || "Unknown sender", email: from };
}

export function summarizeThread(thread: GmailThread) {
  const messages = thread.messages ?? [];
  const latest = messages[messages.length - 1];
  if (!latest) throw new Error("Empty Gmail thread");
  const from = displayName(header(latest, "From"));
  const subject = header(latest, "Subject") || "(no subject)";
  const timestamp = Number(latest.internalDate ?? Date.now());
  const body = messages.map((message) => textFromPart(message.payload).trim()).filter(Boolean);
  return {
    id: thread.id,
    sender: from.name,
    email: from.email,
    initials: from.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?",
    tone: "mint",
    subject,
    preview: latest.snippet ?? body.at(-1)?.slice(0, 180) ?? "",
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp)),
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)),
    unread: latest.labelIds?.includes("UNREAD") ?? false,
    starred: latest.labelIds?.includes("STARRED") ?? false,
    body,
    threadId: thread.id,
  };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function mimeMessage(input: { to: string; cc?: string; subject: string; body: string; inReplyTo?: string; references?: string }): string {
  const headers = [`To: ${input.to}`, ...(input.cc ? [`Cc: ${input.cc}`] : []), `Subject: ${input.subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit"];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${input.body}`);
}
