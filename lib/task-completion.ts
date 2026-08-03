import type { RecurringTask } from "./task-period";

type PaymentTask = RecurringTask & {title:string;description:string};

const stopWords=new Set(["about","again","automatic","automatically","bill","check","complete","daily","every","make","monthly","payment","reminder","task","that","this","weekly","when"]);

export function isPaymentTask(task:PaymentTask):boolean{
  return /\b(pay|paid|payment|rent|mortgage|invoice|premium|subscription|utility|utilities|bill)\b/i.test(`${task.title} ${task.description}`);
}

export function taskEvidenceTerms(task:PaymentTask):string[]{
  const words=`${task.title} ${task.description}`.toLowerCase().match(/[a-z0-9]{3,}/g)??[];
  const unique=[...new Set(words.filter(word=>!stopWords.has(word)))];
  if(/\brent\b/i.test(`${task.title} ${task.description}`))return ["rent",...unique.filter(word=>word!=="rent")].slice(0,4);
  return unique.slice(0,4);
}

const positivePaymentEvidence=[
  /\b(?:rent|invoice|bill|premium|subscription)\s+(?:has\s+|was\s+)?(?:been\s+)?paid\b/i,
  /\bpayment\s+(?:has\s+|was\s+)?(?:been\s+)?(?:received|completed|successful|confirmed|processed)\b/i,
  /\b(?:payment|transaction)\s+receipt\b/i,
  /\bthank\s+you\s+for\s+(?:your\s+)?payment\b/i,
  /\bwe\s+(?:have\s+)?received\s+(?:your\s+)?payment\b/i,
  /\byou\s+(?:successfully\s+)?paid\b/i,
];
const nonCompletionEvidence=/\b(?:failed|declined|reversed|refunded|overdue|past due|payment due|rent due|reminder|scheduled|pending|will (?:be )?(?:pay|paid|process)|autopay (?:is |was )?(?:scheduled|pending))\b/i;

function confirmedRentTransfer(task:PaymentTask,text:string):boolean{
  if(!/\brent\b/i.test(`${task.title} ${task.description}`))return false;
  if(!/\byou sent(?: money)?\b/i.test(text)||!/\b(?:confirmation|confirmed|completed|successful)\b/i.test(text))return false;
  const amounts=[...text.matchAll(/\$\s*([\d,]+(?:\.\d{2})?)/g)].map(match=>Number(match[1].replace(/,/g,""))).filter(Number.isFinite);
  return amounts.some(amount=>amount>=500);
}

export function isStrongCompletionEvidence(task:PaymentTask,text:string):boolean{
  const normalized=text.replace(/\s+/g," ");
  if(nonCompletionEvidence.test(normalized))return false;
  if(confirmedRentTransfer(task,normalized))return true;
  const terms=taskEvidenceTerms(task);
  if(!terms.length||!terms.some(term=>normalized.toLowerCase().includes(term)))return false;
  return positivePaymentEvidence.some(pattern=>pattern.test(normalized));
}

export function paymentEvidenceQuery(task:PaymentTask,afterEpoch:number):string{
  if(/\brent\b/i.test(`${task.title} ${task.description}`))return `after:${afterEpoch} {rent "payment received" "rent paid" "You sent money with Zelle" "you sent money"}`;
  const terms=taskEvidenceTerms(task).map(term=>`"${term.replace(/"/g,"")}"`).join(" ");
  return `after:${afterEpoch} ${terms} {"payment received" "payment completed" "payment successful" "payment confirmed" "transaction receipt" "rent paid" "you paid"}`.trim();
}
