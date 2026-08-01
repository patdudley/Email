import { getChatGPTUser, chatGPTSignInPath } from "../../chatgpt-auth";
import { getD1 } from "../../../db";
import { ensureUser } from "../../../lib/billing";

type TaskRow = {
  id:string; title:string; description:string; deadline:string|null; status:string;
  recurrenceType:"one_time"|"recurring";recurrenceEvery:number|null;recurrenceUnit:"day"|"week"|"month"|null;
  sourceThreadId:string|null; createdAt:number; updatedAt:number;
};

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

export async function GET(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to use tasks",signInUrl:chatGPTSignInPath("/")},{status:401});
  await ensureUser(user);
  const id=new URL(request.url).searchParams.get("id");
  const db=getD1();
  const tasks=id
    ? await db.prepare(`SELECT id,title,description,deadline,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,status,source_thread_id AS sourceThreadId,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE user_email=? AND id=?`).bind(user.email.toLowerCase(),id).all<TaskRow>()
    : await db.prepare(`SELECT id,title,description,deadline,recurrence_type AS recurrenceType,recurrence_every AS recurrenceEvery,recurrence_unit AS recurrenceUnit,status,source_thread_id AS sourceThreadId,created_at AS createdAt,updated_at AS updatedAt FROM tasks WHERE user_email=? ORDER BY updated_at DESC LIMIT 200`).bind(user.email.toLowerCase()).all<TaskRow>();
  if(!id)return Response.json({tasks:tasks.results??[]});
  const task=tasks.results?.[0];
  if(!task)return Response.json({error:"Task not found"},{status:404});
  const messages=await db.prepare(`SELECT id,role,content,sources,created_at AS createdAt FROM task_messages WHERE task_id=? ORDER BY created_at ASC,id ASC LIMIT 200`).bind(id).all<{id:string;role:string;content:string;sources:string|null;createdAt:number}>();
  return Response.json({task,messages:(messages.results??[]).map((message:{id:string;role:string;content:string;sources:string|null;createdAt:number})=>({...message,sources:message.sources?JSON.parse(message.sources):[]}))});
}

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to create tasks",signInUrl:chatGPTSignInPath("/")},{status:401});
  const body=await request.json() as {title?:string;description?:string;deadline?:string;sourceThreadId?:string;recurrenceType?:string;recurrenceEvery?:number;recurrenceUnit?:string};
  const title=body.title?.trim()??"";
  const description=body.description?.trim()??"";
  if(!title||title.length>200)return Response.json({error:"Add a title under 200 characters"},{status:400});
  if(!description||description.length>5000)return Response.json({error:"Add a description under 5,000 characters"},{status:400});
  await ensureUser(user);
  const recurrence=cleanRecurrence(body.recurrenceType,body.recurrenceEvery,body.recurrenceUnit);
  const task:TaskRow={id:crypto.randomUUID(),title,description,deadline:cleanDeadline(body.deadline),...recurrence,status:"active",sourceThreadId:body.sourceThreadId?.trim()||null,createdAt:Math.floor(Date.now()/1000),updatedAt:Math.floor(Date.now()/1000)};
  await getD1().prepare(`INSERT INTO tasks (id,user_email,title,description,deadline,recurrence_type,recurrence_every,recurrence_unit,status,source_thread_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(task.id,user.email.toLowerCase(),task.title,task.description,task.deadline,task.recurrenceType,task.recurrenceEvery,task.recurrenceUnit,task.status,task.sourceThreadId,task.createdAt,task.updatedAt).run();
  return Response.json({task},{status:201});
}

export async function DELETE(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to delete tasks"},{status:401});
  const body=await request.json() as {id?:string};
  if(!body.id)return Response.json({error:"Task id is required"},{status:400});
  const result=await getD1().prepare("DELETE FROM tasks WHERE id=? AND user_email=?").bind(body.id,user.email.toLowerCase()).run();
  return Response.json({deleted:Boolean(result.meta.changes)});
}
