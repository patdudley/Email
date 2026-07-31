"use client";

import { useMemo, useState } from "react";

type Mail = {
  id: number;
  sender: string;
  email: string;
  initials: string;
  color: string;
  subject: string;
  preview: string;
  time: string;
  date: string;
  unread?: boolean;
  starred?: boolean;
  label?: string;
  body: string[];
  attachment?: string;
  resolve?: {
    kind: string;
    status: string;
    goal: string;
    amount?: string;
    deadline?: string;
    next: string;
    automation: string;
    ready?: string;
  };
};

const mail: Mail[] = [
  {
    id: 1, sender: "Priya Shah", email: "priya.shah@pacificadjusters.com", initials: "PS", color: "lavender",
    subject: "Re: Claim #PA-28491 — final documentation", preview: "Thanks for sending the repair estimate. To complete our review, please reply with the final paid invoice…", time: "10:42 AM", date: "Today, 10:42 AM", unread: true, starred: true, label: "Insurance",
    body: ["Hi Pat,", "Thanks for sending the repair estimate. To complete our review, please reply with the final paid invoice no later than August 12.", "Once we receive it, reimbursement of up to $2,150 will be issued within 7–10 business days.", "Best,\nPriya Shah\nClaims Adjuster"],
    attachment: "Repair estimate.pdf",
    resolve: { kind: "Insurance claim", status: "Ready for approval", goal: "Receive reimbursement for vehicle repairs", amount: "$2,150", deadline: "Aug 12", next: "Send the final invoice and ask Priya to confirm receipt", automation: "If Priya does not reply within 4 days, prepare a follow-up.", ready: "I found Final repair invoice.pdf in your email from Caliber Collision and attached it to a drafted reply." },
  },
  {
    id: 2, sender: "West Elm", email: "support@westelm.com", initials: "WE", color: "sand",
    subject: "Your return label is ready", preview: "Your prepaid UPS return label for order #WE938104 is attached. Please ship your item by August 3…", time: "9:18 AM", date: "Today, 9:18 AM", unread: true, label: "Returns",
    body: ["Hi Pat,", "Your prepaid UPS return label for order #WE938104 is attached. Please ship your damaged item by August 3 to remain eligible for a full refund of $429.", "We’ll email you once your return is received."], attachment: "UPS return label.pdf",
    resolve: { kind: "Product return", status: "Needs your action", goal: "Receive a full refund for the damaged side table", amount: "$429", deadline: "Aug 3", next: "Drop the package at UPS within 3 days", automation: "Track the package and keep this open until the $429 refund arrives.", ready: "I found a UPS Store 0.8 miles away. I can add a 20-minute drop-off block tomorrow at 9:30 AM." },
  },
  {
    id: 3, sender: "Marcus at Acme Supply", email: "marcus@acmesupply.co", initials: "MA", color: "sky",
    subject: "Re: Duplicate charge on invoice #1048", preview: "I’m looking into this with our accounts receivable team and should have an update for you shortly…", time: "Yesterday", date: "Yesterday, 3:56 PM", starred: true, label: "Vendors",
    body: ["Hi Pat,", "I’m looking into this with our accounts receivable team and should have an update for you shortly. I agree that the $680 equipment line appears twice.", "I’ll circle back as soon as I have approval for the credit.", "Marcus"],
    resolve: { kind: "Billing dispute", status: "Follow-up due", goal: "Recover the duplicate vendor charge", amount: "$680", next: "Follow up today — the promised update is 3 days overdue", automation: "Monitor for a credit memo and verify it against the next statement.", ready: "A concise follow-up is drafted. It references the duplicate line and Marcus’s promised update." },
  },
  {
    id: 4, sender: "HealthCo Claims", email: "claims@healthco.com", initials: "HC", color: "mint",
    subject: "Claim HC-77120 received", preview: "We received your out-of-network dental reimbursement claim. Most claims are processed within 14 days…", time: "Mon", date: "Monday, 11:12 AM", label: "Health",
    body: ["We received your out-of-network dental reimbursement claim HC-77120.", "Most claims are processed within 14 calendar days. We will contact you if additional documentation is required.", "You can reply to this message with questions."],
    resolve: { kind: "Reimbursement", status: "Waiting on someone", goal: "Receive dental reimbursement", amount: "$312", deadline: "Aug 21", next: "Wait for the explanation of benefits", automation: "If there is no update by August 7, draft a status request." },
  },
  {
    id: 5, sender: "Maya Chen", email: "maya@northstarstudio.com", initials: "MC", color: "rose",
    subject: "Updated launch timeline", preview: "I moved the review milestone to Tuesday and added your notes to the project brief. Can you confirm…", time: "Mon", date: "Monday, 8:34 AM", unread: true,
    body: ["Hey Pat,", "I moved the review milestone to Tuesday and added your notes to the project brief. Can you confirm that 2 PM still works for the stakeholder review?", "Thanks!\nMaya"],
    resolve: { kind: "Meeting request", status: "Needs your action", goal: "Confirm the stakeholder review", deadline: "Aug 4", next: "Confirm Tuesday at 2 PM", automation: "Add the meeting to your calendar after the time is confirmed.", ready: "I checked your calendar. Tuesday at 2 PM is open, and a short confirmation reply is ready." },
  },
  {
    id: 6, sender: "Figma", email: "billing@figma.com", initials: "F", color: "peach",
    subject: "Your receipt for July", preview: "Thanks for your payment. Your July receipt is ready to download…", time: "Sun", date: "Sunday, 6:03 AM",
    body: ["Thanks for your payment.", "Your July receipt for $45.00 is attached and ready to download."], attachment: "Figma July receipt.pdf",
  },
  {
    id: 7, sender: "Nora Williams", email: "nora@brightlinelegal.com", initials: "NW", color: "slate",
    subject: "Contract renewal notes", preview: "Attached are the redlines we discussed. The indemnification language is the only remaining issue…", time: "Fri", date: "Friday, 4:28 PM", label: "Legal",
    body: ["Hi Pat,", "Attached are the redlines we discussed. The indemnification language is the only remaining issue. Please send any final comments before our call next Wednesday.", "Best,\nNora"], attachment: "Renewal agreement — redline.docx",
    resolve: { kind: "Contract review", status: "Needs your action", goal: "Complete vendor contract renewal", deadline: "Aug 5", next: "Review the indemnification redlines before Wednesday", automation: "Remind you Monday morning if the document is still unreviewed." },
  },
];

