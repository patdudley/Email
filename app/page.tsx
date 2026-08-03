"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mail = { id:string|number; threadId?:string; sender:string; email:string; initials:string; tone:string; subject:string; preview:string; time:string; date:string; unread?:boolean; starred?:boolean; body:string[]; html?:string; images?:Array<{src:string;alt:string}>; attachment?:string };
type Account = {email:string;displayName:string;plan:"free"|"pro";subscriptionStatus:string|null;cancelAtPeriodEnd:boolean;currentPeriodEnd:number|null;usage:number;limit:number;hasBillingAccount:boolean};
type TaskIntegration = "online_presence"|"drybar_payroll";
type TaskRecord = {id:string;title:string;description:string;deadline:string|null;recurrenceType:"one_time"|"recurring";recurrenceEvery:number|null;recurrenceUnit:"day"|"week"|"month"|null;status:string;sourceThreadId:string|null;integrationType:TaskIntegration|null;createdAt:number;updatedAt:number;currentPeriodCompletedAt:number|null;completionEvidence:{threadId:string|null;subject:string|null;sender:string|null;date:string|null;summary:string|null}|null};
type TaskMessage = {id?:string;role:"user"|"assistant";content:string;sources?:Array<{url:string;title:string}>;createdAt:number};
type RecipientSuggestion = {name:string;email:string;count:number};
type SearchPreview = {contacts:RecipientSuggestion[];emails:Mail[]};
type OutgoingAttachment = {id:string;name:string;type:string;size:number;data:string};
type MailDensity = "compact"|"standard"|"large";

const taskIntegrations:Record<TaskIntegration,{name:string;mark:string;url:string;description:string}>={
  online_presence:{name:"Online Presence",mark:"O",url:"https://locallift-audit.patduds.chatgpt.site",description:"Run a verified Google listing and website audit with LocalLift."},
  drybar_payroll:{name:"Drybar Payroll",mark:"D",url:"https://drybar-payroll-converter.patduds.chatgpt.site",description:"Convert Booker reports into a human-reviewed Paychex import."},
};

function EmailImage({image}:{image:{src:string;alt:string}}){
  // Remote email assets cannot use the framework image optimizer because their hosts are arbitrary.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image.src} alt={image.alt} loading="lazy" referrerPolicy="no-referrer"/>;
}

function imageUrlsInText(text:string):string[]{
  return [...text.matchAll(/View image:\s*\((https?:\/\/[^)\s]+)\)/gi)].map(match=>match[1].replace(/&amp;/gi,"&"));
}

function inboxDate(value:string):string{
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return value;
  const currentYear=new Date().getFullYear();
  return new Intl.DateTimeFormat("en-US",parsed.getFullYear()===currentYear?{month:"short",day:"numeric"}:{month:"numeric",day:"numeric",year:"2-digit"}).format(parsed);
}

function taskCompletionLabel(task:TaskRecord):string{
  if(task.recurrenceType!=="recurring")return "Completed";
  if(task.recurrenceUnit==="month")return "Paid this month";
  if(task.recurrenceUnit==="week")return "Completed this week";
  return "Completed today";
}

function taskIsCompleted(task:TaskRecord):boolean{
  return task.status==="completed"||Boolean(task.currentPeriodCompletedAt);
}

