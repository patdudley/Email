export type RecurringTask = {
  recurrenceType: "one_time" | "recurring";
  recurrenceEvery: number | null;
  recurrenceUnit: "day" | "week" | "month" | null;
  createdAt: number;
};

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function taskPeriod(task: RecurringTask, now = new Date()): { key: string; startsAt: Date } {
  if (task.recurrenceType !== "recurring") {
    return { key: "one-time", startsAt: new Date(task.createdAt * 1_000) };
  }
  const every = Math.max(1, task.recurrenceEvery ?? 1);
  const created = new Date(task.createdAt * 1_000);
  const unit = task.recurrenceUnit ?? "week";
  if (unit === "month") {
    const createdMonth = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1);
    const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const months = Math.max(0, (new Date(currentMonth).getUTCFullYear() - new Date(createdMonth).getUTCFullYear()) * 12 + new Date(currentMonth).getUTCMonth() - new Date(createdMonth).getUTCMonth());
    const bucket = Math.floor(months / every) * every;
    const startsAt = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth() + bucket, 1));
    return { key: `month:${startsAt.toISOString().slice(0, 7)}`, startsAt };
  }
  const dayMs = 86_400_000;
  const createdDay = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const intervalDays = unit === "week" ? every * 7 : every;
  const bucketDays = Math.floor(Math.max(0, currentDay - createdDay) / dayMs / intervalDays) * intervalDays;
  const startsAt = new Date(createdDay + bucketDays * dayMs);
  return { key: `${unit}:${utcDateKey(startsAt)}`, startsAt };
}

export function currentPeriodLabel(task: RecurringTask): string {
  if (task.recurrenceType !== "recurring") return "Completed";
  if (task.recurrenceUnit === "month") return "Completed this month";
  if (task.recurrenceUnit === "week") return "Completed this week";
  return "Completed today";
}
