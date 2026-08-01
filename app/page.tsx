"use client";

import { useEffect, useMemo, useState } from "react";

type Work = { title:string; next:string; deadline?:string; instruction:string };
type Mail = { id:string|number; threadId?:string; sender:string; email:string; initials:string; tone:string; subject:string; preview:string; time:string; date:string; unread?:boolean; starred?:boolean; body:string[]; attachment?:string; work?:Work };
type Account = {email:string;displayName:string;plan:"free"|"pro";subscriptionStatus:string|null;cancelAtPeriodEnd:boolean;currentPeriodEnd:number|null;usage:number;limit:number;hasBillingAccount:boolean};

const demoMail:Mail[]=[
  {id:1,sender:"Priya Shah",email:"priya.shah@pacificadjusters.com",initials:"PS",tone:"lilac",subject:"Re: Claim #PA-28491 — final documentation",preview:"Thanks for sending the repair estimate. Please reply with the final paid invoice no later than August 12.",time:"10:42 AM",date:"Today, 10:42 AM",unread:true,attachment:"Repair estimate.pdf",body:["Hi Pat,","Thanks for sending the repair estimate. To complete our review, please reply with the final paid invoice no later than August 12.","Once we receive it, reimbursement of up to $2,150 will be issued within 7–10 business days.","Best,\nPriya"],work:{title:"Send final insurance documents",next:"Find and send the final paid invoice",deadline:"Aug 12",instruction:"Find the final paid invoice, attach it to a concise reply, and monitor this thread until the $2,150 reimbursement is received."}},
  {id:2,sender:"West Elm",email:"support@westelm.com",initials:"WE",tone:"sand",subject:"Your return label is ready",preview:"Your prepaid UPS return label is attached. Please ship your damaged item by August 3.",time:"9:18 AM",date:"Today, 9:18 AM",unread:true,attachment:"UPS return label.pdf",body:["Hi Pat,","Your prepaid UPS return label for order #WE938104 is attached. Please ship your damaged item by August 3 to remain eligible for a full refund of $429.","We’ll email you once your return is received."],work:{title:"Ship West Elm return",next:"Drop the package at UPS",deadline:"Aug 3",instruction:"Keep the label and order details attached, remind me to ship the item, then monitor this thread until the $429 refund arrives."}},
  {id:3,sender:"Marcus at Acme Supply",email:"marcus@acmesupply.co",initials:"MA",tone:"blue",subject:"Re: Duplicate charge on invoice #1048",preview:"I’m looking into this with accounts receivable and should have an update shortly.",time:"Yesterday",date:"Yesterday, 3:56 PM",body:["Hi Pat,","I’m looking into this with our accounts receivable team. I agree that the $680 equipment line appears twice.","I’ll circle back as soon as I have approval for the credit.","Marcus"],work:{title:"Follow up on duplicate charge",next:"Ask Marcus for the overdue update",instruction:"Draft a friendly but firm follow-up referencing invoice #1048. Keep this open until the $680 credit is verified."}},
  {id:4,sender:"HealthCo Claims",email:"claims@healthco.com",initials:"HC",tone:"mint",subject:"Claim HC-77120 received",preview:"We received your dental reimbursement claim. Most claims are processed within 14 days.",time:"Mon",date:"Monday, 11:12 AM",body:["We received your out-of-network dental reimbursement claim HC-77120.","Most claims are processed within 14 calendar days. We will contact you if more documentation is required."],work:{title:"Track dental reimbursement",next:"Wait for the explanation of benefits",deadline:"Aug 21",instruction:"Monitor this claim. If there is no update by August 7, prepare a short status request."}},
  {id:5,sender:"Maya Chen",email:"maya@northstarstudio.com",initials:"MC",tone:"rose",subject:"Updated launch timeline",preview:"Can you confirm that Tuesday at 2 PM still works for the stakeholder review?",time:"Mon",date:"Monday, 8:34 AM",unread:true,body:["Hey Pat,","I moved the review milestone to Tuesday. Can you confirm that 2 PM still works for the stakeholder review?","Thanks!\nMaya"],work:{title:"Confirm stakeholder review",next:"Reply to confirm Tuesday at 2 PM",deadline:"Aug 4",instruction:"Check my calendar, draft a confirmation, and add the event after Maya replies."}},
  {id:6,sender:"Figma",email:"billing@figma.com",initials:"F",tone:"peach",subject:"Your receipt for July",preview:"Your July receipt for $45.00 is attached and ready to download.",time:"Sun",date:"Sunday, 6:03 AM",attachment:"Figma July receipt.pdf",body:["Thanks for your payment.","Your July receipt for $45.00 is attached and ready to download."]},
  {id:7,sender:"Fontainebleau Las Vegas",email:"reservations@fontainebleaulasvegas.com",initials:"FL",tone:"blue",subject:"Your Las Vegas stay is confirmed — confirmation FB19482",preview:"We look forward to welcoming you August 18–21. Check-in begins at 3:00 PM.",time:"Jul 22",date:"July 22, 2:14 PM",body:["Your stay is confirmed.","Fontainebleau Las Vegas\nAugust 18–21\nCheck-in: 3:00 PM\nCheck-out: 11:00 AM","Confirmation number: FB19482"]},
  {id:8,sender:"Delta Air Lines",email:"DeltaAirLines@t.delta.com",initials:"DL",tone:"lilac",subject:"Flight receipt and itinerary — Las Vegas",preview:"Los Angeles to Las Vegas on August 18. Return flight departs August 21.",time:"Jul 21",date:"July 21, 6:48 PM",body:["Your trip is confirmed.","Outbound · August 18\nDL 2127 · LAX 10:20 AM → LAS 11:34 AM","Return · August 21\nDL 1674 · LAS 6:45 PM → LAX 8:02 PM","Confirmation: G7K2LM"]},
];

