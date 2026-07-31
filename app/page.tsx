"use client";

import { useMemo, useState } from "react";

type Work = { title:string; next:string; deadline?:string; instruction:string };
type Mail = { id:number; sender:string; email:string; initials:string; tone:string; subject:string; preview:string; time:string; date:string; unread?:boolean; body:string[]; attachment?:string; work?:Work };

const mail:Mail[]=[
  {id:1,sender:"Priya Shah",email:"priya.shah@pacificadjusters.com",initials:"PS",tone:"lilac",subject:"Re: Claim #PA-28491 — final documentation",preview:"Thanks for sending the repair estimate. Please reply with the final paid invoice no later than August 12.",time:"10:42 AM",date:"Today, 10:42 AM",unread:true,attachment:"Repair estimate.pdf",body:["Hi Pat,","Thanks for sending the repair estimate. To complete our review, please reply with the final paid invoice no later than August 12.","Once we receive it, reimbursement of up to $2,150 will be issued within 7–10 business days.","Best,\nPriya"],work:{title:"Send final insurance documents",next:"Find and send the final paid invoice",deadline:"Aug 12",instruction:"Find the final paid invoice, attach it to a concise reply, and monitor this thread until the $2,150 reimbursement is received."}},
  {id:2,sender:"West Elm",email:"support@westelm.com",initials:"WE",tone:"sand",subject:"Your return label is ready",preview:"Your prepaid UPS return label is attached. Please ship your damaged item by August 3.",time:"9:18 AM",date:"Today, 9:18 AM",unread:true,attachment:"UPS return label.pdf",body:["Hi Pat,","Your prepaid UPS return label for order #WE938104 is attached. Please ship your damaged item by August 3 to remain eligible for a full refund of $429.","We’ll email you once your return is received."],work:{title:"Ship West Elm return",next:"Drop the package at UPS",deadline:"Aug 3",instruction:"Keep the label and order details attached, remind me to ship the item, then monitor this thread until the $429 refund arrives."}},
  {id:3,sender:"Marcus at Acme Supply",email:"marcus@acmesupply.co",initials:"MA",tone:"blue",subject:"Re: Duplicate charge on invoice #1048",preview:"I’m looking into this with accounts receivable and should have an update shortly.",time:"Yesterday",date:"Yesterday, 3:56 PM",body:["Hi Pat,","I’m looking into this with our accounts receivable team. I agree that the $680 equipment line appears twice.","I’ll circle back as soon as I have approval for the credit.","Marcus"],work:{title:"Follow up on duplicate charge",next:"Ask Marcus for the overdue update",instruction:"Draft a friendly but firm follow-up referencing invoice #1048. Keep this open until the $680 credit is verified."}},
  {id:4,sender:"HealthCo Claims",email:"claims@healthco.com",initials:"HC",tone:"mint",subject:"Claim HC-77120 received",preview:"We received your dental reimbursement claim. Most claims are processed within 14 days.",time:"Mon",date:"Monday, 11:12 AM",body:["We received your out-of-network dental reimbursement claim HC-77120.","Most claims are processed within 14 calendar days. We will contact you if more documentation is required."],work:{title:"Track dental reimbursement",next:"Wait for the explanation of benefits",deadline:"Aug 21",instruction:"Monitor this claim. If there is no update by August 7, prepare a short status request."}},
  {id:5,sender:"Maya Chen",email:"maya@northstarstudio.com",initials:"MC",tone:"rose",subject:"Updated launch timeline",preview:"Can you confirm that Tuesday at 2 PM still works for the stakeholder review?",time:"Mon",date:"Monday, 8:34 AM",unread:true,body:["Hey Pat,","I moved the review milestone to Tuesday. Can you confirm that 2 PM still works for the stakeholder review?","Thanks!\nMaya"],work:{title:"Confirm stakeholder review",next:"Reply to confirm Tuesday at 2 PM",deadline:"Aug 4",instruction:"Check my calendar, draft a confirmation, and add the event after Maya replies."}},
  {id:6,sender:"Figma",email:"billing@figma.com",initials:"F",tone:"peach",subject:"Your receipt for July",preview:"Your July receipt for $45.00 is attached and ready to download.",time:"Sun",date:"Sunday, 6:03 AM",attachment:"Figma July receipt.pdf",body:["Thanks for your payment.","Your July receipt for $45.00 is attached and ready to download."]},
];

