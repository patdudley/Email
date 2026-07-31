"use client";

import { useMemo, useState } from "react";

type CaseStatus = "Needs your action" | "Ready for approval" | "Waiting on someone" | "Follow-up due";

type CaseItem = {
  id: number;
  title: string;
  category: string;
  goal: string;
  status: CaseStatus;
  amount?: number;
  deadline?: string;
  lastAction: string;
  nextAction: string;
  missing?: string;
  initials: string;
  accent: string;
  aiAction: string;
};

const cases: CaseItem[] = [
  {
    id: 1,
    title: "Auto insurance claim",
    category: "Insurance",
    goal: "Receive reimbursement for vehicle repairs",
    status: "Ready for approval",
    amount: 2150,
    deadline: "Aug 12",
    lastAction: "Repair estimate sent July 27",
    nextAction: "Send final invoice and request confirmation",
    missing: "Final repair invoice",
    initials: "PA",
    accent: "violet",
    aiAction: "Invoice found. Reply drafted with the document attached.",
  },
  {
    id: 2,
    title: "West Elm return",
    category: "Return",
    goal: "Return damaged side table for a full refund",
    status: "Needs your action",
    amount: 429,
    deadline: "Aug 3",
    lastAction: "Return label received yesterday",
    nextAction: "Drop package at UPS before the return window closes",
    initials: "WE",
    accent: "orange",
    aiAction: "Nearest UPS location found. Add the drop-off to your calendar.",
  },
  {
    id: 3,
    title: "Acme vendor overcharge",
    category: "Billing",
    goal: "Correct duplicate line item on invoice #1048",
    status: "Follow-up due",
    amount: 680,
    lastAction: "Dispute sent 8 days ago",
    nextAction: "Follow up with accounts receivable today",
    initials: "AC",
    accent: "blue",
    aiAction: "Polite escalation drafted using the original invoice details.",
  },
  {
    id: 4,
    title: "Dental reimbursement",
    category: "Reimbursement",
    goal: "Receive out-of-network reimbursement",
    status: "Waiting on someone",
    amount: 312,
    deadline: "Aug 21",
    lastAction: "Claim form received by insurer July 24",
    nextAction: "Monitor for explanation of benefits",
    initials: "HC",
    accent: "green",
    aiAction: "Monitoring the thread. Follow-up is scheduled for August 7.",
  },
];