const folders = [
  ["▰", "Inbox", "3"], ["☆", "Starred", ""], ["◷", "Snoozed", ""], ["➤", "Sent", ""], ["▱", "Drafts", "2"],
];

export default function Home() {
  const [selectedId, setSelectedId] = useState(1);
  const [folder, setFolder] = useState("Inbox");
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState(false);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState<number[]>([]);
  const [approved, setApproved] = useState<number[]>([]);
  const [taskDone, setTaskDone] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const [rightTab, setRightTab] = useState<"work" | "activity">("work");
  const [mobileReader, setMobileReader] = useState(false);

  const messages = useMemo(() => {
    let list = folder === "Starred" ? mail.filter((item) => item.starred) : folder === "Tasks" ? mail.filter((item) => item.resolve) : mail;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => `${item.sender} ${item.subject} ${item.preview}`.toLowerCase().includes(q));
    }
    return list;
  }, [folder, search]);
  const selected = mail.find((item) => item.id === selectedId) ?? mail[0];

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function sendReply() {
    if (!reply.trim()) return;
    setSent((current) => [...current, selected.id]);
    setReply("");
    setReplying(false);
    notify("Reply sent through your Gmail account");
  }

  function chooseMessage(id: number) {
    setSelectedId(id);
    setReplying(false);
    setRightTab("work");
    setMobileReader(true);
  }

  return (
    <main className="mail-app">
      <aside className="mail-nav">
        <div className="mail-brand"><span>R</span><strong>Resolve</strong></div>
        <button className="compose-button" onClick={() => setCompose(true)}><b>＋</b> Compose</button>
        <nav aria-label="Mailbox folders">
          {folders.map(([icon, name, count]) => <button key={name} className={folder === name ? "active" : ""} onClick={() => setFolder(name)}><span>{icon}</span>{name}{count && <b>{count}</b>}</button>)}
        </nav>
        <div className="nav-rule" />
        <p className="nav-title">RESOLVE</p>
        <nav aria-label="Resolve views">
          <button className={folder === "Tasks" ? "active" : ""} onClick={() => setFolder("Tasks")}><span>✓</span>Tasks<b>6</b></button>
          <button onClick={() => notify("5 prepared actions are ready for review")}><span>✦</span>AI approvals<b className="violet-count">5</b></button>
          <button onClick={() => notify("Automation center opened")}><span>↻</span>Automations</button>
          <button onClick={() => notify("Work dashboard opened")}><span>▦</span>Work dashboard</button>
        </nav>
        <div className="nav-rule" />
        <p className="nav-title">LABELS <button aria-label="Add label">＋</button></p>
        <nav className="labels">
          <button><i className="label-dot green" />Finance</button><button><i className="label-dot purple" />Insurance</button><button><i className="label-dot orange" />Returns</button><button><i className="label-dot blue" />Vendors</button>
        </nav>
        <div className="gmail-status"><span className="gmail-m">M</span><div><strong>pat@gmail.com</strong><small>Gmail connected</small></div><i>✓</i></div>
        <div className="user-row"><span>PD</span><div><strong>Pat Dudley</strong><small>Pro workspace</small></div><button>•••</button></div>
      </aside>

      <section className="mail-center">
        <header className="mail-topbar">
          <button className="mobile-menu" aria-label="Menu">☰</button>
          <label className="mail-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail, people, or tasks" aria-label="Search email" /><kbd>⌘ K</kbd></label>
          <button className="top-icon" aria-label="Ask Resolve" onClick={() => notify("Ask Resolve is ready")}>✦</button>
          <button className="top-icon" aria-label="Settings">⚙</button>
          <span className="top-avatar">PD</span>
        </header>

        <div className={`mail-columns ${mobileReader ? "show-reader" : ""}`}>
          <section className="thread-list">
            <header className="list-header"><div><h1>{folder}</h1><span>{messages.length} conversations</span></div><button aria-label="More inbox options">•••</button></header>
            <div className="list-tools"><button aria-label="Select all">□⌄</button><button onClick={() => notify("Inbox refreshed")} aria-label="Refresh">↻</button><div /><button aria-label="Previous page">‹</button><span>1–{messages.length}</span><button aria-label="Next page">›</button></div>
            <div className="quick-summary"><span>✦</span><p><b>3 things need you today.</b> $3,259 is at stake across your inbox.</p><button onClick={() => setFolder("Tasks")}>View work</button></div>
            <div className="message-scroll">
              {messages.map((item) => (
                <article key={item.id} className={`message-row ${selected.id === item.id ? "selected" : ""} ${item.unread ? "unread" : ""}`} onClick={() => chooseMessage(item.id)}>
                  <button aria-label={`Select message from ${item.sender}`} onClick={(e) => e.stopPropagation()}>□</button>
                  <button className={item.starred ? "star on" : "star"} aria-label="Star message" onClick={(e) => { e.stopPropagation(); notify(item.starred ? "Removed from starred" : "Added to starred"); }}>★</button>
                  <span className={`sender-avatar ${item.color}`}>{item.initials}</span>
                  <div className="message-info"><div><strong>{item.sender}</strong><time>{item.time}</time></div><h2>{item.subject}</h2><p>{item.preview}</p><div className="row-meta">{item.resolve && <span className="task-chip">✓ Task detected</span>}{item.label && <span>{item.label}</span>}{item.attachment && <span>⌕ 1 attachment</span>}</div></div>
                </article>
              ))}
              {messages.length === 0 && <div className="empty-state"><span>⌕</span><h2>No messages found</h2><p>Try a different person, subject, or task.</p></div>}
            </div>
          </section>

          <section className="reader">
            <header className="reader-tools"><button aria-label="Back" onClick={() => setMobileReader(false)}>←</button><button onClick={() => notify("Conversation archived")} aria-label="Archive">▣</button><button onClick={() => notify("Conversation marked as spam")} aria-label="Report spam">!</button><button onClick={() => notify("Conversation moved to trash")} aria-label="Delete">♲</button><i /><button onClick={() => notify("Conversation snoozed until tomorrow")} aria-label="Snooze">◷</button><button aria-label="Add to tasks" onClick={() => notify("Added to Tasks")}>✓</button><button aria-label="Move">▤</button><button aria-label="More">•••</button></header>
            <div className="reader-content">
              <div className="subject-line"><h1>{selected.subject}</h1>{selected.label && <span>{selected.label}</span>}<button aria-label="Print">⌘</button><button aria-label="Open in new window">↗</button></div>
              <div className="sender-line"><span className={`sender-avatar large ${selected.color}`}>{selected.initials}</span><div><strong>{selected.sender}</strong><p>to me <button>⌄</button></p></div><time>{selected.date}</time><button aria-label="Star">{selected.starred ? "★" : "☆"}</button><button aria-label="Reply">↩</button><button aria-label="More">•••</button></div>
              <div className="message-body">
                {selected.body.map((paragraph, index) => <p key={index}>{paragraph.split("\n").map((line, i) => <span key={i}>{line}{i < paragraph.split("\n").length - 1 && <br />}</span>)}</p>)}
              </div>
              {selected.attachment && <button className="attachment" onClick={() => notify(`${selected.attachment} opened`)}><span>PDF</span><div><strong>{selected.attachment}</strong><small>248 KB</small></div><b>↓</b></button>}
              {sent.includes(selected.id) && <div className="sent-note"><span>✓</span><div><b>You replied</b><p>Your message was sent through Gmail and added to this thread.</p></div></div>}
              {!replying ? <div className="reply-actions"><button onClick={() => setReplying(true)}>↩ Reply</button><button onClick={() => setReplying(true)}>↪ Forward</button><button className="ai-reply" onClick={() => { setReply(selected.resolve?.ready ? "Hi " + selected.sender.split(" ")[0] + ",\n\nThanks for the note. I’ve attached the requested document. Please confirm once it’s received and let me know the expected timeline for completion.\n\nBest,\nPat" : "Thanks for the update. That works for me.\n\nBest,\nPat"); setReplying(true); }}>✦ Draft with Resolve</button></div> : <div className="inline-reply"><div>To: <b>{selected.sender}</b></div><textarea autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" /><footer><button className="send-button" onClick={sendReply}>Send <span>⌄</span></button><button>Ａ</button><button>⌕</button><button>🔗</button><i /><button onClick={() => { setReplying(false); setReply(""); }}>♲</button></footer></div>}
            </div>
          </section>
        </div>
      </section>

      <aside className="resolve-panel">
        <header><div><span>✦</span><strong>Resolve</strong></div><button aria-label="Close panel">×</button></header>
        <div className="panel-tabs"><button className={rightTab === "work" ? "active" : ""} onClick={() => setRightTab("work")}>Work</button><button className={rightTab === "activity" ? "active" : ""} onClick={() => setRightTab("activity")}>Activity</button></div>
        {rightTab === "work" ? <div className="panel-scroll">
          {selected.resolve ? <>
            <div className="detected"><span>✦</span><div><strong>Resolve found unfinished work</strong><p>Created from this email thread</p></div></div>
            <span className={`case-state ${selected.resolve.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.resolve.status}</span>
            <h2>{selected.resolve.kind}</h2>
            <p className="case-goal">{selected.resolve.goal}</p>
            <div className="case-stats">{selected.resolve.amount && <div><span>AMOUNT AT STAKE</span><strong>{selected.resolve.amount}</strong></div>}{selected.resolve.deadline && <div><span>DEADLINE</span><strong>{selected.resolve.deadline}</strong></div>}</div>
            <div className="next-step"><span className={taskDone.includes(selected.id) ? "checked" : ""} onClick={() => setTaskDone((current) => current.includes(selected.id) ? current.filter((id) => id !== selected.id) : [...current, selected.id])}>{taskDone.includes(selected.id) ? "✓" : ""}</span><div><small>NEXT ACTION</small><p>{selected.resolve.next}</p></div></div>
            {selected.resolve.ready && <section className="prepared"><header><span>✦</span><strong>Ready for you</strong></header><p>{approved.includes(selected.id) ? "Approved. Resolve is completing this action and will update the case." : selected.resolve.ready}</p>{approved.includes(selected.id) ? <div className="approved"><span>✓</span> Action approved</div> : <div className="prepared-actions"><button onClick={() => { setApproved((current) => [...current, selected.id]); notify("Action approved — Resolve is on it"); }}>Review & approve</button><button onClick={() => { setReply("Hi " + selected.sender.split(" ")[0] + ",\n\nThanks for the note. I’ve attached the requested document. Please confirm receipt and the next expected step.\n\nBest,\nPat"); setReplying(true); }}>Edit</button></div>}</section>}
            <section className="automation-card"><header><span>↻</span><strong>Automation running</strong><i /></header><p>{selected.resolve.automation}</p><button onClick={() => notify("Automation settings opened")}>Manage automation <span>→</span></button></section>
            <div className="thread-timeline"><p>CASE ACTIVITY</p><div><i className="done">✓</i><span><b>Email analyzed</b><small>Just now</small></span></div><div><i>✦</i><span><b>Next action prepared</b><small>Waiting for approval</small></span></div></div>
          </> : <div className="no-work"><span>✓</span><h2>Nothing to handle</h2><p>Resolve didn’t find an unresolved obligation in this message.</p><button onClick={() => notify("Manual task created")}>＋ Create a task</button></div>}
        </div> : <div className="activity-feed"><div><span>✦</span><p><b>Resolve analyzed this thread</b><small>Extracted the goal, deadline, and next action.</small></p></div>{selected.resolve && <div><span>↻</span><p><b>Monitoring enabled</b><small>{selected.resolve.automation}</small></p></div>}<div><span>•</span><p><b>Message received</b><small>{selected.date}</small></p></div></div>}
        <form className="panel-ask" onSubmit={(e) => { e.preventDefault(); notify("Resolve analyzed the full thread"); }}><input placeholder="Ask about this thread…" aria-label="Ask Resolve about this thread" /><button>↑</button></form>
      </aside>

      {compose && <div className="compose-window"><header><strong>New message</strong><div><button>−</button><button>□</button><button onClick={() => setCompose(false)}>×</button></div></header><label>To <input autoFocus /></label><label>Subject <input /></label><textarea placeholder="Write your message…" /><footer><button className="send-button" onClick={() => { setCompose(false); notify("Message sent through your Gmail account"); }}>Send <span>⌄</span></button><button>Ａ</button><button>⌕</button><button>🔗</button><button>✦</button><i /><button onClick={() => setCompose(false)}>♲</button></footer></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
