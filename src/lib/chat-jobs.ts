/**
 * In-memory store для фоновых задач чата.
 * Долгие запросы (>30s) возвращают 202 и продолжают выполняться в фоне.
 */

const BACKGROUND_AFTER_MS = 30_000;
const MAX_BACKGROUND_JOBS = parseInt(process.env.CHAT_BACKGROUND_JOBS_MAX ?? "2", 10) || 2;
const JOB_TTL_MS = 60 * 60 * 1000; // 1 час, потом удаляем
/** Таймаут фонового задания: если не завершилось — помечаем ошибкой */
export const BACKGROUND_JOB_TIMEOUT_MS = 12 * 60 * 1000; // 12 мин (Ollama до 10 мин + запас)

export type ChatJobStatus = "running" | "done" | "error";

export type ChatJob = {
  jobId: string;
  threadId: string;
  userId: string;
  status: ChatJobStatus;
  reply?: string;
  error?: string;
  sources?: Array<{ id: string; threadId: string; threadTitle: string; title?: string | null; snippet: string }>;
  createdAt: number;
};

const jobs = new Map<string, ChatJob>();

function cleanupOld(): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (job.status !== "running" && now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

export function getBackgroundAfterMs(): number {
  return BACKGROUND_AFTER_MS;
}

export function getMaxBackgroundJobs(): number {
  return MAX_BACKGROUND_JOBS;
}

export function countRunningJobs(): number {
  cleanupOld();
  let n = 0;
  for (const job of jobs.values()) if (job.status === "running") n++;
  return n;
}

export function createJob(threadId: string, userId: string): string {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  jobs.set(jobId, {
    jobId,
    threadId,
    userId,
    status: "running",
    createdAt: Date.now(),
  });
  return jobId;
}

export function getJob(jobId: string): ChatJob | null {
  return jobs.get(jobId) ?? null;
}

export function setJobDone(jobId: string, reply: string, sources?: ChatJob["sources"]): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "done";
    job.reply = reply;
    job.sources = sources;
  }
}

export function setJobError(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (job) {
    job.status = "error";
    job.error = error;
  }
}

export function canAcceptBackground(): boolean {
  return countRunningJobs() < MAX_BACKGROUND_JOBS;
}

/** Количество запущенных фоновых задач для данного пространства и пользователя */
export function getRunningCountForThread(threadId: string, userId: string): number {
  cleanupOld();
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === "running" && job.threadId === threadId && job.userId === userId) n++;
  }
  return n;
}