const filters = ["All open", "Needs your action", "Ready for approval", "Waiting on someone", "Follow-up due"];

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export default function Home() {
  const [filter, setFilter] = useState("All open");
  const [selected, setSelected] = useState<CaseItem | null>(null);
  const [query, setQuery] = useState("");
  const [assistantReply, setAssistantReply] = useState("I can find deadlines, prepare follow-ups, or show you the quickest wins.");
  const [approved, setApproved] = useState<number[]>([]);
  const [toast, setToast] = useState("");

  const visibleCases = useMemo(
    () => filter === "All open" ? cases : cases.filter((item) => item.status === filter),
    [filter],
  );

  function runAssistant(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const lower = query.toLowerCase();
    if (lower.includes("refund") || lower.includes("money")) {
      setAssistantReply("You have $3,571 at stake across 4 open cases. The $680 Acme overcharge is the most overdue; I can send its follow-up after you approve it.");
    } else if (lower.includes("quick") || lower.includes("five")) {
      setAssistantReply("Two quick wins: approve the insurance reply, then add the West Elm drop-off to your calendar. Both are ready now.");
    } else if (lower.includes("waiting")) {
      setAssistantReply("The dental reimbursement is waiting on HealthCo. I’m monitoring it and will prepare a follow-up if there’s no response by August 7.");
    } else {
      setAssistantReply("I found 4 related open cases. The insurance deadline is the highest-value priority, and the Acme follow-up is already overdue.");
    }
    setQuery("");
  }

  function approve(item: CaseItem) {
    setApproved((current) => [...current, item.id]);
    setToast(`Approved: ${item.title}`);
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R</span><span>Resolve</span></div>
        <button className="new-case" onClick={() => setToast("New case intake opened")}>＋ <span>New case</span></button>
        <nav aria-label="Primary navigation">
          <button className="nav-item active"><span>⌂</span> Command center</button>
          <button className="nav-item"><span>▤</span> All cases <b>12</b></button>
          <button className="nav-item"><span>✓</span> AI approvals <b className="hot">5</b></button>
          <button className="nav-item"><span>◷</span> Waiting on <b>4</b></button>
          <button className="nav-item"><span>◇</span> Resolved</button>
        </nav>
        <div className="sidebar-section">
          <p>SMART VIEWS</p>
          <button className="nav-item"><span className="dot coral" /> Money at risk</button>
          <button className="nav-item"><span className="dot yellow" /> Deadlines this week</button>
          <button className="nav-item"><span className="dot blue-dot" /> Quick wins</button>
        </div>
        <div className="inbox-card">
          <div className="gmail">M</div>
          <div><strong>pat@gmail.com</strong><span>Synced 2 min ago</span></div>
          <i>✓</i>
        </div>
        <div className="profile"><div className="avatar">PD</div><div><strong>Pat Dudley</strong><span>Pro plan</span></div><button>•••</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">R</span> Resolve</div>
          <label className="search"><span>⌕</span><input aria-label="Search cases" placeholder="Search cases, emails, or documents" /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><button aria-label="Help">?</button><button aria-label="Notifications">♧<span /></button></div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div><p className="eyebrow">FRIDAY, JULY 31</p><h1>Good morning, Pat.</h1><p>Here’s what needs attention across your inbox.</p></div>
            <button className="ask-ai" onClick={() => document.getElementById("assistant-input")?.focus()}><span>✦</span> Ask Resolve</button>
          </div>

          <section className="summary-grid" aria-label="Open work summary">
            <article><span className="metric-icon recover">$</span><div><p>Money recoverable</p><strong>$3,571</strong><small>across 4 cases</small></div><em>↑ $680</em></article>
            <article><span className="metric-icon reply">↗</span><div><p>Waiting on replies</p><strong>4</strong><small>2 overdue</small></div></article>
            <article><span className="metric-icon deadline">◷</span><div><p>Deadlines this week</p><strong>2</strong><small>Next: Aug 3</small></div><em className="warning">3 days</em></article>
            <article><span className="metric-icon sparkle">✦</span><div><p>Ready for approval</p><strong>5</strong><small>AI actions prepared</small></div><button onClick={() => setFilter("Ready for approval")}>Review</button></article>
          </section>

          <section className="briefing">
            <div className="brief-icon">✦</div>
            <div><div className="brief-title"><strong>Your daily briefing</strong><span>AI GENERATED</span></div><p>Your <b>insurance claim</b> needs one document before August 12. The <b>West Elm return</b> closes in 3 days, and Acme still hasn’t answered your $680 billing dispute.</p></div>
            <button onClick={() => setToast("Briefing marked as reviewed")}>Review priorities <span>→</span></button>
          </section>

          <div className="cases-heading"><div><h2>Open cases</h2><span>12 matters in progress</span></div><div className="view-toggle"><button className="active" aria-label="Card view">▦</button><button aria-label="List view">☷</button></div></div>
          <div className="filters" role="tablist" aria-label="Filter cases">
            {filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}{item === "All open" && <span>12</span>}</button>)}
          </div>

          <section className="case-grid">
            {visibleCases.map((item) => (
              <article className="case-card" key={item.id} onClick={() => setSelected(item)}>
                <div className="case-top"><div className={`case-avatar ${item.accent}`}>{item.initials}</div><div><span className={`status ${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</span><h3>{item.title}</h3><p>{item.goal}</p></div><button aria-label={`More options for ${item.title}`} onClick={(e) => e.stopPropagation()}>•••</button></div>
                <div className="case-facts">
                  {item.amount && <div><span>AMOUNT AT STAKE</span><strong>{money(item.amount)}</strong></div>}
                  {item.deadline && <div><span>DEADLINE</span><strong>{item.deadline}</strong></div>}
                </div>
                <div className="next-action"><span>Next action</span><p>{item.nextAction}</p></div>
                <div className="ai-ready"><span>✦</span><p>{approved.includes(item.id) ? "Action approved — Resolve is handling it." : item.aiAction}</p>{!approved.includes(item.id) && item.status !== "Waiting on someone" && <button onClick={(e) => { e.stopPropagation(); approve(item); }}>Approve</button>}</div>
                <footer><span>{item.category}</span><button>Open case <b>→</b></button></footer>
              </article>
            ))}
          </section>
        </div>
      </section>

      <aside className="assistant-panel">
        <div className="assistant-head"><div><span>✦</span><div><strong>Resolve assistant</strong><small><i /> Ready to help</small></div></div><button onClick={() => setAssistantReply("I can find deadlines, prepare follow-ups, or show you the quickest wins.")}>↻</button></div>
        <div className="assistant-body">
          <div className="ai-message"><span>✦</span><div><p>{assistantReply}</p></div></div>
          <p className="prompt-label">TRY ASKING</p>
          {["What am I waiting on?", "Which issues can I finish in 5 minutes?", "Show me money I can recover"].map((prompt) => <button className="suggestion" key={prompt} onClick={() => { setQuery(prompt); window.setTimeout(() => document.getElementById("assistant-input")?.focus(), 0); }}>{prompt}<span>↗</span></button>)}
        </div>
        <form className="assistant-input" onSubmit={runAssistant}><textarea id="assistant-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask about your open work…" rows={2} /><div><button type="button" aria-label="Attach document">＋</button><span>Resolve can make mistakes</span><button className="send" type="submit" aria-label="Send">↑</button></div></form>
      </aside>

      {selected && <div className="drawer-backdrop" onClick={() => setSelected(null)}><aside className="case-drawer" onClick={(e) => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><span className={`status ${selected.status.toLowerCase().replaceAll(" ", "-")}`}>{selected.status}</span><h2>{selected.title}</h2><p className="drawer-goal">{selected.goal}</p><div className="drawer-amount"><span>Outcome at stake</span><strong>{selected.amount ? money(selected.amount) : "Resolution"}</strong></div><div className="timeline"><div><i className="done">✓</i><span><b>Last action</b>{selected.lastAction}</span></div><div><i>→</i><span><b>Next action</b>{selected.nextAction}</span></div>{selected.missing && <div><i>!</i><span><b>Missing item</b>{selected.missing}</span></div>}</div><section className="drawer-ai"><span>✦</span><div><b>Resolve is ready</b><p>{selected.aiAction}</p></div></section>{!approved.includes(selected.id) && selected.status !== "Waiting on someone" ? <button className="drawer-approve" onClick={() => approve(selected)}>Review & approve action</button> : <button className="drawer-approve complete">{approved.includes(selected.id) ? "Approved — action in progress" : "Monitoring this case"}</button>}</aside></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}
