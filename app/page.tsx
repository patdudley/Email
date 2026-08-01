"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mail = { id:string|number; threadId?:string; sender:string; email:string; initials:string; tone:string; subject:string; preview:string; time:string; date:string; unread?:boolean; starred?:boolean; body:string[]; html?:string; images?:Array<{src:string;alt:string}>; attachment?:string };
type Account = {email:string;displayName:string;plan:"free"|"pro";subscriptionStatus:string|null;cancelAtPeriodEnd:boolean;currentPeriodEnd:number|null;usage:number;limit:number;hasBillingAccount:boolean};
type TaskRecord = {id:string;title:string;description:string;deadline:string|null;status:string;sourceThreadId:string|null;createdAt:number;updatedAt:number};
type TaskMessage = {id?:string;role:"user"|"assistant";content:string;sources?:Array<{url:string;title:string}>;createdAt:number};

function EmailImage({image}:{image:{src:string;alt:string}}){
  // Remote email assets cannot use the framework image optimizer because their hosts are arbitrary.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.src} alt={image.alt} loading="lazy" referrerPolicy="no-referrer"/>;
}

function imageUrlsInText(text:string):string[]{
  return [...text.matchAll(/View image:\s*\((https?:\/\/[^)\s]+)\)/gi)].map(match=>match[1].replace(/&amp;/gi,"&"));
}

function EmailBodyText({text}:{text:string}){
  const matches=[...text.matchAll(/View image:\s*\((https?:\/\/[^)\s]+)\)/gi)];
  if(!matches.length)return <p>{text.split("\n").map((line,index,lines)=><span key={index}>{line}{index<lines.length-1&&<br/>}</span>)}</p>;
  const content:Array<{kind:"text";value:string}|{kind:"image";value:string}>=[];
  let cursor=0;
  for(const match of matches){
    const index=match.index??0;
    if(index>cursor)content.push({kind:"text",value:text.slice(cursor,index)});
    content.push({kind:"image",value:match[1].replace(/&amp;/gi,"&")});
    cursor=index+match[0].length;
  }
  if(cursor<text.length)content.push({kind:"text",value:text.slice(cursor)});
  return <>{content.map((item,index)=>item.kind==="image"
    ? <div className="inline-email-image" key={`${item.value}-${index}`}><EmailImage image={{src:item.value,alt:"Email image"}}/></div>
    : item.value.trim()&&<p key={index}>{item.value.replace(/^\s*Caption:\s*$/gim,"").split("\n").map((line,lineIndex,lines)=><span key={lineIndex}>{line}{lineIndex<lines.length-1&&<br/>}</span>)}</p>)}</>;
}

