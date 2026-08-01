import { getChatGPTUser, chatGPTSignInPath } from "../../../chatgpt-auth";
import { getD1 } from "../../../../db";
import { recordAiTokens, reserveAiAnswer, rollbackAiAnswer } from "../../../../lib/billing";
import { requireRuntimeEnv, runtimeEnv } from "../../../../lib/runtime-env";

type Source={url:string;title:string};
type OpenAIResponse={output?:Array<{type?:string;content?:Array<{type?:string;text?:string;annotations?:Array<{type?:string;url?:string;title?:string}>}>}>;usage?:{input_tokens?:number;output_tokens?:number};error?:{message?:string}};

function readOutput(response:OpenAIResponse):{text:string;sources:Source[]} {
  const parts=(response.output??[]).flatMap(item=>item.content??[]).filter(item=>item.type==="output_text");
  const sources=new Map<string,Source>();
  for(const part of parts)for(const annotation of part.annotations??[])if(annotation.url)sources.set(annotation.url,{url:annotation.url,title:annotation.title??new URL(annotation.url).hostname});
  return {text:parts.map(part=>part.text??"").join("").trim(),sources:[...sources.values()].slice(0,8)};
}

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"Sign in to use the task agent",signInUrl:chatGPTSignInPath("/")},{status:401});
  let reservation:Awaited<ReturnType<typeof reserveAiAnswer>>|null=null;
  try{
    const body=await request.json() as {taskId?:string;message?:string;start?:boolean};
    const taskId=body.taskId?.trim()??"";
    const message=body.message?.trim()??"";
    if(!taskId||(!body.start&&!message))return Response.json({error:"Task and message are required"},{status:400});
    if(message.length>5000)return Response.json({error:"Keep messages under 5,000 characters"},{status:400});
    const db=getD1();
    const task=await db.prepare(`SELECT id,title,description,deadline FROM tasks WHERE id=? AND user_email=?`).bind(taskId,user.email.toLowerCase()).first<{id:string;title:string;description:string;deadline:string|null}>();
    if(!task)return Response.json({error:"Task not found"},{status:404});
    const history=await db.prepare(`SELECT role,content FROM task_messages WHERE task_id=? ORDER BY created_at DESC,id DESC LIMIT 24`).bind(taskId).all<{role:string;content:string}>();
    const now=Math.floor(Date.now()/1000);
    if(!body.start)await db.prepare(`INSERT INTO task_messages (id,task_id,role,content,sources,created_at) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),taskId,"user",message,null,now).run();
    const conversation=[...(history.results??[])].reverse().map(item=>`${item.role==="assistant"?"Resolve":"User"}: ${item.content}`).join("\n\n");
    const userTurn=body.start?"Begin the task. Decide whether you need a small number of focused follow-up questions before researching and planning.":message;
    reservation=await reserveAiAnswer(user);
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${requireRuntimeEnv("OPENAI_API_KEY")}`,"Content-Type":"application/json"},body:JSON.stringify({
      model:runtimeEnv().OPENAI_TASK_MODEL??"gpt-5.6-sol",
      store:false,
      reasoning:{effort:"medium"},
      tools:[{type:"web_search_preview"}],
      max_output_tokens:1600,
      instructions:`Role: You are Resolve, a collaborative task strategist and research agent.\n\nGoal: Help the user execute this task end to end. First identify the smallest missing context that materially changes the plan. Ask at most three focused questions at a time. When enough context exists, research current external facts when useful, synthesize findings, recommend a strategy, and give an actionable execution plan.\n\nSuccess means the user always knows the best next move, important decisions and tradeoffs are explicit, research-backed claims have citations, and blockers are named. Do not pretend to take external actions. Ask before any external write, purchase, or destructive action. Keep the tone direct, practical, and collaborative.`,
      input:`TASK\nTitle: ${task.title}\nDescription: ${task.description}\nDeadline: ${task.deadline??"None"}\n\nCONVERSATION SO FAR\n${conversation||"No prior messages."}\n\nCURRENT TURN\n${userTurn}`
    })});
    const json=await response.json() as OpenAIResponse;
    if(!response.ok)throw new Error(json.error?.message??"Task agent request failed");
    const answer=readOutput(json);
    if(!answer.text)throw new Error("The task agent returned no answer");
    await db.prepare(`INSERT INTO task_messages (id,task_id,role,content,sources,created_at) VALUES (?,?,?,?,?,?)`).bind(crypto.randomUUID(),taskId,"assistant",answer.text,JSON.stringify(answer.sources),now+1).run();
    await db.prepare("UPDATE tasks SET updated_at=? WHERE id=? AND user_email=?").bind(now+1,taskId,user.email.toLowerCase()).run();
    await recordAiTokens(reservation.email,reservation.periodStart,json.usage?.input_tokens??0,json.usage?.output_tokens??0);
    return Response.json({message:{role:"assistant",content:answer.text,sources:answer.sources,createdAt:now+1},usage:reservation.usage,limit:reservation.limit});
  }catch(error){
    if(reservation)await rollbackAiAnswer(reservation.email,reservation.periodStart);
    if(error instanceof Error&&error.name==="UsageLimitError")return Response.json({error:"You have used all AI answers for this month",upgradeRequired:true},{status:402});
    return Response.json({error:error instanceof Error?error.message:"Task agent unavailable"},{status:503});
  }
}
