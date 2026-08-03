import { getChatGPTUser, chatGPTSignInPath } from "../../chatgpt-auth";
import { getD1 } from "../../../db";
import { ensureUser } from "../../../lib/billing";
import { taskPeriod } from "../../../lib/task-period";

type TaskRow = {
  id:string; title:string; description:string; deadline:string|null; status:string;
  recurrenceType:"one_time"|"recurring";recurrenceEvery:number|null;recurrenceUnit:"day"|"week"|"month"|null;
  sourceThreadId:string|null; integrationType:"online_presence"|"drybar_payroll"|null; createdAt:number; updatedAt:number;
};

type CompletionRow = {taskId:string;periodKey:string;evidenceThreadId:string|null;evidenceSubject:string|null;evidenceSender:string|null;evidenceDate:string|null;evidenceSummary:string|null;completedAt:number};

function attachCurrentCompletions(tasks:TaskRow[],completions:CompletionRow[]){
  const byTaskPeriod=new Map(completions.map(completion=>[`${completion.taskId}:${completion.periodKey}`,completion]));
  return tasks.map(task=>{
    const completion=byTaskPeriod.get(`${task.id}:${taskPeriod(task).key}`);
    return {...task,currentPeriodCompletedAt:completion?.completedAt??null,completionEvidence:completion?{threadId:completion.evidenceThreadId,subject:completion.evidenceSubject,sender:completion.evidenceSender,date:completion.evidenceDate,summary:completion.evidenceSummary}:null};
  });
}

function cleanDeadline(value:unknown):string|null {
  const deadline=String(value??"").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline)?deadline:null;
}

function cleanRecurrence(type:unknown,every:unknown,unit:unknown){
  if(type!=="recurring")return {recurrenceType:"one_time" as const,recurrenceEvery:null,recurrenceUnit:null};
  const recurrenceEvery=Math.min(365,Math.max(1,Number.parseInt(String(every??1),10)||1));
  const recurrenceUnit=unit==="day"||unit==="week"||unit==="month"?unit:"week";
  return {recurrenceType:"recurring" as const,recurrenceEvery,recurrenceUnit};
}

function cleanIntegration(value:unknown):TaskRow["integrationType"]{
  return value==="online_presence"||value==="drybar_payroll"?value:null;
}