function EmailHtml({html}:{html:string}){
  const frame=useRef<HTMLIFrameElement>(null);
  const [height,setHeight]=useState(600);
  const resize=useCallback(()=>{
    const document=frame.current?.contentDocument;
    if(!document)return;
    const next=Math.max(320,document.documentElement.scrollHeight,document.body?.scrollHeight??0);
    setHeight(Math.min(next+8,50000));
  },[]);
  useEffect(()=>{
    const onResize=()=>resize();
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[resize]);
  return <iframe ref={frame} className="email-html" title="Email content" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={html} style={{height}} onLoad={()=>{
    resize();
    const document=frame.current?.contentDocument;
    document?.querySelectorAll("img").forEach(image=>image.addEventListener("load",resize,{once:true}));
  }}/>;
}

export default function Home(){
  const [view,setView]=useState<"mail"|"tasks"|"connectors">("mail");
  const [folder,setFolder]=useState("Inbox");
  const [openId,setOpenId]=useState<string|number|null>(null);
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
  const [savedTasks,setSavedTasks]=useState<TaskRecord[]>([]);
  const [activeTaskId,setActiveTaskId]=useState<string|null>(null);
  const [taskMessages,setTaskMessages]=useState<TaskMessage[]>([]);
  const [tasksLoading,setTasksLoading]=useState(true);
  const [taskAgentLoading,setTaskAgentLoading]=useState(false);
  const [creatingTask,setCreatingTask]=useState(false);
  const [newTaskTitle,setNewTaskTitle]=useState("");
  const [newTaskDescription,setNewTaskDescription]=useState("");
  const [newTaskDeadline,setNewTaskDeadline]=useState("");
  const [taskChatInput,setTaskChatInput]=useState("");
  const [toast,setToast]=useState("");
  const [answer,setAnswer]=useState<{text:string;ids:Array<string|number>}|null>(null);
  const [selected,setSelected]=useState<Array<string|number>>([]);
  const [starred,setStarred]=useState<Array<string|number>>([]);
  const [unread,setUnread]=useState<Array<string|number>>([]);
  const [customFolders,setCustomFolders]=useState<string[]>([]);
  const [manageFolders,setManageFolders]=useState(false);
  const [locations,setLocations]=useState<Record<string,string>>({});
  const [accountOpen,setAccountOpen]=useState(false);
  const [account,setAccount]=useState<Account|null>(null);
  const [accountLoading,setAccountLoading]=useState(false);
  const [signInUrl,setSignInUrl]=useState("/signin-with-chatgpt?return_to=%2F");
  const [aiLoading,setAiLoading]=useState(false);
  const [gmail,setGmail]=useState<{connected:boolean;email:string|null}>({connected:false,email:null});
  const [gmailChecking,setGmailChecking]=useState(true);
  const [liveMail,setLiveMail]=useState<Mail[]>([]);
  const [mailLoading,setMailLoading]=useState(false);
  const [gmailPage,setGmailPage]=useState(0);
  const [gmailPageTokens,setGmailPageTokens]=useState<string[]>([""]);
  const [gmailNextPageToken,setGmailNextPageToken]=useState<string|null>(null);
  const mail=liveMail;
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
  const activeTask=savedTasks.find(task=>task.id===activeTaskId)??null;
  useEffect(()=>{
    void loadAccount(false);
    void loadGoogleConnection();
    void loadTasks();
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
  async function convert(message:Mail){
    const linked=savedTasks.find(task=>task.sourceThreadId===String(message.threadId??message.id));
    if(linked){setActiveTaskId(linked.id);await openTask(linked.id);setView("tasks");setOpenId(null);return}
    await createTask({title:message.subject,description:`From ${message.sender} <${message.email}>\n\n${message.preview}\n\n${message.body.join("\n\n")}`,deadline:null,sourceThreadId:String(message.threadId??message.id)});
  }
  function chooseFolder(next:string){setView("mail");setFolder(next);setOpenId(null);setSelected([]);setGmailPage(0);setGmailPageTokens([""]);setGmailNextPageToken(null);if(gmail.connected)void loadGmail(next,"",0)}
  function openMessage(message:Mail){
    setView("mail");setOpenId(message.id);setAnswer(null);
    if(unread.includes(message.id)){
      setUnread(current=>current.filter(id=>id!==message.id));
      if(gmail.connected)void fetch("/api/gmail/threads/modify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[String(message.id)],action:"read"})});
    }
    if(gmail.connected)void loadGmailThread(String(message.id));
  }
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
  async function loadTasks(){
    setTasksLoading(true);
    try{
      const response=await fetch("/api/tasks",{cache:"no-store"});
      const json=await response.json() as {tasks?:TaskRecord[];signInUrl?:string};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setSavedTasks([]);return}
      if(response.ok)setSavedTasks(json.tasks??[]);
    }finally{setTasksLoading(false)}
  }
  async function openTask(id:string){
    setActiveTaskId(id);setCreatingTask(false);setTaskMessages([]);setTasksLoading(true);
    try{
      const response=await fetch(`/api/tasks?id=${encodeURIComponent(id)}`,{cache:"no-store"});
      const json=await response.json() as {task?:TaskRecord;messages?:TaskMessage[];error?:string};
      if(!response.ok||!json.task)throw new Error(json.error??"Could not load task");
      setTaskMessages(json.messages??[]);
    }catch(error){notify(error instanceof Error?error.message:"Could not load task")}finally{setTasksLoading(false)}
  }
  async function createTask(input?:{title:string;description:string;deadline:string|null;sourceThreadId?:string}){
    const title=input?.title??newTaskTitle.trim();
    const description=input?.description??newTaskDescription.trim();
    if(!title||!description){notify("Add a title and description");return}
    setTaskAgentLoading(true);
    try{
      const response=await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,description,deadline:input?.deadline??(newTaskDeadline||null),sourceThreadId:input?.sourceThreadId})});
      const json=await response.json() as {task?:TaskRecord;error?:string;signInUrl?:string};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setAccountOpen(true);return}
      if(!response.ok||!json.task)throw new Error(json.error??"Could not create task");
      setSavedTasks(current=>[json.task!,...current]);setActiveTaskId(json.task.id);setCreatingTask(false);setView("tasks");setOpenId(null);setNewTaskTitle("");setNewTaskDescription("");setNewTaskDeadline("");setTaskMessages([]);
      await runTaskAgent(json.task.id,"",true);
    }catch(error){notify(error instanceof Error?error.message:"Could not create task")}finally{setTaskAgentLoading(false)}
  }
  async function runTaskAgent(taskId:string,message:string,start=false){
    const text=message.trim();
    if(!start&&!text)return;
    if(!start)setTaskMessages(current=>[...current,{role:"user",content:text,createdAt:Math.floor(Date.now()/1000)}]);
    setTaskChatInput("");setTaskAgentLoading(true);
    try{
      const response=await fetch("/api/tasks/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({taskId,message:text,start})});
      const json=await response.json() as {message?:TaskMessage;error?:string;signInUrl?:string;upgradeRequired?:boolean;usage?:number;limit?:number};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setAccountOpen(true);return}
      if(json.upgradeRequired){setAccountOpen(true);await loadAccount(false);notify(json.error??"Monthly AI limit reached");return}
      if(!response.ok||!json.message)throw new Error(json.error??"Task agent unavailable");
      setTaskMessages(current=>[...current,json.message!]);
      if(account&&typeof json.usage==="number")setAccount({...account,usage:json.usage,limit:json.limit??account.limit});
      await loadTasks();setActiveTaskId(taskId);
    }catch(error){notify(error instanceof Error?error.message:"Task agent unavailable")}finally{setTaskAgentLoading(false)}
  }
  async function deleteTask(id:string){
    if(!window.confirm("Delete this task and its conversation?"))return;
    const response=await fetch("/api/tasks",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    if(!response.ok){notify("Could not delete task");return}
    setSavedTasks(current=>current.filter(task=>task.id!==id));setActiveTaskId(null);setTaskMessages([]);notify("Task deleted");
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
    setGmailChecking(true);
    try{const response=await fetch("/api/connectors/google",{cache:"no-store"});const json=await response.json() as {connected?:boolean;email?:string};const next={connected:Boolean(json.connected),email:json.email??null};setGmail(next);if(next.connected)await loadGmail("Inbox");else setLiveMail([])}catch{setGmail({connected:false,email:null});setLiveMail([])}finally{setGmailChecking(false)}
  }
  async function loadGmail(nextFolder=folder,pageToken=gmailPageTokens[gmailPage]??"",targetPage=gmailPage){
    setMailLoading(true);
    try{const params=new URLSearchParams({folder:nextFolder});if(pageToken)params.set("pageToken",pageToken);const response=await fetch(`/api/gmail/threads?${params}`,{cache:"no-store"});const json=await response.json() as {threads?:Mail[];nextPageToken?:string|null;error?:string};if(!response.ok)throw new Error(json.error??"Could not load Gmail");const threads=json.threads??[];setLiveMail(threads);setUnread(threads.filter(message=>message.unread).map(message=>message.id));setStarred(threads.filter(message=>message.starred).map(message=>message.id));setGmailPage(targetPage);setGmailNextPageToken(json.nextPageToken??null);setGmailPageTokens(current=>{const next=current.slice(0,targetPage+1);next[targetPage]=pageToken;if(json.nextPageToken)next[targetPage+1]=json.nextPageToken;return next})}catch(error){notify(error instanceof Error?error.message:"Could not load Gmail")}finally{setMailLoading(false)}
  }
  async function loadGmailThread(threadId:string){
    try{const response=await fetch(`/api/gmail/threads?threadId=${encodeURIComponent(threadId)}`,{cache:"no-store"});const json=await response.json() as {thread?:Mail;error?:string};if(!response.ok||!json.thread)throw new Error(json.error??"Could not load this email");setLiveMail(current=>current.map(message=>String(message.id)===threadId?{...message,...json.thread}:message))}catch(error){notify(error instanceof Error?error.message:"Could not load this email")}
  }
  function changeGmailPage(direction:-1|1){if(!gmail.connected||mailLoading)return;const target=gmailPage+direction;if(target<0)return;const token=direction===1?gmailNextPageToken:gmailPageTokens[target];if(token==null)return;setOpenId(null);setSelected([]);void loadGmail(folder,token,target)}
  async function gmailAction(ids:Array<string|number>,action:string,preserveOpen=false){
    try{const response=await fetch("/api/gmail/threads/modify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:ids.map(String),action})});const json=await response.json() as {error?:string};if(!response.ok)throw new Error(json.error??"Gmail action failed");setSelected([]);if(!preserveOpen)setOpenId(null);await loadGmail(folder,gmailPageTokens[gmailPage]??"",gmailPage);if(!preserveOpen)notify(`${ids.length} email${ids.length===1?"":"s"} updated`)}catch(error){notify(error instanceof Error?error.message:"Gmail action failed")}
  }
  async function sendGmail(message:{to:string;cc?:string;subject:string;body:string;threadId?:string}){try{const response=await fetch("/api/gmail/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(message)});const json=await response.json() as {error?:string};if(!response.ok)throw new Error(json.error??"Could not send email");return true}catch(error){notify(error instanceof Error?error.message:"Could not send email");return false}}
  async function disconnectGmail(){if(!window.confirm("Disconnect Gmail from Resolve?"))return;await fetch("/api/connectors/google",{method:"DELETE"});setGmail({connected:false,email:null});setLiveMail([]);setFolder("Inbox");setGmailPage(0);setGmailPageTokens([""]);setGmailNextPageToken(null);setOpenId(null);notify("Gmail disconnected")}
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
      const response=await fetch("/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,emails:mail.map(({id,sender,email,subject,date,preview,body})=>({id,sender,email,subject,date,preview,body}))})});
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
      <div className={`account ${gmail.connected?"connected":""}`}><span>M</span><div><b>{gmailChecking?"Checking Gmail…":gmail.connected?gmail.email:"Gmail not connected"}</b><small>{gmailChecking?"Loading account":gmail.connected?"Live inbox":"Connect Gmail to begin"}</small></div><i>{gmailChecking?"…":gmail.connected?"✓":"!"}</i></div>
    </aside>

    <section className="main">
      <header className="topbar">
        <div className="mobile-logo">R</div>
        <div className="tabs"><button className={view==="mail"?"active":""} onClick={()=>{setView("mail");setOpenId(null)}}>Mail</button><button className={view==="tasks"?"active":""} onClick={()=>{setView("tasks");setOpenId(null)}}>Tasks <span>{savedTasks.length}</span></button></div>
        <form className={`ai-search ${aiLoading?"loading":""}`} onSubmit={askEmail}><span>✦</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={aiLoading?"Searching your email…":"Ask anything about your email…"} disabled={aiLoading}/><button aria-label="Ask Resolve" disabled={aiLoading}>{aiLoading?"…":"↑"}</button></form>
        <button className="avatar" aria-label="Open account and billing" onClick={()=>void loadAccount(true)}>{account?.displayName?.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"PD"}</button>
      </header>
      {answer&&<section className="ai-answer"><header><span>✦</span><b>Resolve</b><button onClick={()=>setAnswer(null)}>×</button></header><p>{answer.text}</p>{answer.ids.length>0&&<div>{answer.ids.map(id=>{const m=mail.find(item=>item.id===id)!;return <button key={id} onClick={()=>openMessage(m)}><span className={`initials tiny ${m.tone}`}>{m.initials}</span><span><b>{m.sender}</b><small>{m.subject}</small></span><i>Open →</i></button>})}</div>}</section>}

      {view==="mail"&&!opened&&<section className="inbox">
        <div className={`mail-tools ${selected.length?"has-selection":""}`}><button className="select-all" aria-label="Select all visible emails" aria-pressed={list.length>0&&list.every(m=>selected.includes(m.id))} onClick={toggleAll}>{list.length>0&&list.every(m=>selected.includes(m.id))?"✓":""}</button>{selected.length?<><strong>{selected.length} selected</strong><button className="bulk-action" onClick={toggleSelectedStar}>☆ Star</button><button className="bulk-action" onClick={toggleSelectedUnread}>○ Read/unread</button>{customFolders.length>0&&!gmail.connected&&<select key={selected.join("-")} className="bulk-move" aria-label="Move selected emails to folder" defaultValue="" onChange={e=>{if(e.target.value)moveSelected(e.target.value)}}><option value="" disabled>Move to folder…</option>{customFolders.map(name=><option key={name} value={name}>{name}</option>)}</select>}<button className="bulk-action" onClick={()=>moveSelected("Archive")}>▣ Archive</button><button className="bulk-action" onClick={()=>moveSelected("Spam")}>! Spam</button><button className="bulk-action danger" onClick={()=>moveSelected("Trash")}>♲ Trash</button></>:<><button aria-label="Refresh inbox" onClick={()=>gmail.connected?void loadGmail(folder,gmailPageTokens[gmailPage]??"",gmailPage):notify("Connect Gmail to load your inbox")}>↻</button><span/><small>{gmailChecking||mailLoading?"Loading…":list.length?`${gmailPage*50+1}–${gmailPage*50+list.length}`:"0"}</small><button aria-label="Previous email page" disabled={!gmail.connected||gmailPage===0||mailLoading} onClick={()=>changeGmailPage(-1)}>‹</button><button aria-label="Next email page" disabled={!gmail.connected||!gmailNextPageToken||mailLoading} onClick={()=>changeGmailPage(1)}>›</button></>}</div>
        <div className="mail-list">{list.map(m=><article key={m.id} className={`${unread.includes(m.id)?"unread ":""}${selected.includes(m.id)?"selected":""}`} onClick={()=>openMessage(m)}><button className="row-check" aria-label={`Select email from ${m.sender}`} aria-pressed={selected.includes(m.id)} onClick={e=>{e.stopPropagation();toggleSelected(m.id)}}>{selected.includes(m.id)?"✓":""}</button><button className={`row-star ${starred.includes(m.id)?"active":""}`} aria-label={`${starred.includes(m.id)?"Unstar":"Star"} email from ${m.sender}`} onClick={e=>{e.stopPropagation();toggleStar(m.id)}}>{starred.includes(m.id)?"★":"☆"}</button><span className={`initials ${m.tone}`}>{m.initials}</span><b>{m.sender}</b><div><strong>{m.subject}</strong><span className="ai-summary"><i>✦</i>{m.preview}</span></div>{savedTasks.some(task=>task.sourceThreadId===String(m.threadId??m.id))&&<em>Task</em>}<time>{m.time}</time></article>)}{list.length===0&&(gmailChecking||mailLoading)&&<div className="mail-loading-state" role="status"><span/><span/><span/><p>Loading your Gmail inbox…</p></div>}{list.length===0&&!gmailChecking&&!mailLoading&&<div className="empty-folder"><span>{gmail.connected?"✓":"M"}</span><h2>{gmail.connected?"No messages here":"Connect your Gmail"}</h2><p>{gmail.connected?`Your ${folder.toLowerCase()} folder is clear.`:"Open Connectors to load your real inbox."}</p></div>}</div>
      </section>}

      {view==="mail"&&opened&&<section className="reader">
        <div className="reader-tools"><button data-tooltip="Back" aria-label="Back to message list" onClick={()=>{setOpenId(null);setReplying(false)}}>←</button>{(gmail.connected?folder==="Trash":Boolean(locations[String(opened.id)]))?<button data-tooltip="Move to Inbox" aria-label="Move to Inbox" onClick={restoreOpen}>↥</button>:<button data-tooltip="Archive" aria-label="Archive" onClick={()=>moveOpen("Archive")}>▣</button>}<button data-tooltip="Report spam" aria-label="Report spam" onClick={()=>moveOpen("Spam")}>!</button><button data-tooltip="Move to Trash" aria-label="Move to Trash" onClick={()=>moveOpen("Trash")}>♲</button><button data-tooltip="Snooze" aria-label="Snooze" onClick={()=>gmail.connected?notify("Gmail snooze is coming next"):moveOpen("Snoozed")}>◷</button><button data-tooltip="Mark unread" aria-label="Mark unread" onClick={()=>gmail.connected?void gmailAction([opened.id],"unread"):(setUnread(current=>[...new Set([...current,opened.id])]),setOpenId(null),notify("Email marked unread"))}>○</button><button data-tooltip={starred.includes(opened.id)?"Unstar":"Star"} aria-label={starred.includes(opened.id)?"Unstar":"Star"} className={starred.includes(opened.id)?"star-active":""} onClick={()=>toggleStar(opened.id)}>{starred.includes(opened.id)?"★":"☆"}</button><span/><button className="task-button" onClick={()=>void convert(opened)}>{savedTasks.some(task=>task.sourceThreadId===String(opened.threadId??opened.id))?"Open task":"＋ Add to tasks"}</button></div>
        <div className="message">
          <h1>{opened.subject}</h1>
          <div className="sender"><span className={`initials ${opened.tone}`}>{opened.initials}</span><div><b>{opened.sender}</b><p>{opened.email} · to me</p></div><time>{opened.date}</time></div>
          {opened.html?<EmailHtml html={opened.html}/>:<><div className="copy">{opened.body.map((part,index)=><EmailBodyText key={index} text={part}/>)}</div>{opened.images&&opened.images.filter(image=>!opened.body.flatMap(imageUrlsInText).includes(image.src)).length>0&&<div className="email-images">{opened.images.filter(image=>!opened.body.flatMap(imageUrlsInText).includes(image.src)).map((image,index)=><EmailImage key={`${image.src}-${index}`} image={image}/>)}</div>}</>}
          {opened.attachment&&<button className="attachment" onClick={()=>notify(`${opened.attachment} downloaded`)}><span>PDF</span><div><b>{opened.attachment}</b><small>248 KB</small></div><strong>↓</strong></button>}
          {!replying?<div className="reply-actions"><button onClick={()=>startReply("reply")}>↩ Reply</button><button onClick={()=>startReply("replyAll")}>↩ Reply all</button><button onClick={()=>startReply("forward")}>→ Forward</button><button onClick={()=>{setReplyMode("reply");setReply(`Hi ${opened.sender.split(" ")[0]},\n\nThanks for the update. I’ll take care of this and follow up shortly.\n\nBest,\nPat`);setReplying(true)}}>✦ Draft reply</button></div>:<div className="reply-box"><div>{replyMode==="forward"?<>To <input aria-label="Forward recipient" autoFocus value={forwardTo} onChange={e=>setForwardTo(e.target.value)} placeholder="Recipient email"/></>:<>To <b>{opened.sender}</b>{replyMode==="replyAll"&&<span> · all recipients</span>}</>}</div><textarea autoFocus={replyMode!=="forward"} value={reply} onChange={e=>setReply(e.target.value)}/><footer><button className="send" onClick={sendReply}>{replyMode==="forward"?"Forward":"Send"}</button><button onClick={()=>notify("Attachment picker opened")}>＋ Attach</button><span/><button onClick={()=>{setReplying(false);setReply("")}}>Discard</button></footer></div>}
        </div>
      </section>}

      {view==="tasks"&&<section className="tasks task-workspace">
        <div className="task-list"><header><h1>Tasks</h1><button aria-label="Create new task" onClick={()=>{setCreatingTask(true);setActiveTaskId(null);setTaskMessages([])}}>＋</button></header>
          {tasksLoading&&!savedTasks.length?<div className="task-list-loading">Loading tasks…</div>:savedTasks.map(task=><article key={task.id} className={activeTaskId===task.id?"active":""} onClick={()=>void openTask(task.id)}><span className="task-status-dot"/><div><h2>{task.title}</h2><p>{task.description}</p><footer><span>{task.sourceThreadId?"From email":"Standalone"}</span>{task.deadline&&<time>{new Date(`${task.deadline}T00:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time>}</footer></div></article>)}
          {!tasksLoading&&!savedTasks.length&&<div className="task-list-empty">No tasks yet</div>}
        </div>
        {creatingTask?<div className="new-task-page"><form onSubmit={event=>{event.preventDefault();void createTask()}}><span className="eyebrow">NEW TASK</span><h1>What are you working on?</h1><p>Give Resolve the goal and enough background to start. It will ask focused follow-up questions before researching and building your plan.</p><label>Title<input autoFocus value={newTaskTitle} onChange={event=>setNewTaskTitle(event.target.value)} placeholder="e.g. Plan a customer advisory board" maxLength={200}/></label><label>Description<textarea value={newTaskDescription} onChange={event=>setNewTaskDescription(event.target.value)} placeholder="What outcome do you want? What should Resolve know?" maxLength={5000}/></label><label className="deadline-field">Deadline <span>Optional</span><input type="date" value={newTaskDeadline} onChange={event=>setNewTaskDeadline(event.target.value)}/></label><button className="create-task-primary" disabled={taskAgentLoading||!newTaskTitle.trim()||!newTaskDescription.trim()}>{taskAgentLoading?"Starting…":"Create task and start →"}</button></form></div>
        :activeTask?<div className="task-chat-page"><header><div><span className="eyebrow">TASK WORKSPACE</span><h1>{activeTask.title}</h1><p>{activeTask.description}</p><div className="task-meta"><span>{activeTask.deadline?`Due ${new Date(`${activeTask.deadline}T00:00:00`).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`:"No deadline"}</span>{activeTask.sourceThreadId&&<span>Created from email</span>}</div></div><button className="delete-task" onClick={()=>void deleteTask(activeTask.id)}>Delete</button></header><div className="task-conversation">{!taskMessages.length&&!taskAgentLoading&&<div className="task-agent-intro"><span>✦</span><p>Resolve is ready to review this task.</p><button onClick={()=>void runTaskAgent(activeTask.id,"",true)}>Start the conversation</button></div>}{taskMessages.map((message,index)=><article key={message.id??`${message.role}-${index}`} className={`task-message ${message.role}`}><div className="message-author">{message.role==="assistant"?<><span>✦</span>Resolve</>:"You"}</div><div className="message-content">{message.content.split("\n").map((line,lineIndex)=><span key={lineIndex}>{line||<br/>}</span>)}</div>{message.sources&&message.sources.length>0&&<div className="task-sources"><b>Sources</b>{message.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>}</article>)}{taskAgentLoading&&<div className="task-agent-thinking"><span/><span/><span/> Resolve is thinking and researching…</div>}</div><form className="task-chat-form" onSubmit={event=>{event.preventDefault();void runTaskAgent(activeTask.id,taskChatInput)}}><textarea value={taskChatInput} onChange={event=>setTaskChatInput(event.target.value)} placeholder="Answer Resolve or ask it to research, strategize, or organize the next step…" rows={2} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void runTaskAgent(activeTask.id,taskChatInput)}}}/><button aria-label="Send to Resolve" disabled={taskAgentLoading||!taskChatInput.trim()}>↑</button></form></div>
        :<div className="empty-task-state"><span>✦</span><h2>No tasks yet</h2><p>Create a task with a title, description, and optional deadline. Resolve will ask follow-up questions, research it, and help organize the work.</p><button onClick={()=>setCreatingTask(true)}>＋ New task</button></div>}
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
