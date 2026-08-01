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

function htmlFromPart(part?: Part): string {
  if (!part) return "";
  if (part.mimeType === "text/html" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const html = htmlFromPart(child);
    if (html) return html;
  }
  return "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

export function remoteImagesFromPart(part?: Part): Array<{ src: string; alt: string }> {
  const html = htmlFromPart(part);
  if (!html) return [];
  const images: Array<{ src: string; alt: string }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = attribute(tag, "src");
    if (!/^https?:\/\//i.test(src) || seen.has(src)) continue;
    const width = Number.parseInt(attribute(tag, "width"), 10);
    const height = Number.parseInt(attribute(tag, "height"), 10);
    const style = attribute(tag, "style").toLowerCase();
    if ((Number.isFinite(width) && width <= 2) || (Number.isFinite(height) && height <= 2) || /display\s*:\s*none/.test(style)) continue;
    seen.add(src);
    images.push({ src, alt: attribute(tag, "alt").slice(0, 300) || "Email image" });
    if (images.length === 20) break;
  }
  return images;
}

export function remoteImagesFromText(text: string): Array<{ src: string; alt: string }> {
  const images: Array<{ src: string; alt: string }> = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/View image:\s*\((https?:\/\/[^)\s]+)\)/gi)) {
    const src = decodeHtmlEntities(match[1]);
    if (seen.has(src)) continue;
    seen.add(src);
    images.push({ src, alt: "Email image" });
    if (images.length === 20) break;
  }
  return images;
}

function uniqueImages(images: Array<{ src: string; alt: string }>): Array<{ src: string; alt: string }> {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.src)) return false;
    seen.add(image.src);
    return true;
  }).slice(0, 20);
}

export function sanitizeEmailHtml(html: string): string {
  const cleaned = html
    .replace(/<(script|iframe|object|embed|applet|form|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(meta|base|link|input|button|textarea|select|option)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|action)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[\s\S]*?\2/gi, ' $1="#"');
  const frameHead = `<base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:#fff;overflow-wrap:anywhere}img{max-width:100%!important;height:auto!important}</style>`;
  if (/<head\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<head\b[^>]*>/i, (head) => `${head}${frameHead}`);
  return `<!doctype html><html><head>${frameHead}</head><body>${cleaned}</body></html>`;
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
  const images = uniqueImages([
    ...remoteImagesFromPart(latest.payload),
    ...body.flatMap(remoteImagesFromText),
  ]);
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
    images,
    threadId: thread.id,
  };
}

export function summarizeDetailedThread(thread: GmailThread) {
  const summary = summarizeThread(thread);
  const latest = thread.messages?.at(-1);
  const rawHtml = htmlFromPart(latest?.payload);
  return { ...summary, html: rawHtml ? sanitizeEmailHtml(rawHtml) : undefined };
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