export async function GET(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to use tasks",signInUrl:chatGPTSignInPath("/")},{status:401});
  await ensureUser(user);
  const id=new URL(request.url).searchParams.get("id");
  const db=getD1();
  const tasks=id
    ? await db.prepare(`SELECT id,title,description,deadline,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,status,source_thread_id AS sourceThreadId,integration_type AS integrationType,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE user_email=? AND id=?`).bind(user.email.toLowerCase(),id).all<TaskRow>()
    : await db.prepare(`SELECT id,title,description,deadline,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,status,source_thread_id AS sourceThreadId,integration_type AS integrationType,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE user_email=? ORDER BY updated_at DESC LIMIT 200`).bind(user.email.toLowerCase()).all<TaskRow>();
  const taskRows=tasks.results??[];
  const completions=taskRows.length?await db.prepare(`SELECT task_id AS taskId,period_key AS periodKey,evidence_thread_id AS evidenceThreadId,evidence_subject AS evidenceSubject,evidence_sender AS evidenceSender,evidence_date AS evidenceDate,evidence_summary AS evidenceSummary,completed_at AS completedAt FROM task_completions WHERE user_email=? ORDER BY completed_at DESC LIMIT 400`).bind(user.email.toLowerCase()).all<CompletionRow>():{results:[]};
  const tasksWithCompletions=attachCurrentCompletions(taskRows,completions.results??[]);
  if(!id)return Response.json({tasks:tasksWithCompletions});
  const task=tasksWithCompletions[0];
  if(!task)return Response.json({error:"Task not found"},{status:404});
  const messages=await db.prepare(`SELECT id,role,content,sources,created_at AS createdAt FROM task_messages WHERE task_id=? ORDER BY created_at ASC,id ASC LIMIT 200`).bind(id).all<{id:string;role:string;content:string;sources:string|null;createdAt:number}>();
  return Response.json({task,messages:(messages.results??[]).map((message:{id:string;role:string;content:string;sources:string|null;createdAt:number})=>({...message,sources:message.sources?JSON.parse(message.sources):[]}))});
}

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to create tasks",signInUrl:chatGPTSignInPath("/")},{status:401});
  const body=await request.json() as {title?:string;description?:string;deadline?:string;sourceThreadId?:string;integrationType?:string;recurrenceType?:string;recurrenceEvery?:number;recurrenceUnit?:string};
  const title=body.title?.trim()??"";
  const description=body.description?.trim()??"";
  if(!title||title.length>200)return Response.json({error:"Add a title under 200 characters"},{status:400});
  if(!description||description.length>5000)return Response.json({error:"Add a description under 5,000 characters"},{status:400});
  await ensureUser(user);
  const recurrence=cleanRecurrence(body.recurrenceType,body.recurrenceEvery,body.recurrenceUnit);
  const task:TaskRow={id:crypto.randomUUID(),title,description,deadline:cleanDeadline(body.deadline),...recurrence,status:"active",sourceThreadId:body.sourceThreadId?.trim()||null,integrationType:cleanIntegration(body.integrationType),createdAt:Math.floor(Date.now()/1000),updatedAt:Math.floor(Date.now()/1000)};
  await getD1().prepare(`INSERT INTO tasks (id,user_email,title,description,deadline,recurrence_type,recurrence_every,recurrence_unit,status,source_thread_id,integration_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(task.id,user.email.toLowerCase(),task.title,task.description,task.deadline,task.recurrenceType,task.recurrenceEvery,task.recurrenceUnit,task.status,task.sourceThreadId,task.integrationType,task.createdAt,task.updatedAt).run();
  return Response.json({task},{status:201});
}

export async function PATCH(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to update tasks",signInUrl:chatGPTSignInPath("/")},{status:401});
  const body=await request.json() as {id?:string;status?:string};
  const id=body.id?.trim()??"";
  const status=body.status==="completed"?"completed":body.status==="active"?"active":"";
  if(!id||!status)return Response.json({error:"Task id and valid status are required"},{status:400});
  const db=getD1();
  const email=user.email.toLowerCase();
  const task=await db.prepare(`SELECT id,title,description,deadline,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,status,source_thread_id AS sourceThreadId,integration_type AS integrationType,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE id=? AND user_email=?`).bind(id,email).first<TaskRow>();
  if(!task)return Response.json({error:"Task not found"},{status:404});
  const updatedAt=Math.floor(Date.now()/1000);
  if(task.recurrenceType==="recurring"){
    const period=taskPeriod(task);
    if(status==="completed"){
      await db.prepare(`INSERT INTO task_completions (id,task_id,user_email,period_key,evidence_summary,completed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(task_id,period_key) DO NOTHING`).bind(crypto.randomUUID(),id,email,period.key,"Marked complete manually",updatedAt).run();
    }else{
      await db.prepare("DELETE FROM task_completions WHERE task_id=? AND user_email=? AND period_key=?").bind(id,email,period.key).run();
    }
    await db.prepare("UPDATE tasks SET updated_at=? WHERE id=? AND user_email=?").bind(updatedAt,id,email).run();
    return Response.json({id,status:"active",currentPeriodCompletedAt:status==="completed"?updatedAt:null,recurringOccurrence:true,updatedAt});
  }
  const result=await db.prepare("UPDATE tasks SET status=?, updated_at=? WHERE id=? AND user_email=?").bind(status,updatedAt,id,email).run();
  return Response.json({id,status,updatedAt,updated:Boolean(result.meta.changes)});
}

export async function DELETE(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to delete tasks"},{status:401});
  const body=await request.json() as {id?:string};
  if(!body.id)return Response.json({error:"Task id is required"},{status:400});
  const result=await getD1().prepare("DELETE FROM tasks WHERE id=? AND user_email=?").bind(body.id,user.email.toLowerCase()).run();
  return Response.json({deleted:Boolean(result.meta.changes)});
}
