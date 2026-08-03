import { getChatGPTUser, chatGPTSignInPath } from "../../../chatgpt-auth";
import { getD1 } from "../../../../db";
import { gmailFetch, getGoogleConnection } from "../../../../lib/google";
import { summarizeThread, type GmailThread } from "../../../../lib/gmail-message";
import { isPaymentTask, isStrongCompletionEvidence, paymentEvidenceQuery } from "../../../../lib/task-completion";
import { taskPeriod } from "../../../../lib/task-period";

type TaskRow={id:string;title:string;description:string;recurrenceType:"one_time"|"recurring";recurrenceEvery:number|null;recurrenceUnit:"day"|"week"|"month"|null;createdAt:number};
type ThreadList={threads?:Array<{id:string}>};

export async function POST(){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to check task completion",signInUrl:chatGPTSignInPath("/")},{status:401});
  const email=user.email.toLowerCase();
  if(!await getGoogleConnection(email))return Response.json({detected:0,completions:[]});
  const db=getD1();
  const rows=await db.prepare(`SELECT id,title,description,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,created_at AS createdAt FROM tasks WHERE user_email=? AND status='active' ORDER BY updated_at DESC LIMIT 50`).bind(email).all<TaskRow>();
  const tasks=(rows.results??[]).filter(isPaymentTask).slice(0,8);
  const completions:Array<{taskId:string;taskTitle:string;threadId:string;subject:string}>=[];
  for(const task of tasks){
    const period=taskPeriod(task);
    const existing=await db.prepare("SELECT 1 AS found FROM task_completions WHERE task_id=? AND period_key=?").bind(task.id,period.key).first<{found:number}>();
    if(existing)continue;
    const periodStart=Math.floor(period.startsAt.getTime()/1000);
    const isRentTask=/\brent\b/i.test(`${task.title} ${task.description}`);
    const lookbackDays=isRentTask?10:3;
    const afterEpoch=task.recurrenceType==="recurring"?periodStart-lookbackDays*86_400:Math.max(task.createdAt-30*86_400,Math.floor(Date.now()/1000)-45*86_400);
    const params=new URLSearchParams({maxResults:"20",q:paymentEvidenceQuery(task,afterEpoch)});
    const list=await gmailFetch<ThreadList>(email,`/threads?${params}`);
    let evidence:ReturnType<typeof summarizeThread>|null=null;
    for(const item of list.threads??[]){
      const summary=summarizeThread(await gmailFetch<GmailThread>(email,`/threads/${encodeURIComponent(item.id)}?format=full`));
      if(isStrongCompletionEvidence(task,`${summary.sender} <${summary.email}>\n${summary.subject}\n${summary.preview}\n${summary.body.join("\n")}`)){evidence=summary;break}
    }
    if(!evidence)continue;
    const now=Math.floor(Date.now()/1000);
    const result=await db.prepare(`INSERT INTO task_completions (id,task_id,user_email,period_key,evidence_thread_id,evidence_subject,evidence_sender,evidence_date,evidence_summary,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,period_key) DO NOTHING`).bind(crypto.randomUUID(),task.id,email,period.key,String(evidence.threadId),evidence.subject,`${evidence.sender} <${evidence.email}>`,evidence.date,evidence.preview.slice(0,500),now).run();
    if(!result.meta.changes)continue;
    if(task.recurrenceType==="one_time")await db.prepare("UPDATE tasks SET status='completed',updated_at=? WHERE id=? AND user_email=?").bind(now,task.id,email).run();
    completions.push({taskId:task.id,taskTitle:task.title,threadId:String(evidence.threadId),subject:evidence.subject});
  }
  return Response.json({detected:completions.length,completions});
}