function suggestedWork(message:Mail):Work{return message.work??{title:message.subject,next:"Review this email",instruction:`Use the full email from ${message.sender} as context. Help me decide and complete the next action, but ask before sending anything.`}}

export default function Home(){
  const [view,setView]=useState<"mail"|"tasks">("mail");
  const [folder,setFolder]=useState("Inbox");
  const [openId,setOpenId]=useState<number|null>(null);
  const [converted,setConverted]=useState<number[]>([1,2,3]);
  const [taskId,setTaskId]=useState(1);
  const [search,setSearch]=useState("");
  const [compose,setCompose]=useState(false);
  const [replying,setReplying]=useState(false);
  const [reply,setReply]=useState("");
  const [contexts,setContexts]=useState<Record<number,string>>({});
  const [prompt,setPrompt]=useState("");
  const [toast,setToast]=useState("");
  const list=useMemo(()=>{const q=search.toLowerCase();return q?mail.filter(m=>`${m.sender} ${m.subject} ${m.preview}`.toLowerCase().includes(q)):mail},[search]);
  const opened=mail.find(m=>m.id===openId);
  const tasks=mail.filter(m=>converted.includes(m.id));
  const task=mail.find(m=>m.id===taskId)??tasks[0];
  const work=suggestedWork(task);
  function notify(text:string){setToast(text);window.setTimeout(()=>setToast(""),2300)}
  function convert(message:Mail){if(!converted.includes(message.id))setConverted(v=>[message.id,...v]);setTaskId(message.id);setView("tasks");setOpenId(null);notify("Task created with this email as context")}

  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><span>R</span><b>Resolve</b></div>
      <button className="compose" onClick={()=>setCompose(true)}>＋ <span>Compose</span></button>
      <nav><button className={view==="mail"&&folder==="Inbox"?"active":""} onClick={()=>{setView("mail");setFolder("Inbox");setOpenId(null)}}><span>▰</span>Inbox<b>3</b></button><button onClick={()=>{setView("mail");setFolder("Sent");setOpenId(null)}}><span>➤</span>Sent</button><button onClick={()=>{setView("mail");setFolder("Drafts");setOpenId(null)}}><span>▱</span>Drafts<b>2</b></button></nav>
      <div className="account"><span>M</span><div><b>pat@gmail.com</b><small>Connected</small></div><i>✓</i></div>
    </aside>

    <section className="main">
      <header className="topbar">
        <div className="mobile-logo">R</div>
        <div className="tabs"><button className={view==="mail"?"active":""} onClick={()=>{setView("mail");setOpenId(null)}}>Mail</button><button className={view==="tasks"?"active":""} onClick={()=>{setView("tasks");setOpenId(null)}}>Tasks <span>{tasks.length}</span></button></div>
        <label><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={view==="mail"?"Search mail":"Search tasks"}/></label>
        <button className="avatar">PD</button>
      </header>

      {view==="mail"&&!opened&&<section className="inbox">
        <header className="inbox-head"><div><h1>{folder}</h1><p>{list.length} conversations</p></div><button onClick={()=>notify("Inbox refreshed")}>↻</button></header>
        <div className="mail-tools"><button>□⌄</button><button>↻</button><span/><small>1–{list.length}</small><button>‹</button><button>›</button></div>
        <div className="mail-list">{list.map(m=><article key={m.id} className={m.unread?"unread":""} onClick={()=>setOpenId(m.id)}><button onClick={e=>e.stopPropagation()}>□</button><span className={`initials ${m.tone}`}>{m.initials}</span><b>{m.sender}</b><div><strong>{m.subject}</strong><span> — {m.preview}</span></div>{converted.includes(m.id)&&<em>Task</em>}<time>{m.time}</time></article>)}</div>
      </section>}

      {view==="mail"&&opened&&<section className="reader">
        <div className="reader-tools"><button onClick={()=>{setOpenId(null);setReplying(false)}}>←</button><button>▣</button><button>♲</button><button>◷</button><span/><button className="task-button" onClick={()=>convert(opened)}>{converted.includes(opened.id)?"Open task":"＋ Add to tasks"}</button></div>
        <div className="message">
          <h1>{opened.subject}</h1>
          <div className="sender"><span className={`initials ${opened.tone}`}>{opened.initials}</span><div><b>{opened.sender}</b><p>{opened.email} · to me</p></div><time>{opened.date}</time></div>
          <div className="copy">{opened.body.map((p,i)=><p key={i}>{p.split("\n").map((line,j)=><span key={j}>{line}{j<p.split("\n").length-1&&<br/>}</span>)}</p>)}</div>
          {opened.attachment&&<button className="attachment"><span>PDF</span><div><b>{opened.attachment}</b><small>248 KB</small></div><strong>↓</strong></button>}
          {!replying?<div className="reply-actions"><button onClick={()=>setReplying(true)}>↩ Reply</button><button onClick={()=>{setReply(`Hi ${opened.sender.split(" ")[0]},\n\nThanks for the update. I’ll take care of this and follow up shortly.\n\nBest,\nPat`);setReplying(true)}}>✦ Draft reply</button></div>:<div className="reply-box"><div>To <b>{opened.sender}</b></div><textarea autoFocus value={reply} onChange={e=>setReply(e.target.value)}/><footer><button className="send" onClick={()=>{setReplying(false);setReply("");notify("Reply sent")}}>Send</button><span/><button onClick={()=>setReplying(false)}>Delete</button></footer></div>}
        </div>
      </section>}

      {view==="tasks"&&<section className="tasks">
        <div className="task-list"><header><h1>Tasks</h1><button onClick={()=>notify("New blank task created")}>＋</button></header>{tasks.map(m=>{const w=suggestedWork(m);return <article key={m.id} className={task.id===m.id?"active":""} onClick={()=>setTaskId(m.id)}><button>□</button><div><h2>{w.title}</h2><p>{w.next}</p><footer><span className={`initials tiny ${m.tone}`}>{m.initials}</span><span>{m.sender}</span>{w.deadline&&<time>{w.deadline}</time>}</footer></div></article>})}</div>
        <div className="task-page">
          <header><p>TASK</p><h1>{work.title}</h1><div className="task-source"><span className={`initials ${task.tone}`}>{task.initials}</span><div><b>{task.sender}</b><span>{task.subject}</span></div><button onClick={()=>{setView("mail");setOpenId(task.id)}}>Open email</button></div></header>
          <section className="task-body"><label>Next step</label><div className="next"><button>□</button><p>{work.next}</p>{work.deadline&&<time>{work.deadline}</time>}</div><label>Agent context</label><textarea value={contexts[task.id]??work.instruction} onChange={e=>setContexts(v=>({...v,[task.id]:e.target.value}))}/>{task.attachment&&<button className="context-file">▤ {task.attachment}</button>}
          <div className="agent"><header><span>✦</span><div><b>Resolve</b><small>Knows the email and context above</small></div></header><p>I can draft replies, find attachments, monitor the thread, and keep this task moving. I’ll ask before sending anything.</p><form onSubmit={e=>{e.preventDefault();if(prompt.trim()){notify("Instruction added");setPrompt("")}}}><input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Tell Resolve what to do…"/><button>↑</button></form></div></section>
        </div>
      </section>}
    </section>

    {compose&&<div className="compose-window"><header><b>New message</b><button onClick={()=>setCompose(false)}>×</button></header><label>To <input autoFocus/></label><label>Subject <input/></label><textarea/><footer><button onClick={()=>{setCompose(false);notify("Message sent")}}>Send</button></footer></div>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </main>
}
