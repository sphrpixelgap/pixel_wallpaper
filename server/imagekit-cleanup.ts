import * as db from "./db";
import { storageDeleteFile } from "./storage";

let running = false;

export async function runImageKitCleanupQueue(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const jobs = await db.listDueImageKitCleanupJobs(now, 10);
    for (const job of jobs) {
      try {
        await storageDeleteFile(job.fileId);
        await db.completeImageKitCleanupJob(job.fileId);
      } catch (error) {
        const delayMs = Math.min(24 * 60 * 60 * 1000, 30_000 * 2 ** Math.min(job.attempts, 10));
        await db.retryImageKitCleanupJob(job.fileId, new Date(Date.now() + delayMs)).catch(() => undefined);
        console.warn("[ImageKit cleanup] Retry scheduled", error instanceof Error ? error.name : "UnknownError");
      }
    }
  } catch (error) {
    console.warn("[ImageKit cleanup] Queue unavailable", error instanceof Error ? error.name : "UnknownError");
  } finally {
    running = false;
  }
}

export function startImageKitCleanupWorker() {
  void runImageKitCleanupQueue();
  const timer = setInterval(() => void runImageKitCleanupQueue(), 60_000);
  timer.unref();
}