function dayGreeting():string{
  const hour=new Date().getHours();
  return hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
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
  const [searchPreview,setSearchPreview]=useState<SearchPreview>({contacts:[],emails:[]});
  const [searchPreviewOpen,setSearchPreviewOpen]=useState(false);
  const [searchPreviewLoading,setSearchPreviewLoading]=useState(false);
  const searchPreviewTimer=useRef<number|null>(null);
  const searchPreviewRequestId=useRef(0);
  const [compose,setCompose]=useState(false);
  const [replying,setReplying]=useState(false);
  const [replyMode,setReplyMode]=useState<"reply"|"replyAll"|"forward">("reply");
  const [reply,setReply]=useState("");
  const [forwardTo,setForwardTo]=useState("");
  const [composeTo,setComposeTo]=useState("");
  const [composeCc,setComposeCc]=useState("");
  const [composeSubject,setComposeSubject]=useState("");
  const [composeBody,setComposeBody]=useState("");
  const [composeAttachments,setComposeAttachments]=useState<OutgoingAttachment[]>([]);
  const [replyAttachments,setReplyAttachments]=useState<OutgoingAttachment[]>([]);
  const composeEditor=useRef<HTMLDivElement>(null);
  const composeFileInput=useRef<HTMLInputElement>(null);
  const replyFileInput=useRef<HTMLInputElement>(null);
  const [showCc,setShowCc]=useState(false);
  const [recipientSuggestions,setRecipientSuggestions]=useState<RecipientSuggestion[]>([]);
  const [recipientSuggestionsOpen,setRecipientSuggestionsOpen]=useState(false);
  const [recipientSuggestionsLoading,setRecipientSuggestionsLoading]=useState(false);
  const [recipientContactsAuthorized,setRecipientContactsAuthorized]=useState<boolean|null>(null);
  const [recipientContactsUnavailable,setRecipientContactsUnavailable]=useState(false);
  const [activeRecipientSuggestion,setActiveRecipientSuggestion]=useState(0);
  const [recipientSuggestionQuery,setRecipientSuggestionQuery]=useState("");
  const recipientSearchTimer=useRef<number|null>(null);
  const recipientRequestId=useRef(0);
  const [savedTasks,setSavedTasks]=useState<TaskRecord[]>([]);
  const [taskFilter,setTaskFilter]=useState<"active"|"completed">("active");
  const [activeTaskId,setActiveTaskId]=useState<string|null>(null);
  const [taskMessages,setTaskMessages]=useState<TaskMessage[]>([]);
  const [tasksLoading,setTasksLoading]=useState(true);
  const [taskAgentLoading,setTaskAgentLoading]=useState(false);
  const [creatingTask,setCreatingTask]=useState(false);
  const [newTaskTitle,setNewTaskTitle]=useState("");
  const [newTaskDescription,setNewTaskDescription]=useState("");
  const [newTaskDeadline,setNewTaskDeadline]=useState("");
  const [newTaskRecurrenceType,setNewTaskRecurrenceType]=useState<"one_time"|"recurring">("one_time");
  const [newTaskRecurrenceEvery,setNewTaskRecurrenceEvery]=useState(1);
  const [newTaskRecurrenceUnit,setNewTaskRecurrenceUnit]=useState<"day"|"week"|"month">("week");
  const [newTaskIntegration,setNewTaskIntegration]=useState<TaskIntegration|null>(null);
  const [taskChatInput,setTaskChatInput]=useState("");
  const [toast,setToast]=useState("");
  const [answer,setAnswer]=useState<{text:string;ids:Array<string|number>;query?:string;count?:number}|null>(null);
  const [searchMode,setSearchMode]=useState(false);
  const [gmailSearchQuery,setGmailSearchQuery]=useState("");
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
  const [mailDensity,setMailDensity]=useState<MailDensity>("compact");
  const gmailMutationId=useRef(0);
  const taskCompletionLastScan=useRef(0);
  const taskCompletionScanRunning=useRef(false);
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
  const activeTaskCount=savedTasks.filter(task=>!taskIsCompleted(task)).length;
  const completedTaskCount=savedTasks.filter(taskIsCompleted).length;
  const visibleTasks=savedTasks.filter(task=>taskFilter==="completed"?taskIsCompleted(task):!taskIsCompleted(task));
  const briefingMail=mail.filter(message=>unread.includes(message.id)).slice(0,3);
  const briefingTasks=savedTasks.filter(task=>!taskIsCompleted(task)).slice(0,2);
  const briefingName=account?.displayName?.trim().split(/\s+/)[0]??"there";
  const recipientQuery=composeTo.split(",").at(-1)?.trim().toLowerCase()??"";
  const visibleRecipientSuggestions=recipientSuggestions.filter(recipient=>!recipientQuery||recipientSuggestionQuery===recipientQuery||recipient.name.toLowerCase().includes(recipientQuery)||recipient.email.includes(recipientQuery)).slice(0,recipientQuery.length>=2?16:8);
  const gmailPageSize=searchMode?25:50;
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
  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      const saved=window.localStorage.getItem("resolve-mail-density");
      if(saved==="compact"||saved==="standard"||saved==="large")setMailDensity(saved);
    });
    return()=>window.cancelAnimationFrame(frame);
  },[]);
  function notify(text:string){setToast(text);window.setTimeout(()=>setToast(""),2300)}
  async function convert(message:Mail){
    const linked=savedTasks.find(task=>task.sourceThreadId===String(message.threadId??message.id));
    if(linked){setActiveTaskId(linked.id);await openTask(linked.id);setView("tasks");setOpenId(null);return}
    await createTask({title:message.subject,description:`From ${message.sender} <${message.email}>\n\n${message.preview}\n\n${message.body.join("\n\n")}`,deadline:null,recurrenceType:"one_time",recurrenceEvery:null,recurrenceUnit:null,sourceThreadId:String(message.threadId??message.id)});
  }
  function chooseFolder(next:string){setView("mail");setFolder(next);setOpenId(null);setSelected([]);setAnswer(null);setSearchMode(false);setGmailSearchQuery("");setSearch("");setGmailPage(0);setGmailPageTokens([""]);setGmailNextPageToken(null);if(gmail.connected)void loadGmail(next,"",0)}
  function openMessage(message:Mail){
    setView("mail");setOpenId(message.id);if(!searchMode)setAnswer(null);
    if(unread.includes(message.id)){
      setUnread(current=>current.filter(id=>id!==message.id));
      if(gmail.connected)void fetch("/api/gmail/threads/modify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:[String(message.id)],action:"read"})});
    }
    if(gmail.connected)void loadGmailThread(String(message.id));
  }
  function archiveMessage(event:React.MouseEvent<HTMLButtonElement>,message:Mail){
    event.stopPropagation();
    if(gmail.connected){void gmailAction([message.id],"archive");return}
    setLocations(current=>({...current,[String(message.id)]:"Archive"}));notify("Email archived");
  }
  function changeMailDensity(value:MailDensity){setMailDensity(value);window.localStorage.setItem("resolve-mail-density",value)}
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
    setReplyAttachments([]);
    setReply(mode==="forward"?`\n\n---------- Forwarded message ----------\nFrom: ${opened.sender} <${opened.email}>\nDate: ${opened.date}\nSubject: ${opened.subject}\n\n${opened.body.join("\n\n")}`:"");
    setReplying(true);
  }
  async function sendReply(){if(!opened)return;if(replyMode==="forward"&&!forwardTo.trim()){notify("Add a recipient before forwarding");return}if(!reply.trim()&&!replyAttachments.length){notify("Add a message or attachment");return}if(gmail.connected){const response=await sendGmail({to:replyMode==="forward"?forwardTo:opened.email,subject:`${replyMode==="forward"?"Fwd":"Re"}: ${opened.subject.replace(/^(re|fwd):\s*/i,"")}`,body:reply,attachments:replyAttachments,threadId:replyMode==="forward"?undefined:opened.threadId});if(!response)return}setReplying(false);setReply("");setForwardTo("");setReplyAttachments([]);notify(replyMode==="forward"?"Email forwarded":"Reply sent")}
  async function sendCompose(){if(!composeTo.trim()){notify("Add a recipient before sending");return}const html=composeEditor.current?.innerHTML??composeBody;const body=composeEditor.current?.innerText??"";if(!body.trim()&&!composeAttachments.length){notify("Add a message or attachment");return}if(gmail.connected&&!(await sendGmail({to:composeTo,cc:composeCc,subject:composeSubject,body,html,attachments:composeAttachments})))return;setCompose(false);setComposeTo("");setComposeCc("");setComposeSubject("");setComposeBody("");setComposeAttachments([]);setShowCc(false);setRecipientSuggestionsOpen(false);notify("Message sent")}
  async function addAttachments(files:FileList|null,target:"compose"|"reply"){
    if(!files?.length)return;
    const current=target==="compose"?composeAttachments:replyAttachments;
    const picked=[...files].slice(0,5-current.length);
    if(current.reduce((total,file)=>total+file.size,0)+picked.reduce((total,file)=>total+file.size,0)>10*1024*1024){notify("Attachments must total 10 MB or less");return}
    const next=await Promise.all(picked.map(file=>new Promise<OutgoingAttachment>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({id:crypto.randomUUID(),name:file.name,type:file.type||"application/octet-stream",size:file.size,data:String(reader.result??"").split(",")[1]??""});reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})));
    if(target==="compose")setComposeAttachments(items=>[...items,...next]);else setReplyAttachments(items=>[...items,...next]);
  }
  function formatCompose(command:string,value?:string){composeEditor.current?.focus();document.execCommand(command,false,value);setComposeBody(composeEditor.current?.innerHTML??"")}
  function addComposeLink(){const input=window.prompt("Paste a link URL")?.trim();if(!input)return;const url=/^https?:\/\//i.test(input)?input:`https://${input}`;if(window.getSelection()?.isCollapsed){const safe=url.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");formatCompose("insertHTML",`<a href="${safe}">${safe}</a>`)}else formatCompose("createLink",url)}
  async function loadRecipientSuggestions(query=recipientQuery){
    setRecipientSuggestionsOpen(true);setActiveRecipientSuggestion(0);
    const normalized=query.trim().toLowerCase();
    if(!gmail.connected)return;
    if(!normalized&&!recipientSuggestions.length){
      const recent=new Map<string,RecipientSuggestion>();
      for(const message of mail){const email=message.email.trim().toLowerCase();if(!email||email===gmail.email?.toLowerCase())continue;const current=recent.get(email);recent.set(email,current?{...current,count:current.count+1}:{name:message.sender,email,count:1})}
      const immediate=[...recent.values()].sort((a,b)=>b.count-a.count).slice(0,40);if(immediate.length)setRecipientSuggestions(immediate);
    }
    const requestId=++recipientRequestId.current;
    setRecipientSuggestionsLoading(true);
    const applyResults=(items:RecipientSuggestion[])=>{
      if(requestId!==recipientRequestId.current)return;
      setRecipientSuggestions(current=>{
        const merged=new Map<string,RecipientSuggestion>();
        for(const recipient of [...items,...current]){
          if(normalized&&!`${recipient.name} ${recipient.email}`.toLowerCase().includes(normalized))continue;
          const existing=merged.get(recipient.email);if(!existing||recipient.count>existing.count)merged.set(recipient.email,recipient);
        }
        return [...merged.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name)).slice(0,40);
      });
      setRecipientSuggestionQuery(normalized);
    };
    const lookups:Array<Promise<void>>=[];
    if(normalized.length>=2)lookups.push(fetch(`/api/gmail/suggestions?q=${encodeURIComponent(normalized)}`,{cache:"no-store"}).then(async response=>{const json=await response.json() as {contacts?:RecipientSuggestion[];error?:string};if(!response.ok)throw new Error(json.error??"Could not search Gmail");applyResults(json.contacts??[])}));
    const params=new URLSearchParams();if(normalized)params.set("q",normalized);
    lookups.push(fetch(`/api/gmail/recipients${params.size?`?${params}`:""}`,{cache:"no-store"}).then(async response=>{const json=await response.json() as {recipients?:RecipientSuggestion[];contactsAuthorized?:boolean;contactsUnavailable?:boolean;error?:string};if(!response.ok)throw new Error(json.error??"Could not load recipients");setRecipientContactsAuthorized(Boolean(json.contactsAuthorized));setRecipientContactsUnavailable(Boolean(json.contactsUnavailable));applyResults(json.recipients??[])}));
    const results=await Promise.allSettled(lookups);
    if(requestId===recipientRequestId.current){setRecipientSuggestionsLoading(false);if(results.every(result=>result.status==="rejected"))notify("Could not search Gmail recipients")}
  }
  function scheduleRecipientSearch(value:string){
    if(recipientSearchTimer.current)window.clearTimeout(recipientSearchTimer.current);
    recipientRequestId.current+=1;
    const query=value.split(",").at(-1)?.trim().toLowerCase()??"";
    recipientSearchTimer.current=window.setTimeout(()=>void loadRecipientSuggestions(query),60);
  }
  function selectRecipient(recipient:RecipientSuggestion){
    const recipients=composeTo.split(",");recipients[recipients.length-1]=recipient.email;setComposeTo(recipients.map(value=>value.trim()).filter(Boolean).join(", "));setRecipientSuggestionsOpen(false);setActiveRecipientSuggestion(0);
  }
  function handleRecipientKey(event:React.KeyboardEvent<HTMLInputElement>){
    if(!recipientSuggestionsOpen||!visibleRecipientSuggestions.length)return;
    if(event.key==="ArrowDown"){event.preventDefault();setActiveRecipientSuggestion(current=>(current+1)%visibleRecipientSuggestions.length)}
    else if(event.key==="ArrowUp"){event.preventDefault();setActiveRecipientSuggestion(current=>(current-1+visibleRecipientSuggestions.length)%visibleRecipientSuggestions.length)}
    else if(event.key==="Enter"||event.key==="Tab"){event.preventDefault();selectRecipient(visibleRecipientSuggestions[Math.min(activeRecipientSuggestion,visibleRecipientSuggestions.length-1)])}
    else if(event.key==="Escape"){setRecipientSuggestionsOpen(false)}
  }
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
  function applyTaskTemplate(integration:TaskIntegration|null){
    setNewTaskIntegration(integration);
    if(integration==="online_presence"){
      setNewTaskTitle("Monitor a business’s online presence");setNewTaskDescription("Use LocalLift to audit the business’s Google listing and website, identify verified issues, and organize the highest-impact next actions. Business name and website: ");setNewTaskRecurrenceType("recurring");setNewTaskRecurrenceEvery(1);setNewTaskRecurrenceUnit("month");
    }else if(integration==="drybar_payroll"){
      setNewTaskTitle("Prepare Drybar payroll");setNewTaskDescription("Use the Drybar Payroll Converter to process the manager-corrected Booker payroll report and matching timeclock report, resolve every blocking exception, review totals, and prepare the Paychex SPI CSV for human approval. Shop and pay period: ");setNewTaskRecurrenceType("recurring");setNewTaskRecurrenceEvery(2);setNewTaskRecurrenceUnit("week");
    }else{
      setNewTaskTitle("");setNewTaskDescription("");setNewTaskRecurrenceType("one_time");setNewTaskRecurrenceEvery(1);setNewTaskRecurrenceUnit("week");
    }
  }
  async function createTask(input?:{title:string;description:string;deadline:string|null;recurrenceType:"one_time"|"recurring";recurrenceEvery:number|null;recurrenceUnit:"day"|"week"|"month"|null;sourceThreadId?:string;integrationType?:TaskIntegration|null}){
    const title=input?.title??newTaskTitle.trim();
    const description=input?.description??newTaskDescription.trim();
    if(!title||!description){notify("Add a title and description");return}
    setTaskAgentLoading(true);
    try{
      const response=await fetch("/api/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,description,deadline:input?.deadline??(newTaskDeadline||null),recurrenceType:input?.recurrenceType??newTaskRecurrenceType,recurrenceEvery:input?.recurrenceEvery??newTaskRecurrenceEvery,recurrenceUnit:input?.recurrenceUnit??newTaskRecurrenceUnit,sourceThreadId:input?.sourceThreadId,integrationType:input?(input.integrationType??null):newTaskIntegration})});
      const json=await response.json() as {task?:TaskRecord;error?:string;signInUrl?:string};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setAccountOpen(true);return}
      if(!response.ok||!json.task)throw new Error(json.error??"Could not create task");
      setSavedTasks(current=>[json.task!,...current]);setActiveTaskId(json.task.id);setTaskFilter("active");setCreatingTask(false);setView("tasks");setOpenId(null);setNewTaskTitle("");setNewTaskDescription("");setNewTaskDeadline("");setNewTaskRecurrenceType("one_time");setNewTaskRecurrenceEvery(1);setNewTaskRecurrenceUnit("week");setNewTaskIntegration(null);setTaskMessages([]);
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
  async function updateTaskStatus(task:TaskRecord,status:"active"|"completed"){
    const response=await fetch("/api/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:task.id,status})});
    const json=await response.json() as {error?:string;updatedAt?:number;recurringOccurrence?:boolean};
    if(!response.ok){notify(json.error??"Could not update task");return}
    await loadTasks();setActiveTaskId(task.id);
    setTaskFilter(status);
    notify(json.recurringOccurrence?(status==="completed"?"Current occurrence completed":"Current occurrence reopened"):(status==="completed"?"Task completed":"Task reopened"));
  }

  async function detectTaskCompletions(){
    if(Date.now()-taskCompletionLastScan.current<60_000||taskCompletionScanRunning.current)return;
    taskCompletionScanRunning.current=true;
    try{
      const response=await fetch("/api/tasks/detect-completions",{method:"POST"});
      const json=await response.json() as {detected?:number;completions?:Array<{taskTitle:string;subject:string}>};
      if(response.ok){
        taskCompletionLastScan.current=Date.now();
        if((json.detected??0)>0){await loadTasks();const completion=json.completions?.[0];notify(completion?`${completion.taskTitle} completed from “${completion.subject}”`:`${json.detected} task${json.detected===1?"":"s"} completed from email`)}
      }
    }catch{/* Completion detection is background-only and must never block the inbox. */}
    finally{taskCompletionScanRunning.current=false}
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
    try{const params=new URLSearchParams({folder:nextFolder});if(pageToken)params.set("pageToken",pageToken);const response=await fetch(`/api/gmail/threads?${params}`,{cache:"no-store"});const json=await response.json() as {threads?:Mail[];nextPageToken?:string|null;error?:string};if(!response.ok)throw new Error(json.error??"Could not load Gmail");const threads=json.threads??[];setLiveMail(threads);setUnread(threads.filter(message=>message.unread).map(message=>message.id));setStarred(threads.filter(message=>message.starred).map(message=>message.id));setGmailPage(targetPage);setGmailNextPageToken(json.nextPageToken??null);setGmailPageTokens(current=>{const next=current.slice(0,targetPage+1);next[targetPage]=pageToken;if(json.nextPageToken)next[targetPage+1]=json.nextPageToken;return next});if(nextFolder==="Inbox"&&targetPage===0&&!pageToken)void detectTaskCompletions()}catch(error){notify(error instanceof Error?error.message:"Could not load Gmail")}finally{setMailLoading(false)}
  }
  async function loadGmailThread(threadId:string){
    try{const response=await fetch(`/api/gmail/threads?threadId=${encodeURIComponent(threadId)}`,{cache:"no-store"});const json=await response.json() as {thread?:Mail;error?:string};if(!response.ok||!json.thread)throw new Error(json.error??"Could not load this email");setLiveMail(current=>current.map(message=>String(message.id)===threadId?{...message,...json.thread}:message))}catch(error){notify(error instanceof Error?error.message:"Could not load this email")}
  }
  async function loadGmailSearchPage(query:string,pageToken:string,targetPage:number){
    setMailLoading(true);
    try{const params=new URLSearchParams({query});if(pageToken)params.set("pageToken",pageToken);const response=await fetch(`/api/gmail/threads?${params}`,{cache:"no-store"});const json=await response.json() as {threads?:Mail[];nextPageToken?:string|null;error?:string};if(!response.ok)throw new Error(json.error??"Could not search Gmail");const threads=json.threads??[];setLiveMail(threads);setUnread(threads.filter(message=>message.unread).map(message=>message.id));setStarred(threads.filter(message=>message.starred).map(message=>message.id));setGmailPage(targetPage);setGmailNextPageToken(json.nextPageToken??null);setGmailPageTokens(current=>{const next=current.slice(0,targetPage+1);next[targetPage]=pageToken;if(json.nextPageToken)next[targetPage+1]=json.nextPageToken;return next})}catch(error){notify(error instanceof Error?error.message:"Could not search Gmail")}finally{setMailLoading(false)}
  }
  function clearEmailSearch(){setAnswer(null);setSearchMode(false);setGmailSearchQuery("");setSearch("");setGmailPage(0);setGmailPageTokens([""]);setGmailNextPageToken(null);void loadGmail(folder,"",0)}
  function changeGmailPage(direction:-1|1){if(!gmail.connected||mailLoading)return;const target=gmailPage+direction;if(target<0)return;const token=direction===1?gmailNextPageToken:gmailPageTokens[target];if(token==null)return;setOpenId(null);setSelected([]);if(searchMode)void loadGmailSearchPage(gmailSearchQuery,token,target);else void loadGmail(folder,token,target)}
  async function gmailAction(ids:Array<string|number>,action:string,preserveOpen=false){
    const mutationId=++gmailMutationId.current;
    const keys=new Set(ids.map(String));
    const snapshot={mail:liveMail,selected,unread,starred,openId};
    const removeFromView=(action==="archive"&&folder==="Inbox")||(action==="spam"&&folder!=="Spam")||(action==="trash"&&folder!=="Trash")||(action==="restore"&&folder==="Trash")||(action==="unstar"&&folder==="Starred");
    if(removeFromView)setLiveMail(current=>current.filter(message=>!keys.has(String(message.id))));
    if(action==="read")setUnread(current=>current.filter(id=>!keys.has(String(id))));
    if(action==="unread")setUnread(current=>[...new Set([...current,...ids])]);
    if(action==="star")setStarred(current=>[...new Set([...current,...ids])]);
    if(action==="unstar")setStarred(current=>current.filter(id=>!keys.has(String(id))));
    setSelected(current=>current.filter(id=>!keys.has(String(id))));
    const movesMessage=["archive","spam","trash","restore"].includes(action);
    if(movesMessage&&!preserveOpen)setOpenId(null);
    const labels:Record<string,string>={archive:"Archived",spam:"Moved to spam",trash:"Moved to trash",restore:"Moved to inbox",read:"Marked read",unread:"Marked unread",star:"Starred",unstar:"Unstarred"};
    notify(`${ids.length>1?`${ids.length} emails`:"Email"} ${labels[action]?.toLowerCase()??"updated"}`);
    try{
      const response=await fetch("/api/gmail/threads/modify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:ids.map(String),action})});
      const json=await response.json() as {error?:string};
      if(!response.ok)throw new Error(json.error??"Gmail action failed");
    }catch(error){
      if(mutationId===gmailMutationId.current){setLiveMail(snapshot.mail);setSelected(snapshot.selected);setUnread(snapshot.unread);setStarred(snapshot.starred);setOpenId(snapshot.openId)}
      else if(searchMode)void loadGmailSearchPage(gmailSearchQuery,gmailPageTokens[gmailPage]??"",gmailPage);else void loadGmail(folder,gmailPageTokens[gmailPage]??"",gmailPage);
      notify(error instanceof Error?`${error.message} — change reversed`:"Gmail action failed — change reversed");
    }
  }
  async function sendGmail(message:{to:string;cc?:string;subject:string;body:string;html?:string;attachments?:OutgoingAttachment[];threadId?:string}){try{const response=await fetch("/api/gmail/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(message)});const json=await response.json() as {error?:string};if(!response.ok)throw new Error(json.error??"Could not send email");return true}catch(error){notify(error instanceof Error?error.message:"Could not send email");return false}}
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
  function localSearchSuggestions(query:string):SearchPreview{
    const needle=query.trim().toLowerCase();
    if(!needle)return {contacts:[],emails:[]};
    const emails=mail.filter(message=>`${message.sender} ${message.email} ${message.subject} ${message.preview}`.toLowerCase().includes(needle)).slice(0,8);
    const contacts=new Map<string,RecipientSuggestion>();
    for(const message of mail){
      if(!`${message.sender} ${message.email}`.toLowerCase().includes(needle))continue;
      const email=message.email.trim().toLowerCase();if(!email||email===gmail.email?.toLowerCase())continue;
      const current=contacts.get(email);contacts.set(email,current?{...current,count:current.count+1}:{name:message.sender,email,count:1});
    }
    return {contacts:[...contacts.values()].sort((a,b)=>b.count-a.count).slice(0,6),emails};
  }
  function scheduleSearchPreview(value:string){
    setSearch(value);
    const query=value.trim();
    if(searchPreviewTimer.current)window.clearTimeout(searchPreviewTimer.current);
    if(!query){setSearchPreviewOpen(false);setSearchPreview({contacts:[],emails:[]});setSearchPreviewLoading(false);return}
    setSearchPreview(localSearchSuggestions(query));setSearchPreviewOpen(true);
    if(!gmail.connected||query.length<2){setSearchPreviewLoading(false);return}
    setSearchPreviewLoading(true);
    searchPreviewTimer.current=window.setTimeout(async()=>{
      const requestId=++searchPreviewRequestId.current;
      try{
        const response=await fetch(`/api/gmail/suggestions?q=${encodeURIComponent(query)}`,{cache:"no-store"});
        const json=await response.json() as {contacts?:RecipientSuggestion[];emails?:Mail[];error?:string};
        if(!response.ok)throw new Error(json.error??"Could not load suggestions");
        if(requestId!==searchPreviewRequestId.current)return;
        const local=localSearchSuggestions(query);
        const contacts=new Map<string,RecipientSuggestion>();
        for(const contact of [...(json.contacts??[]),...local.contacts])if(!contacts.has(contact.email))contacts.set(contact.email,contact);
        const emails=new Map<string,Mail>();
        for(const message of [...(json.emails??[]),...local.emails])if(!emails.has(String(message.id)))emails.set(String(message.id),message);
        setSearchPreview({contacts:[...contacts.values()].slice(0,6),emails:[...emails.values()].slice(0,8)});
      }catch{ /* Local suggestions remain available if Gmail's preview request fails. */ }
      finally{if(requestId===searchPreviewRequestId.current)setSearchPreviewLoading(false)}
    },90);
  }
  function openSearchSuggestion(message:Mail){
    setSearchPreviewOpen(false);setAnswer(null);setView("mail");setOpenId(message.id);
    setLiveMail(current=>current.some(item=>String(item.id)===String(message.id))?current.map(item=>String(item.id)===String(message.id)?{...item,...message}:item):[message,...current]);
    if(gmail.connected)void loadGmailThread(String(message.threadId??message.id));
  }
  async function runEmailSearch(question:string){
    if(!question||aiLoading)return;
    setSearchPreviewOpen(false);
    setAiLoading(true);
    try{
      const searchResponse=await fetch("/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,searchOnly:true})});
      const searchJson=await searchResponse.json() as {matches?:Mail[];nextPageToken?:string|null;searchQuery?:string;error?:string;signInUrl?:string};
      if(searchResponse.status===401){if(searchJson.signInUrl)setSignInUrl(searchJson.signInUrl);setAccountOpen(true);return}
      if(!searchResponse.ok){notify(searchJson.error??"Email search is unavailable");return}
      const matches=searchJson.matches??[];setView("mail");setOpenId(null);setSelected([]);setSearchMode(true);setGmailSearchQuery(searchJson.searchQuery??question);setLiveMail(matches);setUnread(matches.filter(message=>message.unread).map(message=>message.id));setStarred(matches.filter(message=>message.starred).map(message=>message.id));setGmailPage(0);setGmailPageTokens(searchJson.nextPageToken?["",searchJson.nextPageToken]:[""]);setGmailNextPageToken(searchJson.nextPageToken??null);
      if(!matches.length){setAnswer({text:`No emails matched “${question}”.`,ids:[],query:question,count:0});return}
      setAnswer({text:"Summarizing the recent matches…",ids:matches.map(message=>message.id),query:question,count:matches.length});
      const response=await fetch("/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,skipGmailSearch:true,emails:matches.map(({id,sender,email,subject,date,preview,body})=>({id,sender,email,subject,date,preview,body}))})});
      const json=await response.json() as {answer?:string;error?:string;signInUrl?:string;upgradeRequired?:boolean;usage?:number;limit?:number};
      if(response.status===401){if(json.signInUrl)setSignInUrl(json.signInUrl);setAccountOpen(true);return}
      if(json.upgradeRequired){setAccountOpen(true);await loadAccount(false);setAnswer({text:"Matching emails are shown below. Upgrade to continue using AI summaries.",ids:matches.map(message=>message.id),query:question,count:matches.length});notify(json.error??"Monthly AI limit reached");return}
      if(!response.ok||!json.answer){setAnswer({text:"Matching emails are shown below, but the AI summary is temporarily unavailable.",ids:matches.map(message=>message.id),query:question,count:matches.length});return}
      setAnswer({text:json.answer,ids:matches.map(message=>message.id),query:question,count:matches.length});if(account&&typeof json.usage==="number")setAccount({...account,usage:json.usage,limit:json.limit??account.limit});
    }catch{notify("AI search is unavailable")}finally{setAiLoading(false)}
  }
  function askEmail(e:React.FormEvent){e.preventDefault();void runEmailSearch(search.trim())}

  return <main className={`app ${view==="tasks"?"tasks-mode":""}`}>
    {view!=="tasks"&&<aside className="sidebar">
      <div className="brand"><span>R</span><b>Resolve</b></div>
      <div className="sidebar-view-toggle" aria-label="Switch workspace"><button className={view==="mail"?"active":""} onClick={()=>{setView("mail");setOpenId(null)}}>Mail</button><button className={view==="tasks"?"active":""} onClick={()=>{setView("tasks");setOpenId(null)}}>Tasks <span>{activeTaskCount}</span></button></div>
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
    </aside>}

    <section className="main">
      <header className="topbar">
        <div className={`top-view-toggle ${view==="tasks"?"task-switcher":"mail-mobile-switcher"}`} aria-label="Switch workspace"><button className={view==="mail"?"active":""} onClick={()=>{setView("mail");setOpenId(null)}}>Mail</button><button className={view==="tasks"?"active":""} onClick={()=>{setView("tasks");setOpenId(null)}}>Tasks <span>{activeTaskCount}</span></button></div>
        <form className={`ai-search ${aiLoading?"loading":""}`} onSubmit={askEmail} onBlur={()=>window.setTimeout(()=>setSearchPreviewOpen(false),120)}>
          <span>✦</span>
          <input value={search} onChange={e=>scheduleSearchPreview(e.target.value)} onFocus={()=>search.trim()&&setSearchPreviewOpen(true)} onKeyDown={e=>{if(e.key==="Escape")setSearchPreviewOpen(false)}} placeholder={aiLoading?"Searching your email…":"Ask anything about your email…"} disabled={aiLoading} role="combobox" aria-autocomplete="list" aria-expanded={searchPreviewOpen} aria-controls="email-search-suggestions"/>
          <button aria-label="Ask Resolve" disabled={aiLoading}>{aiLoading?"…":"↑"}</button>
          {searchPreviewOpen&&search.trim()&&<div className="search-preview" id="email-search-suggestions" role="listbox">
            {searchPreview.contacts.length>0&&<section><b>People</b>{searchPreview.contacts.map(contact=><button type="button" role="option" aria-selected="false" key={contact.email} onMouseDown={e=>e.preventDefault()} onClick={()=>{setSearch(contact.email);void runEmailSearch(contact.email)}}><span className="search-contact-avatar">{contact.name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()}</span><div><strong>{contact.name}</strong><small>{contact.email}</small></div></button>)}</section>}
            {searchPreview.emails.length>0&&<section><b>Recent matching emails</b>{searchPreview.emails.map(message=><button type="button" role="option" aria-selected="false" key={message.id} onMouseDown={e=>e.preventDefault()} onClick={()=>openSearchSuggestion(message)}><span className="search-mail-icon">✉</span><div><strong>{message.subject}</strong><small>{message.sender} · {message.preview}</small></div><time>{message.time}</time></button>)}</section>}
            {searchPreviewLoading&&!searchPreview.contacts.length&&!searchPreview.emails.length&&<p>Searching Gmail…</p>}
            {!searchPreviewLoading&&!searchPreview.contacts.length&&!searchPreview.emails.length&&<p>No instant matches yet. Search all email below.</p>}
            <button type="button" className="search-all-email" onMouseDown={e=>e.preventDefault()} onClick={()=>void runEmailSearch(search.trim())}><span>⌕</span><strong>Search all email for “{search.trim()}”</strong><kbd>Enter</kbd></button>
          </div>}
        </form>
        <button className="avatar" aria-label="Open account and billing" onClick={()=>void loadAccount(true)}>{account?.displayName?.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"PD"}</button>
      </header>
      {answer&&<section className={`ai-answer ${searchMode?"search-summary":""}`}><header><span>✦</span><b>{searchMode?`Summary of ${answer.count??0} recent matching email${answer.count===1?"":"s"}`:"Resolve"}</b><button aria-label={searchMode?"Clear email search":"Close answer"} onClick={()=>searchMode?clearEmailSearch():setAnswer(null)}>×</button></header><p>{answer.text}</p>{!searchMode&&answer.ids.length>0&&<div>{answer.ids.map(id=>{const m=mail.find(item=>item.id===id);return m?<button key={id} onClick={()=>openMessage(m)}><span className={`initials tiny ${m.tone}`}>{m.initials}</span><span><b>{m.sender}</b><small>{m.subject}</small></span><i>Open →</i></button>:null})}</div>}</section>}
      {!answer&&<section className="ai-welcome" aria-live="polite"><header><span>✦</span><div><b>{dayGreeting()}, {briefingName}.</b><small>Here’s your Resolve summary</small></div></header>{gmailChecking||tasksLoading?<p>I’m checking your inbox and tasks for anything that needs your attention…</p>:briefingMail.length===0&&activeTaskCount===0?<p>You’re all caught up. There are no unread emails or active tasks right now.</p>:<><p>You have {unread.length} unread email{unread.length===1?"":"s"} in view and {activeTaskCount} active task{activeTaskCount===1?"":"s"}.</p><div>{briefingMail.map(message=><button key={message.id} onClick={()=>openMessage(message)}><span>Mail</span><b>{message.subject}</b><small>{message.sender}</small></button>)}{briefingTasks.map(task=><button key={task.id} onClick={()=>{setView("tasks");setTaskFilter("active");void openTask(task.id)}}><span>Task</span><b>{task.title}</b><small>{task.deadline?`Due ${new Date(`${task.deadline}T00:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}`:"No deadline"}</small></button>)}</div></>}</section>}

      {view==="mail"&&!opened&&<section className="inbox">
        <div className={`mail-tools ${selected.length?"has-selection":""}`}><button className="select-all" aria-label="Select all visible emails" aria-pressed={list.length>0&&list.every(m=>selected.includes(m.id))} onClick={toggleAll}>{list.length>0&&list.every(m=>selected.includes(m.id))?"✓":""}</button>{selected.length?<><strong>{selected.length} selected</strong><button className="bulk-action" onClick={toggleSelectedStar}>☆ Star</button><button className="bulk-action" onClick={toggleSelectedUnread}>○ Read/unread</button>{customFolders.length>0&&!gmail.connected&&<select key={selected.join("-")} className="bulk-move" aria-label="Move selected emails to folder" defaultValue="" onChange={e=>{if(e.target.value)moveSelected(e.target.value)}}><option value="" disabled>Move to folder…</option>{customFolders.map(name=><option key={name} value={name}>{name}</option>)}</select>}<button className="bulk-action" onClick={()=>moveSelected("Archive")}>▣ Archive</button><button className="bulk-action" onClick={()=>moveSelected("Spam")}>! Spam</button><button className="bulk-action danger" onClick={()=>moveSelected("Trash")}>♲ Trash</button></>:<>{searchMode?<><button aria-label="Clear email search" onClick={clearEmailSearch}>×</button><strong className="search-result-label">Results for “{answer?.query??gmailSearchQuery}”</strong></>:<button aria-label="Refresh inbox" onClick={()=>gmail.connected?void loadGmail(folder,gmailPageTokens[gmailPage]??"",gmailPage):notify("Connect Gmail to load your inbox")}>↻</button>}<select className="density-picker" aria-label="Inbox display size" title="Inbox display size" value={mailDensity} onChange={event=>changeMailDensity(event.target.value as MailDensity)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select><span/><small>{gmailChecking||mailLoading?"Loading…":list.length?`${gmailPage*gmailPageSize+1}–${gmailPage*gmailPageSize+list.length}`:"0"}</small><button aria-label="Previous email page" disabled={!gmail.connected||gmailPage===0||mailLoading} onClick={()=>changeGmailPage(-1)}>‹</button><button aria-label="Next email page" disabled={!gmail.connected||!gmailNextPageToken||mailLoading} onClick={()=>changeGmailPage(1)}>›</button></>}</div>
        <div className={`mail-list density-${mailDensity}`}>{list.map(m=><article key={m.id} className={`${unread.includes(m.id)?"unread ":""}${selected.includes(m.id)?"selected":""}`} onClick={()=>openMessage(m)}><button className="row-check" aria-label={`Select email from ${m.sender}`} aria-pressed={selected.includes(m.id)} onClick={e=>{e.stopPropagation();toggleSelected(m.id)}}>{selected.includes(m.id)?"✓":""}</button><button className={`row-star ${starred.includes(m.id)?"active":""}`} aria-label={`${starred.includes(m.id)?"Unstar":"Star"} email from ${m.sender}`} onClick={e=>{e.stopPropagation();toggleStar(m.id)}}>{starred.includes(m.id)?"★":"☆"}</button><span className={`initials ${m.tone}`}>{m.initials}</span><b>{m.sender}</b><div><strong>{m.subject}</strong><span className="ai-summary"><i>✦</i>{m.preview}</span></div>{savedTasks.some(task=>task.sourceThreadId===String(m.threadId??m.id))&&<em>Task</em>}<time dateTime={m.date}><b>{inboxDate(m.date)}</b><small>{m.time}</small></time><button className="row-archive" title="Archive" aria-label={`Archive email from ${m.sender}`} onClick={event=>archiveMessage(event,m)}>▣</button></article>)}{list.length===0&&(gmailChecking||mailLoading)&&<div className="mail-loading-state" role="status"><span/><span/><span/><p>{searchMode?"Searching all of Gmail…":"Loading your Gmail inbox…"}</p></div>}{list.length===0&&!gmailChecking&&!mailLoading&&<div className="empty-folder"><span>{gmail.connected?"✓":"M"}</span><h2>{searchMode?"No matching emails":gmail.connected?"No messages here":"Connect your Gmail"}</h2><p>{searchMode?`Gmail did not find messages matching “${gmailSearchQuery}”.`:gmail.connected?`Your ${folder.toLowerCase()} folder is clear.`:"Open Connectors to load your real inbox."}</p></div>}</div>
      </section>}

      {view==="mail"&&opened&&<section className="reader">
        <div className="reader-tools"><button data-tooltip="Back" aria-label="Back to message list" onClick={()=>{setOpenId(null);setReplying(false)}}>←</button>{(gmail.connected?folder==="Trash":Boolean(locations[String(opened.id)]))?<button data-tooltip="Move to Inbox" aria-label="Move to Inbox" onClick={restoreOpen}>↥</button>:<button data-tooltip="Archive" aria-label="Archive" onClick={()=>moveOpen("Archive")}>▣</button>}<button data-tooltip="Report spam" aria-label="Report spam" onClick={()=>moveOpen("Spam")}>!</button><button data-tooltip="Move to Trash" aria-label="Move to Trash" onClick={()=>moveOpen("Trash")}>♲</button><button data-tooltip="Snooze" aria-label="Snooze" onClick={()=>gmail.connected?notify("Gmail snooze is coming next"):moveOpen("Snoozed")}>◷</button><button data-tooltip="Mark unread" aria-label="Mark unread" onClick={()=>gmail.connected?void gmailAction([opened.id],"unread"):(setUnread(current=>[...new Set([...current,opened.id])]),setOpenId(null),notify("Email marked unread"))}>○</button><button data-tooltip={starred.includes(opened.id)?"Unstar":"Star"} aria-label={starred.includes(opened.id)?"Unstar":"Star"} className={starred.includes(opened.id)?"star-active":""} onClick={()=>toggleStar(opened.id)}>{starred.includes(opened.id)?"★":"☆"}</button><span/><button className="task-button" onClick={()=>void convert(opened)}>{savedTasks.some(task=>task.sourceThreadId===String(opened.threadId??opened.id))?"Open task":"＋ Add to tasks"}</button></div>
        <div className="message">
          <h1>{opened.subject}</h1>
          <div className="sender"><span className={`initials ${opened.tone}`}>{opened.initials}</span><div><b>{opened.sender}</b><p>{opened.email} · to me</p></div><time>{opened.date}</time></div>
          {opened.html?<EmailHtml html={opened.html}/>:<><div className="copy">{opened.body.map((part,index)=><EmailBodyText key={index} text={part}/>)}</div>{opened.images&&opened.images.filter(image=>!opened.body.flatMap(imageUrlsInText).includes(image.src)).length>0&&<div className="email-images">{opened.images.filter(image=>!opened.body.flatMap(imageUrlsInText).includes(image.src)).map((image,index)=><EmailImage key={`${image.src}-${index}`} image={image}/>)}</div>}</>}
          {opened.attachment&&<button className="attachment" onClick={()=>notify(`${opened.attachment} downloaded`)}><span>PDF</span><div><b>{opened.attachment}</b><small>248 KB</small></div><strong>↓</strong></button>}
          {!replying?<div className="reply-actions"><button onClick={()=>startReply("reply")}>↩ Reply</button><button onClick={()=>startReply("replyAll")}>↩ Reply all</button><button onClick={()=>startReply("forward")}>→ Forward</button><button onClick={()=>{setReplyMode("reply");setReply(`Hi ${opened.sender.split(" ")[0]},\n\nThanks for the update. I’ll take care of this and follow up shortly.\n\nBest,\nPat`);setReplyAttachments([]);setReplying(true)}}>✦ Draft reply</button></div>:<div className="reply-box"><div>{replyMode==="forward"?<>To <input aria-label="Forward recipient" autoFocus value={forwardTo} onChange={e=>setForwardTo(e.target.value)} placeholder="Recipient email"/></>:<>To <b>{opened.sender}</b>{replyMode==="replyAll"&&<span> · all recipients</span>}</>}</div><textarea autoFocus={replyMode!=="forward"} value={reply} onChange={e=>setReply(e.target.value)}/>{replyAttachments.length>0&&<div className="outgoing-attachments">{replyAttachments.map(file=><span key={file.id}>📎 <b>{file.name}</b><small>{Math.max(1,Math.round(file.size/1024))} KB</small><button aria-label={`Remove ${file.name}`} onClick={()=>setReplyAttachments(items=>items.filter(item=>item.id!==file.id))}>×</button></span>)}</div>}<footer><button className="send" onClick={sendReply}>{replyMode==="forward"?"Forward":"Send"}</button><input ref={replyFileInput} hidden type="file" multiple onChange={event=>{void addAttachments(event.target.files,"reply");event.target.value=""}}/><button onClick={()=>replyFileInput.current?.click()}>＋ Attach</button><span/><button onClick={()=>{setReplying(false);setReply("");setReplyAttachments([])}}>Discard</button></footer></div>}
        </div>
      </section>}

      {view==="tasks"&&<section className="tasks task-workspace">
        <div className="task-list"><header><h1>Tasks</h1><button aria-label="Create new task" onClick={()=>{setCreatingTask(true);setActiveTaskId(null);setTaskMessages([])}}>＋</button></header>
          <div className="task-list-tabs"><button className={taskFilter==="active"?"active":""} onClick={()=>{setTaskFilter("active");setCreatingTask(false);setActiveTaskId(null)}}>Active <span>{activeTaskCount}</span></button><button className={taskFilter==="completed"?"active":""} onClick={()=>{setTaskFilter("completed");setCreatingTask(false);setActiveTaskId(null)}}>Completed <span>{completedTaskCount}</span></button></div>
          {tasksLoading&&!savedTasks.length?<div className="task-list-loading">Loading tasks…</div>:visibleTasks.map(task=>{const currentComplete=task.status==="completed"||Boolean(task.currentPeriodCompletedAt);return <article key={task.id} className={`${activeTaskId===task.id?"active ":""}${task.status==="completed"?"completed ":""}${task.currentPeriodCompletedAt?"period-complete":""}`} onClick={()=>void openTask(task.id)}><span className={`task-status-dot ${currentComplete?"complete":""}`}>{currentComplete?"✓":""}</span><div><h2>{task.title}</h2><p>{task.description}</p><footer><span>{task.currentPeriodCompletedAt?taskCompletionLabel(task):(task.recurrenceType==="recurring"?`Every ${task.recurrenceEvery} ${task.recurrenceUnit}${task.recurrenceEvery===1?"":"s"}`:"One-time")}</span>{task.deadline&&<time>{new Date(`${task.deadline}T00:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</time>}</footer></div></article>})}
          {!tasksLoading&&!visibleTasks.length&&<div className="task-list-empty">{taskFilter==="completed"?"No completed tasks yet":"No active tasks"}</div>}
        </div>
        {creatingTask?<div className="new-task-page"><form onSubmit={event=>{event.preventDefault();void createTask()}}><span className="eyebrow">NEW TASK</span><h1>What are you working on?</h1><p>Give Resolve the goal and enough background to start. It will ask focused follow-up questions before researching and building your plan.</p><fieldset className="task-templates"><legend>Start from a connected workflow <span>Optional</span></legend><div><button type="button" className={newTaskIntegration===null?"active":""} onClick={()=>applyTaskTemplate(null)}><i>＋</i><span><b>Custom task</b><small>Start from scratch</small></span></button>{(Object.entries(taskIntegrations) as Array<[TaskIntegration,(typeof taskIntegrations)[TaskIntegration]]>).map(([id,integration])=><button type="button" key={id} className={newTaskIntegration===id?"active":""} onClick={()=>applyTaskTemplate(id)}><i>{integration.mark}</i><span><b>{integration.name}</b><small>{integration.description}</small></span></button>)}</div></fieldset><label>Title<input autoFocus value={newTaskTitle} onChange={event=>setNewTaskTitle(event.target.value)} placeholder="e.g. Plan a customer advisory board" maxLength={200}/></label><label>Description<textarea value={newTaskDescription} onChange={event=>setNewTaskDescription(event.target.value)} placeholder="What outcome do you want? What should Resolve know?" maxLength={5000}/></label><fieldset className="task-schedule"><legend>Schedule</legend><div className="schedule-toggle"><button type="button" className={newTaskRecurrenceType==="one_time"?"active":""} onClick={()=>setNewTaskRecurrenceType("one_time")}>One-time</button><button type="button" className={newTaskRecurrenceType==="recurring"?"active":""} onClick={()=>setNewTaskRecurrenceType("recurring")}>↻ Recurring</button></div>{newTaskRecurrenceType==="recurring"&&<div className="recurrence-fields"><span>Repeat every</span><input aria-label="Recurrence interval" type="number" min="1" max="365" value={newTaskRecurrenceEvery} onChange={event=>setNewTaskRecurrenceEvery(Math.min(365,Math.max(1,Number(event.target.value)||1)))}/><select aria-label="Recurrence unit" value={newTaskRecurrenceUnit} onChange={event=>setNewTaskRecurrenceUnit(event.target.value as "day"|"week"|"month")}><option value="day">day(s)</option><option value="week">week(s)</option><option value="month">month(s)</option></select></div>}</fieldset><label className="deadline-field">Deadline <span>Optional</span><input type="date" value={newTaskDeadline} onChange={event=>setNewTaskDeadline(event.target.value)}/></label><button className="create-task-primary" disabled={taskAgentLoading||!newTaskTitle.trim()||!newTaskDescription.trim()}>{taskAgentLoading?"Starting…":"Create task and start →"}</button></form></div>
        :activeTask?<div className="task-chat-page"><header><div><span className="eyebrow">TASK WORKSPACE</span><h1>{(activeTask.status==="completed"||activeTask.currentPeriodCompletedAt)&&<span className="completed-title-check">✓</span>}{activeTask.title}</h1><p>{activeTask.description}</p><div className="task-meta"><span>{activeTask.recurrenceType==="recurring"?`↻ Every ${activeTask.recurrenceEvery} ${activeTask.recurrenceUnit}${activeTask.recurrenceEvery===1?"":"s"}`:"One-time"}</span><span>{activeTask.deadline?`Due ${new Date(`${activeTask.deadline}T00:00:00`).toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}`:"No deadline"}</span>{activeTask.currentPeriodCompletedAt&&<span className="task-period-complete">✓ {taskCompletionLabel(activeTask)}</span>}{activeTask.sourceThreadId&&<span>Created from email</span>}</div>{activeTask.integrationType&&<div className="task-integration"><span>{taskIntegrations[activeTask.integrationType].mark}</span><div><b>{taskIntegrations[activeTask.integrationType].name} connected</b><small>{taskIntegrations[activeTask.integrationType].description}</small></div><a href={taskIntegrations[activeTask.integrationType].url} target="_blank" rel="noreferrer">Open tool ↗</a></div>}{activeTask.completionEvidence&&<div className="task-evidence"><b>✓ Completed automatically from email</b><span>“{activeTask.completionEvidence.subject??"Payment confirmation"}”{activeTask.completionEvidence.sender?` from ${activeTask.completionEvidence.sender}`:""}</span>{activeTask.completionEvidence.summary&&<small>{activeTask.completionEvidence.summary}</small>}</div>}</div><div className="task-header-actions"><button className={(activeTask.status==="completed"||activeTask.currentPeriodCompletedAt)?"reopen-task":"complete-task"} onClick={()=>void updateTaskStatus(activeTask,(activeTask.status==="completed"||Boolean(activeTask.currentPeriodCompletedAt))?"active":"completed")}>{(activeTask.status==="completed"||activeTask.currentPeriodCompletedAt)?(activeTask.recurrenceType==="recurring"?"↻ Reopen this period":"↻ Reopen"):(activeTask.recurrenceType==="recurring"?"✓ Mark this period complete":"✓ Mark complete")}</button><button className="delete-task" onClick={()=>void deleteTask(activeTask.id)}>Delete</button></div></header><div className="task-conversation">{!taskMessages.length&&!taskAgentLoading&&<div className="task-agent-intro"><span>✦</span><p>Resolve is ready to review this task.</p><button onClick={()=>void runTaskAgent(activeTask.id,"",true)}>Start the conversation</button></div>}{taskMessages.map((message,index)=><article key={message.id??`${message.role}-${index}`} className={`task-message ${message.role}`}><div className="message-author">{message.role==="assistant"?<><span>✦</span>Resolve</>:"You"}</div><div className="message-content">{message.content.split("\n").map((line,lineIndex)=><span key={lineIndex}>{line||<br/>}</span>)}</div>{message.sources&&message.sources.length>0&&<div className="task-sources"><b>Sources</b>{message.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>}</article>)}{taskAgentLoading&&<div className="task-agent-thinking"><span/><span/><span/> Resolve is thinking and researching…</div>}</div><form className="task-chat-form" onSubmit={event=>{event.preventDefault();void runTaskAgent(activeTask.id,taskChatInput)}}><textarea value={taskChatInput} onChange={event=>setTaskChatInput(event.target.value)} placeholder="Answer Resolve or ask it to research, strategize, or organize the next step…" rows={2} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void runTaskAgent(activeTask.id,taskChatInput)}}}/><button aria-label="Send to Resolve" disabled={taskAgentLoading||!taskChatInput.trim()}>↑</button></form></div>
        :<div className="empty-task-state"><span>{taskFilter==="completed"?"✓":"✦"}</span><h2>{taskFilter==="completed"?"Completed tasks":"No tasks yet"}</h2><p>{taskFilter==="completed"?"Select a completed task to review its conversation, research, and results.":"Create a task with a title, description, and optional deadline. Resolve will ask follow-up questions, research it, and help organize the work."}</p>{taskFilter==="active"&&<button onClick={()=>setCreatingTask(true)}>＋ New task</button>}</div>}
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

    {compose&&(recipientContactsAuthorized===false||recipientContactsUnavailable)&&<aside className="contacts-permission-nudge"><div><b>{recipientContactsUnavailable?"Turn on Google People API":"Get Gmail-quality contact suggestions"}</b><span>{recipientContactsUnavailable?"Permission is approved. Enable the People API in the same Google Cloud project as your OAuth client, then return here.":"Reconnect once so Resolve can search Google Contacts and Other contacts—not just email senders."}</span></div><button onClick={()=>recipientContactsUnavailable?window.open("https://console.cloud.google.com/apis/library/people.googleapis.com","_blank","noopener,noreferrer"):window.location.assign("/api/connectors/google/start")}>{recipientContactsUnavailable?"Enable People API":"Enable contacts"}</button></aside>}
    {compose&&<div className="compose-window"><header><b>New message</b><button aria-label="Close composer" onClick={()=>{setCompose(false);setRecipientSuggestionsOpen(false)}}>×</button></header><div className="compose-recipient-row"><label htmlFor="compose-to">To</label><input id="compose-to" role="combobox" aria-autocomplete="list" aria-expanded={recipientSuggestionsOpen} aria-controls="recipient-suggestions" autoFocus value={composeTo} placeholder="Search anyone in Gmail" onFocus={()=>void loadRecipientSuggestions()} onBlur={()=>window.setTimeout(()=>setRecipientSuggestionsOpen(false),120)} onChange={e=>{setComposeTo(e.target.value);setRecipientSuggestionsOpen(true);setActiveRecipientSuggestion(0);scheduleRecipientSearch(e.target.value)}} onKeyDown={handleRecipientKey}/><button className="cc-toggle" onClick={()=>setShowCc(value=>!value)}>Cc/Bcc</button>{recipientSuggestionsOpen&&<div id="recipient-suggestions" className="recipient-suggestions" role="listbox"><b>{recipientQuery?"Google contact results":"Frequently contacted"}</b>{visibleRecipientSuggestions.length?visibleRecipientSuggestions.map((recipient,index)=><button type="button" role="option" aria-selected={index===activeRecipientSuggestion} className={index===activeRecipientSuggestion?"active":""} key={recipient.email} onMouseDown={event=>event.preventDefault()} onClick={()=>selectRecipient(recipient)}><span>{recipient.name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()}</span><div><strong>{recipient.name}</strong><small>{recipient.email}</small></div><i>{recipient.count>=1500?"Contact":"Recent"}</i></button>):recipientSuggestionsLoading?<p>Searching Google contacts…</p>:<p>{gmail.connected?"No matching recipients":"Connect Gmail to see frequent contacts"}</p>}</div>}</div>{showCc&&<label>Cc <input value={composeCc} onChange={e=>setComposeCc(e.target.value)}/></label>}<label>Subject <input value={composeSubject} onChange={e=>setComposeSubject(e.target.value)}/></label><div className="formatting-toolbar" aria-label="Message formatting"><button aria-label="Bold" title="Bold" onMouseDown={event=>{event.preventDefault();formatCompose("bold")}}><b>B</b></button><button aria-label="Italic" title="Italic" onMouseDown={event=>{event.preventDefault();formatCompose("italic")}}><i>I</i></button><button aria-label="Underline" title="Underline" onMouseDown={event=>{event.preventDefault();formatCompose("underline")}}><u>U</u></button><span/><button aria-label="Bulleted list" title="Bulleted list" onMouseDown={event=>{event.preventDefault();formatCompose("insertUnorderedList")}}>• List</button><button aria-label="Numbered list" title="Numbered list" onMouseDown={event=>{event.preventDefault();formatCompose("insertOrderedList")}}>1. List</button><button aria-label="Insert link" title="Insert link" onMouseDown={event=>{event.preventDefault();addComposeLink()}}>🔗</button></div><div ref={composeEditor} className="compose-editor" contentEditable role="textbox" aria-label="Message body" aria-multiline="true" data-placeholder="Write a message…" suppressContentEditableWarning onInput={event=>setComposeBody(event.currentTarget.innerHTML)}/>{composeAttachments.length>0&&<div className="outgoing-attachments">{composeAttachments.map(file=><span key={file.id}>📎 <b>{file.name}</b><small>{Math.max(1,Math.round(file.size/1024))} KB</small><button aria-label={`Remove ${file.name}`} onClick={()=>setComposeAttachments(items=>items.filter(item=>item.id!==file.id))}>×</button></span>)}</div>}<footer><button onClick={sendCompose}>Send</button><input ref={composeFileInput} hidden type="file" multiple onChange={event=>{void addAttachments(event.target.files,"compose");event.target.value=""}}/><button className="attach-compose" onClick={()=>composeFileInput.current?.click()}>＋ Attach</button><span/><button className="discard-compose" onClick={()=>{setCompose(false);setComposeTo("");setComposeCc("");setComposeSubject("");setComposeBody("");setComposeAttachments([]);setRecipientSuggestionsOpen(false)}}>Discard</button></footer></div>}
    {accountOpen&&<div className="account-backdrop" onClick={()=>setAccountOpen(false)}><section className="account-panel" onClick={event=>event.stopPropagation()}><header><div><small>RESOLVE ACCOUNT</small><h2>{account?account.displayName:"Your account"}</h2>{account&&<p>{account.email}</p>}</div><button aria-label="Close account" onClick={()=>setAccountOpen(false)}>×</button></header>{accountLoading&&!account?<div className="account-loading">Loading account…</div>:account?<><div className="plan-card"><div><span className={`plan-pill ${account.plan}`}>{account.plan==="pro"?"PRO":"FREE"}</span><h3>{account.plan==="pro"?"Resolve Pro":"Free plan"}</h3><p>{account.plan==="pro"?"More AI search for a busy inbox.":"Try AI search before upgrading."}</p></div><strong>{account.plan==="pro"?"$20":"$0"}<small>/month</small></strong></div><div className="usage-card"><div><b>AI answers this month</b><span>{account.usage} of {account.limit}</span></div><progress max={account.limit} value={account.usage}/><p>Usage resets at the beginning of each month. Resolve stops at your limit—there are no surprise overage charges.</p></div>{account.plan==="pro"?<button className="billing-primary" disabled={accountLoading} onClick={()=>void beginBilling("/api/billing/portal")}>Manage billing</button>:<button className="billing-primary" disabled={accountLoading} onClick={()=>void beginBilling("/api/billing/checkout")}>Upgrade to Pro · $20/month</button>}<p className="billing-note">Payments are securely processed by Stripe. Resolve never stores your card number.</p></>:<div className="sign-in-card"><span>✦</span><h3>Sign in to protect your inbox</h3><p>An account is required for AI search, billing, and private connector access.</p><a href={signInUrl}>Sign in with ChatGPT</a></div>}</section></div>}
    {toast&&<div className="toast"><span>✓</span>{toast}</div>}
  </main>
}