const aiSummaries:Record<string,string>={
  1:"Insurance adjuster needs the final paid invoice by Aug 12 to release up to $2,150.",
  2:"Ship the damaged table by Aug 3 to remain eligible for the $429 refund.",
  3:"Vendor agrees the $680 charge is duplicated but has not yet issued the credit.",
  4:"Dental claim was received and should be processed within 14 days.",
  5:"Maya needs confirmation that Tuesday at 2 PM works for the review.",
  6:"July Figma receipt for $45; no response or follow-up needed.",
  7:"Vegas hotel: Fontainebleau, Aug 18–21; check-in starts at 3 PM.",
  8:"Vegas flights: depart LAX Aug 18 at 10:20 AM; return Aug 21 at 6:45 PM.",
};

function suggestedWork(message:Mail):Work{return message.work??{title:message.subject,next:"Review this email",instruction:`Use the full email from ${message.sender} as context. Help me decide and complete the next action, but ask before sending anything.`}}

export default function Home(){
  const [view,setView]=useState<"mail"|"tasks"|"connectors">("mail");
  const [folder,setFolder]=useState("Inbox");
  const [openId,setOpenId]=useState<string|number|null>(null);
  const [converted,setConverted]=useState<Array<string|number>>([1,2,3]);
  const [taskId,setTaskId]=useState<string|number>(1);
  const [search,setSearch]=useState("");
  const [compose,setCompose]=useState(false);
  const [replying,setReplying]=useState(false);
  const [replyMode,setReplyMode]=useState<"reply"|"replyAll"|"forward">("reply");
  const [reply,setReply]=useState("");
  const [forwardTo,setForwardTo]=useState("");
  const [composeTo,setComposeTo]=useState("");
  const [composeCc,setComposeCc]=useState("");
  const [composeSubject,setComposeSubject]=useState("");
  const [composeBody,setComposeBody]=useState("");
  const [showCc,setShowCc]=useState(false);
  const [contexts,setContexts]=useState<Record<string,string>>({});
  const [prompt,setPrompt]=useState("");
  const [toast,setToast]=useState("");
  const [answer,setAnswer]=useState<{text:string;ids:Array<string|number>}|null>(null);
  const [selected,setSelected]=useState<Array<string|number>>([]);
  const [starred,setStarred]=useState<Array<string|number>>([1,3,7]);
  const [unread,setUnread]=useState<Array<string|number>>(demoMail.filter(message=>message.unread).map(message=>message.id));
  const [customFolders,setCustomFolders]=useState<string[]>([]);
  const [manageFolders,setManageFolders]=useState(false);
  const [locations,setLocations]=useState<Record<string,string>>({6:"Archive"});
  const [accountOpen,setAccountOpen]=useState(false);
  const [account,setAccount]=useState<Account|null>(null);
  const [accountLoading,setAccountLoading]=useState(false);
  const [signInUrl,setSignInUrl]=useState("/signin-with-chatgpt?return_to=%2F");
  const [aiLoading,setAiLoading]=useState(false);
  const [gmail,setGmail]=useState<{connected:boolean;email:string|null}>({connected:false,email:null});
  const [liveMail,setLiveMail]=useState<Mail[]>([]);
  const [mailLoading,setMailLoading]=useState(false);
  const mail=gmail.connected?liveMail:demoMail;
  const list=useMemo(()=>{
    if(gmail.connected)return mail;
    if(folder==="Starred")return mail.filter(m=>starred.includes(m.id)&&!locations[m.id]);
    if(folder==="Snoozed")return mail.filter(m=>locations[m.id]==="Snoozed");
    if(["Archive","Spam","Trash"].includes(folder))return mail.filter(m=>locations[m.id]===folder);
    if(customFolders.includes(folder))return mail.filter(m=>locations[m.id]===folder);
    if(["Sent","Drafts"].includes(folder))return [];
    return mail.filter(m=>!locations[m.id]);
  },[folder,locations,customFolders,starred,gmail.connected,mail]);
  const opened=mail.find(m=>m.id===openId);
  const tasks=mail.filter(m=>converted.includes(m.id));
  const task=mail.find(m=>m.id===taskId)??tasks[0]??demoMail[0];
  const work=suggestedWork(task);
  useEffect(()=>{
    void loadAccount(false);
    void loadGoogleConnection();
    const gmailResult=new URLSearchParams(window.location.search).get("gmail");
    const message=gmailResult==="connected"
      ? "Gmail connected — loading your inbox"
      : gmailResult==="api-disabled"
        ? "Enable the Gmail API in Google Cloud, then connect again"
        : gmailResult==="offline-access"
          ? "Google did not provide lasting access. Remove Resolve from your Google connections, then retry"
          : gmailResult==="failed"
            ? "Gmail connection failed. Check Google Cloud setup and try again"
            : gmailResult==="expired"
              ? "The Gmail connection attempt expired. Please try again"
              : gmailResult==="denied"
                ? "Gmail access was not approved"
                : gmailResult==="invalid"
                  ? "Google returned an invalid connection response"
                  : "";
    if(message)notify(message);
    if(gmailResult)window.history.replaceState({},"",window.location.pathname);
  // Initial account/connector discovery is intentionally performed once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  function notify(text:string){setToast(text);window.setTimeout(()=>setToast(""),2300)}
  function convert(message:Mail){if(!converted.includes(message.id))setConverted(v=>[message.id,...v]);setTaskId(message.id);setView("tasks");setOpenId(null);notify("Task created with this email as context")}
  function chooseFolder(next:string){setView("mail");setFolder(next);setOpenId(null);setSelected([]);if(gmail.connected)void loadGmail(next)}
  function toggleSelected(id:string|number){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}
  function toggleStar(id:string|number){if(gmail.connected){void gmailAction([id],starred.includes(id)?"unstar":"star");return}setStarred(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}
  function toggleAll(){const ids=list.map(message=>message.id);setSelected(current=>ids.length>0&&ids.every(id=>current.includes(id))?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])])}
  function moveSelected(destination:string){
    if(!selected.length)return;
    if(gmail.connected){const action=destination==="Archive"?"archive":destination==="Spam"?"spam":"trash";void gmailAction(selected,action);return}
    const total=selected.length;
    setLocations(current=>({...current,...Object.fromEntries(selected.map(id=>[id,destination]))}));
    setSelected([]);
    notify(`${total} email${total===1?"":"s"} moved to ${destination}`);
  }
  function moveOpen(destination:string){if(!opened)return;if(gmail.connected){void gmailAction([opened.id],destination==="Archive"?"archive":destination==="Spam"?"spam":"trash");return}setLocations(current=>({...current,[String(opened.id)]:destination}));setOpenId(null);setReplying(false);notify(`Email moved to ${destination}`)}
  function restoreOpen(){if(!opened)return;if(gmail.connected){void gmailAction([opened.id],"restore");return}setLocations(current=>{const next={...current};delete next[String(opened.id)];return next});setOpenId(null);notify("Email moved to Inbox")}
  function toggleSelectedUnread(){const shouldMarkUnread=!selected.every(id=>unread.includes(id));if(gmail.connected){void gmailAction(selected,shouldMarkUnread?"unread":"read");return}setUnread(current=>shouldMarkUnread?[...new Set([...current,...selected])]:current.filter(id=>!selected.includes(id)));notify(`${selected.length} email${selected.length===1?"":"s"} marked ${shouldMarkUnread?"unread":"read"}`)}
  function toggleSelectedStar(){const shouldStar=!selected.every(id=>starred.includes(id));if(gmail.connected){void gmailAction(selected,shouldStar?"star":"unstar");return}setStarred(current=>shouldStar?[...new Set([...current,...selected])]:current.filter(id=>!selected.includes(id)));notify(`${selected.length} email${selected.length===1?"":"s"} ${shouldStar?"starred":"unstarred"}`)}
  function startReply(mode:"reply"|"replyAll"|"forward"){
    if(!opened)return;
    setReplyMode(mode);
    setForwardTo("");
    setReply(mode==="forward"?`\n\n---------- Forwarded message ----------\nFrom: ${opened.sender} <${opened.email}>\nDate: ${opened.date}\nSubject: ${opened.subject}\n\n${opened.body.join("\n\n")}`:"");
    setReplying(true);
  }
  async function sendReply(){if(!opened)return;if(replyMode==="forward"&&!forwardTo.trim()){notify("Add a recipient before forwarding");return}if(gmail.connected){const response=await sendGmail({to:replyMode==="forward"?forwardTo:opened.email,subject:`${replyMode==="forward"?"Fwd":"Re"}: ${opened.subject.replace(/^(re|fwd):\s*/i,"")}`,body:reply,threadId:replyMode==="forward"?undefined:opened.threadId});if(!response)return}setReplying(false);setReply("");setForwardTo("");notify(replyMode==="forward"?"Email forwarded":"Reply sent")}
  async function sendCompose(){if(!composeTo.trim()){notify("Add a recipient before sending");return}if(gmail.connected&&!(await sendGmail({to:composeTo,cc:composeCc,subject:composeSubject,body:composeBody})))return;setCompose(false);setComposeTo("");setComposeCc("");setComposeSubject("");setComposeBody("");setShowCc(false);notify("Message sent")}
  function addFolder(){
    const name=window.prompt("Name your new folder")?.trim();
    if(!name)return;
    if(customFolders.some(item=>item.toLowerCase()===name.toLowerCase())){notify("That folder already exists");return}
    setCustomFolders(current=>[...current,name]);
    chooseFolder(name);
    notify(`${name} folder created`);
  }
  function deleteFolder(name:string){
    if(!window.confirm(`Delete the ${name} folder? Emails in it will return to Inbox.`))return;
    setCustomFolders(current=>current.filter(item=>item!==name));
    setLocations(current=>Object.fromEntries(Object.entries(current).filter(([,destination])=>destination!==name)) as Record<string,string>);
    if(folder===name)chooseFolder("Inbox");
    notify(`${name} folder deleted`);
  }
  async function loadAccount(open=true){
    if(open)setAccountOpen(true);
    setAccountLoading(true);
    try{
      const response=await fetch("/api/account",{cache:"no-store"});
      const json=await response.json() as {account?:Account;signInUrl?:string};
      if(json.account)setAccount(json.account);
      if(json.signInUrl)setSignInUrl(json.signInUrl);
    }finally{setAccountLoading(false)}
  }
  async function loadGoogleConnection(){
    try{const response=await fetch("/api/connectors/google",{cache:"no-store"});const json=await response.json() as {connected?:boolean;email?:string};const next={connected:Boolean(json.connected),email:json.email??null};setGmail(next);if(next.connected)await loadGmail("Inbox")}catch{/* Signed-out demo mode. */}
  }
  async function loadGmail(nextFolder=folder){
    setMailLoading(true);
    try{const response=await fetch(`/api/gmail/threads?folder=${encodeURIComponent(nextFolder)}`,{cache:"no-store"});const json=await response.json() as {threads?:Mail[];error?:string};if(!response.ok)throw new Error(json.error??"Could not load Gmail");const threads=json.threads??[];setLiveMail(threads);setUnread(threads.filter(message=>message.unread).map(message=>message.id));setStarred(threads.filter(message=>message.starred).map(message=>message.id))}catch(error){notify(error instanceof Error?error.message:"Could not load Gmail")}finally{setMailLoading(false)}
  }
  async function gmailAction(ids:Array<string|number>,action:string,preserveOpen=false){
    try{const response=await fetch("/api/gmail/threads/modify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:ids.map(String),action})});const json=await response.json() as {error?:string};if(!response.ok)throw new Error(json.error??"Gmail action failed");setSelected([]);if(!preserveOpen)setOpenId(null);await loadGmail(folder);if(!preserveOpen)notify(`${ids.length} email${ids.length===1?"":"s"} updated`)}catch(error){notify(error instanceof Error?error.message:"Gmail action failed")}
  }
  async function sendGmail(message:{to:string;cc?:string;subject:string;body:string;threadId?:string}){try{const response=await fetch("/api/gmail/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(message)});const json=await response.json() as {error?:string};if(!response.ok)throw new Error(json.error??"Could not send email");return true}catch(error){notify(error instanceof Error?error.message:"Could not send email");return false}}
  async function disconnectGmail(){if(!window.confirm("Disconnect Gmail from Resolve?"))return;await fetch("/api/connectors/google",{method:"DELETE"});setGmail({connected:false,email:null});setLiveMail([]);setFolder("Inbox");setOpenId(null);notify("Gmail disconnected")}
  async function beginBilling(path:string){
    setAccountLoading(true);
    try{
      const response=await fetch(path,{method:"POST"});
      const json=await response.json() as {url?:string;error?:string};
      if(json.url){window.location.assign(json.url);return}
      notify(json.error??"Billing is not available yet");
    }catch{notify("Billing is not available yet")}finally{setAccountLoading(false)}
  }
  async function askEmail(e:React.FormEvent){
    e.preventDefault();
    const question=search.trim();
    if(!question||aiLoading)return;
    setAiLoading(true);
    try{
      const response=await fetch("/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,emails:mail.map(({id,sender,email,subject,date,body})=>({id,sender,email,subject,date,body}))})});
      const json=await response.json() as {answer?:string;error?:string;signInUrl?:string;upgradeRequired?:boolean;usage?:number;limit?:number};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setAccountOpen(true);return}
      if(json.upgradeRequired){setAccountOpen(true);await loadAccount(false);notify(json.error??"Monthly AI limit reached");return}
      if(!response.ok||!json.answer){notify(json.error??"AI search is unavailable");return}
      const q=question.toLowerCase();
      const found=mail.filter(m=>`${m.sender} ${m.subject} ${m.preview} ${m.body.join(" ")}`.toLowerCase().split(/\s+/).some(word=>word.length>4&&q.includes(word))).slice(0,3);
      setAnswer({text:json.answer,ids:found.map(m=>m.id)});
      if(account&&typeof json.usage==="number")setAccount({...account,usage:json.usage,limit:json.limit??account.limit});
    }catch{notify("AI search is unavailable")}finally{setAiLoading(false)}
  }

  return <main className="app">
    <aside className="sidebar">
      <div className="brand"><span>R</span><b>Resolve</b></div>
      <button className="compose" onClick={()=>setCompose(true)}>＋ <span>Compose</span></button>
      <nav>
        <button className={view==="mail"&&folder==="Inbox"?"active":""} onClick={()=>chooseFolder("Inbox")}><span>▰</span>Inbox<b>{folder==="Inbox"?unread.length:""}</b></button>
        <button className={view==="mail"&&folder==="Starred"?"active":""} onClick={()=>chooseFolder("Starred")}><span>☆</span>Starred</button>
        <button className={view==="mail"&&folder==="Snoozed"?"active":""} onClick={()=>chooseFolder("Snoozed")}><span>◷</span>Snoozed</button>
        <button className={view==="mail"&&folder==="Sent"?"active":""} onClick={()=>chooseFolder("Sent")}><span>➤</span>Sent</button>
        <button className={view==="mail"&&folder==="Drafts"?"active":""} onClick={()=>chooseFolder("Drafts")}><span>▱</span>Drafts</button>
        <div className="folder-heading"><span>Folders</span><div><button aria-label="Add folder" onClick={addFolder}>＋</button>{customFolders.length>0&&<button className={manageFolders?"active":""} onClick={()=>setManageFolders(value=>!value)}>{manageFolders?"Done":"Manage"}</button>}</div></div>
        {customFolders.map(name=><div className="folder-item" key={name}><button className={view==="mail"&&folder===name?"active":""} onClick={()=>chooseFolder(name)}><span>▰</span>{name}<b>{mail.filter(message=>locations[message.id]===name).length}</b></button>{manageFolders&&<button className="delete-folder" aria-label={`Delete ${name} folder`} onClick={()=>deleteFolder(name)}>×</button>}</div>)}
        <button className={view==="mail"&&folder==="Archive"?"active":""} onClick={()=>chooseFolder("Archive")}><span>▣</span>Archive</button>
        <button className={view==="mail"&&folder==="Spam"?"active":""} onClick={()=>chooseFolder("Spam")}><span>!</span>Spam</button>
        <button className={view==="mail"&&folder==="Trash"?"active":""} onClick={()=>chooseFolder("Trash")}><span>♲</span>Trash</button>
      </nav>
      <button className={`connectors-link ${view==="connectors"?"active":""}`} onClick={()=>{setView("connectors");setOpenId(null);setSelected([])}}><span>⌘</span>Connectors</button>
      <div className={`account ${gmail.connected?"connected":""}`}><span>M</span><div><b>{gmail.connected?gmail.email:"Gmail not connected"}</b><small>{gmail.connected?"Live inbox":"Demo data"}</small></div><i>{gmail.connected?"✓":"!"}</i></div>
    </aside>

    <section className="main">
      <header className="topbar">
        <div className="mobile-logo">R</div>
        <div className="tabs"><button className={view==="mail"?"active":""} onClick={()=>{setView("mail");setOpenId(null)}}>Mail</button><button className={view==="tasks"?"active":""} onClick={()=>{setView("tasks");setOpenId(null)}}>Tasks <span>{tasks.length}</span></button></div>
        <form className={`ai-search ${aiLoading?"loading":""}`} onSubmit={askEmail}><span>✦</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={aiLoading?"Searching your email…":"Ask anything about your email…"} disabled={aiLoading}/><button aria-label="Ask Resolve" disabled={aiLoading}>{aiLoading?"…":"↑"}</button></form>
        <button className="avatar" aria-label="Open account and billing" onClick={()=>void loadAccount(true)}>{account?.displayName?.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"PD"}</button>
      </header>
      {answer&&<section className="ai-answer"><header><span>✦</span><b>Resolve</b><button onClick={()=>setAnswer(null)}>×</button></header><p>{answer.text}</p>{answer.ids.length>0&&<div>{answer.ids.map(id=>{const m=mail.find(item=>item.id===id)!;return <button key={id} onClick={()=>{setView("mail");setOpenId(id);setAnswer(null)}}><span className={`initials tiny ${m.tone}`}>{m.initials}</span><span><b>{m.sender}</b><small>{m.subject}</small></span><i>Open →</i></button>})}</div>}</section>}

      {view==="mail"&&!opened&&<section className="inbox">
        <div className={`mail-tools ${selected.length?"has-selection":""}`}><button className="select-all" aria-label="Select all visible emails" aria-pressed={list.length>0&&list.every(m=>selected.includes(m.id))} onClick={toggleAll}>{list.length>0&&list.every(m=>selected.includes(m.id))?"✓":""}</button>{selected.length?<><strong>{selected.length} selected</strong><button className="bulk-action" onClick={toggleSelectedStar}>☆ Star</button><button className="bulk-action" onClick={toggleSelectedUnread}>○ Read/unread</button>{customFolders.length>0&&!gmail.connected&&<select key={selected.join("-")} className="bulk-move" aria-label="Move selected emails to folder" defaultValue="" onChange={e=>{if(e.target.value)moveSelected(e.target.value)}}><option value="" disabled>Move to folder…</option>{customFolders.map(name=><option key={name} value={name}>{name}</option>)}</select>}<button className="bulk-action" onClick={()=>moveSelected("Archive")}>▣ Archive</button><button className="bulk-action" onClick={()=>moveSelected("Spam")}>! Spam</button><button className="bulk-action danger" onClick={()=>moveSelected("Trash")}>♲ Trash</button></>:<><button aria-label="Refresh inbox" onClick={()=>gmail.connected?void loadGmail(folder):notify("Inbox refreshed")}>↻</button><span/><small>{mailLoading?"Loading…":list.length?`1–${list.length}`:"0"}</small><button>‹</button><button>›</button></>}</div>
        <div className="mail-list">{list.map(m=><article key={m.id} className={`${unread.includes(m.id)?"unread ":""}${selected.includes(m.id)?"selected":""}`} onClick={()=>{setOpenId(m.id);if(unread.includes(m.id)){setUnread(current=>current.filter(id=>id!==m.id));if(gmail.connected)void gmailAction([m.id],"read",true)}}}><button className="row-check" aria-label={`Select email from ${m.sender}`} aria-pressed={selected.includes(m.id)} onClick={e=>{e.stopPropagation();toggleSelected(m.id)}}>{selected.includes(m.id)?"✓":""}</button><button className={`row-star ${starred.includes(m.id)?"active":""}`} aria-label={`${starred.includes(m.id)?"Unstar":"Star"} email from ${m.sender}`} onClick={e=>{e.stopPropagation();toggleStar(m.id)}}>{starred.includes(m.id)?"★":"☆"}</button><span className={`initials ${m.tone}`}>{m.initials}</span><b>{m.sender}</b><div><strong>{m.subject}</strong><span className="ai-summary"><i>✦</i>{aiSummaries[String(m.id)]??m.preview}</span></div>{converted.includes(m.id)&&<em>Task</em>}<time>{m.time}</time></article>)}{list.length===0&&!mailLoading&&<div className="empty-folder"><span>✓</span><h2>No messages here</h2><p>Your {folder.toLowerCase()} folder is clear.</p></div>}</div>
      </section>}

      {view==="mail"&&opened&&<section className="reader">
        <div className="reader-tools"><button title="Back" aria-label="Back to message list" onClick={()=>{setOpenId(null);setReplying(false)}}>←</button>{(gmail.connected?folder==="Trash":Boolean(locations[String(opened.id)]))?<button title="Move to Inbox" aria-label="Move to Inbox" onClick={restoreOpen}>↥</button>:<button title="Archive" aria-label="Archive" onClick={()=>moveOpen("Archive")}>▣</button>}<button title="Report spam" aria-label="Report spam" onClick={()=>moveOpen("Spam")}>!</button><button title="Move to Trash" aria-label="Move to Trash" onClick={()=>moveOpen("Trash")}>♲</button><button title="Snooze" aria-label="Snooze" onClick={()=>gmail.connected?notify("Gmail snooze is coming next"):moveOpen("Snoozed")}>◷</button><button title="Mark unread" aria-label="Mark unread" onClick={()=>gmail.connected?void gmailAction([opened.id],"unread"):(setUnread(current=>[...new Set([...current,opened.id])]),setOpenId(null),notify("Email marked unread"))}>○</button><button title={starred.includes(opened.id)?"Unstar":"Star"} aria-label={starred.includes(opened.id)?"Unstar":"Star"} className={starred.includes(opened.id)?"star-active":""} onClick={()=>toggleStar(opened.id)}>{starred.includes(opened.id)?"★":"☆"}</button><span/><button className="task-button" onClick={()=>convert(opened)}>{converted.includes(opened.id)?"Open task":"＋ Add to tasks"}</button></div>
        <div className="message">
          <h1>{opened.subject}</h1>
          <div className="sender"><span className={`initials ${opened.tone}`}>{opened.initials}</span><div><b>{opened.sender}</b><p>{opened.email} · to me</p></div><time>{opened.date}</time></div>
          <div className="copy">{opened.body.map((p,i)=><p key={i}>{p.split("\n").map((line,j)=><span key={j}>{line}{j<p.split("\n").length-1&&<br/>}</span>)}</p>)}</div>
          {opened.attachment&&<button className="attachment" onClick={()=>notify(`${opened.attachment} downloaded`)}><span>PDF</span><div><b>{opened.attachment}</b><small>248 KB</small></div><strong>↓</strong></button>}
          {!replying?<div className="reply-actions"><button onClick={()=>startReply("reply")}>↩ Reply</button><button onClick={()=>startReply("replyAll")}>↩ Reply all</button><button onClick={()=>startReply("forward")}>→ Forward</button><button onClick={()=>{setReplyMode("reply");setReply(`Hi ${opened.sender.split(" ")[0]},\n\nThanks for the update. I’ll take care of this and follow up shortly.\n\nBest,\nPat`);setReplying(true)}}>✦ Draft reply</button></div>:<div className="reply-box"><div>{replyMode==="forward"?<>To <input aria-label="Forward recipient" autoFocus value={forwardTo} onChange={e=>setForwardTo(e.target.value)} placeholder="Recipient email"/></>:<>To <b>{opened.sender}</b>{replyMode==="replyAll"&&<span> · all recipients</span>}</>}</div><textarea autoFocus={replyMode!=="forward"} value={reply} onChange={e=>setReply(e.target.value)}/><footer><button className="send" onClick={sendReply}>{replyMode==="forward"?"Forward":"Send"}</button><button onClick={()=>notify("Attachment picker opened")}>＋ Attach</button><span/><button onClick={()=>{setReplying(false);setReply("")}}>Discard</button></footer></div>}
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

      {view==="connectors"&&<section className="connectors"><header><p>CONTEXT SOURCES</p><h1>Connect your work</h1><span>Give Resolve permission-aware context from the tools you already use. You control each connection.</span></header><div className="connector-grid">{[
        {name:"Gmail",mark:"M",tone:"gmail",description:"Sync your inbox and enable sending, replying, forwarding, and mailbox actions."},
        {name:"Google Drive",mark:"D",tone:"drive",description:"Search documents, PDFs, and files alongside your email."},
        {name:"Google Calendar",mark:"31",tone:"gcal",description:"Understand meetings, travel, availability, and upcoming commitments."},
        {name:"Slack",mark:"S",tone:"slack",description:"Find decisions and conversations across your permitted channels."},
        {name:"Granola",mark:"G",tone:"granola",description:"Use meeting notes, transcripts, decisions, and action items as context."},
        {name:"Glean",mark:"⌕",tone:"glean",description:"Search permission-aware company knowledge from one place."},
      ].map(item=><article key={item.name}><div className={`connector-mark ${item.tone}`}>{item.mark}</div><div><h2>{item.name}</h2><p>{item.name==="Gmail"&&gmail.connected?`Connected as ${gmail.email}. Your refresh token is encrypted at rest.`:item.description}</p></div>{item.name==="Gmail"?(gmail.connected?<button className="connected" onClick={()=>void disconnectGmail()}>Disconnect</button>:<button onClick={()=>window.location.assign("/api/connectors/google/start")}>Connect</button>):<button onClick={()=>notify(`${item.name} integration is not configured yet`)}>Connect</button>}</article>)}</div><footer><span>🔒</span><p><b>Your permissions stay intact.</b> Resolve only searches content your connected account can already access.</p></footer></section>}
    </section>

    {compose&&<div className="compose-window"><header><b>New message</b><button aria-label="Close composer" onClick={()=>setCompose(false)}>×</button></header><label>To <input autoFocus value={composeTo} onChange={e=>setComposeTo(e.target.value)}/><button className="cc-toggle" onClick={()=>setShowCc(value=>!value)}>Cc/Bcc</button></label>{showCc&&<label>Cc <input value={composeCc} onChange={e=>setComposeCc(e.target.value)}/></label>}<label>Subject <input value={composeSubject} onChange={e=>setComposeSubject(e.target.value)}/></label><textarea aria-label="Message body" value={composeBody} onChange={e=>setComposeBody(e.target.value)}/><footer><button onClick={sendCompose}>Send</button><button className="attach-compose" onClick={()=>notify("Attachment picker opened")}>＋ Attach</button><span/><button className="discard-compose" onClick={()=>{setCompose(false);setComposeTo("");setComposeCc("");setComposeSubject("");setComposeBody("")}}>Discard</button></footer></div>}
    {accountOpen&&<div className="account-backdrop" onClick={()=>setAccountOpen(false)}><section className="account-panel" onClick={event=>event.stopPropagation()}><header><div><small>RESOLVE ACCOUNT</small><h2>{account?account.displayName:"Your account"}</h2>{account&&<p>{account.email}</p>}</div><button aria-label="Close account" onClick={()=>setAccountOpen(false)}>×</button></header>{accountLoading&&!account?<div className="account-loading">Loading account…</div>:account?<><div className="plan-card"><div><span className={`plan-pill ${account.plan}`}>{account.plan==="pro"?"PRO":"FREE"}</span><h3>{account.plan==="pro"?"Resolve Pro":"Free plan"}</h3><p>{account.plan==="pro"?"More AI search for a busy inbox.":"Try AI search before upgrading."}</p></div><strong>{account.plan==="pro"?"$20":"$0"}<small>/month</small></strong></div><div className="usage-card"><div><b>AI answers this month</b><span>{account.usage} of {account.limit}</span></div><progress max={account.limit} value={account.usage}/><p>Usage resets at the beginning of each month. Resolve stops at your limit—there are no surprise overage charges.</p></div>{account.plan==="pro"?<button className="billing-primary" disabled={accountLoading} onClick={()=>void beginBilling("/api/billing/portal")}>Manage billing</button>:<button className="billing-primary" disabled={accountLoading} onClick={()=>void beginBilling("/api/billing/checkout")}>Upgrade to Pro · $20/month</button>}<p className="billing-note">Payments are securely processed by Stripe. Resolve never stores your card number.</p></>:<div className="sign-in-card"><span>✦</span><h3>Sign in to protect your inbox</h3><p>An account is required for AI search, billing, and private connector access.</p><a href={signInUrl}>Sign in with ChatGPT</a></div>}</section></div>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </main>
}
