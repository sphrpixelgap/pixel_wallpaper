import { createHmac } from "node:crypto";

export const REQUEST_AI_CHECK_COOLDOWN_MS = 8_000;
export const REQUEST_SUBMISSION_COOLDOWN_MS = 30_000;
export const REQUEST_CHECK_LOCK_TTL_MS = 60_000;
export const REQUEST_LOOKUP_WINDOW_MS = 5 * 60_000;
export const REQUEST_LOOKUP_LIMIT = 12;
export const WALLPAPER_VIEW_WINDOW_MS = 60_000;
export const WALLPAPER_VIEW_LIMIT = 120;
export const WALLPAPER_REPORT_WINDOW_MS = 60 * 60_000;
export const WALLPAPER_REPORT_LIMIT = 5;
export const WALLPAPER_LIKE_WINDOW_MS = 24 * 60 * 60_000;
export const WALLPAPER_LIKE_LIMIT = 20;
export const WALLPAPER_DOWNLOAD_WINDOW_MS = 5 * 60_000;
export const WALLPAPER_DOWNLOAD_LIMIT = 60;
export const CLIENT_RATE_LIMIT_RETENTION_MS = 30 * 24 * 60 * 60_000;

export type RequestCreationThrottleRecord = {
  lastAiCheckAt: Date | null;
  lastSubmittedAt: Date | null;
  checkLockExpiresAt: Date | null;
};

export type RequestCreationThrottleStatus =
  | "allowed"
  | "recent_submission"
  | "recent_check"
  | "in_progress";

export function hashClientAddress(address: string, secret: string) {
  return createHmac("sha256", secret).update(address).digest("hex");
}

export function hashWallpaperDownloadAddress(address: string, secret: string) {
  if (!secret) throw new Error("A stable server secret is required for download rate limits.");
  return createHmac("sha256", secret).update(`wallpaper-download:${address}`).digest("hex");
}

export function getRequestCreationThrottleStatus(
  record: RequestCreationThrottleRecord,
  now: Date,
): RequestCreationThrottleStatus {
  const nowMs = now.getTime();
  if (record.lastSubmittedAt && nowMs - record.lastSubmittedAt.getTime() < REQUEST_SUBMISSION_COOLDOWN_MS) {
    return "recent_submission";
  }
  if (record.checkLockExpiresAt && record.checkLockExpiresAt.getTime() > nowMs) {
    return "in_progress";
  }
  if (record.lastAiCheckAt && nowMs - record.lastAiCheckAt.getTime() < REQUEST_AI_CHECK_COOLDOWN_MS) {
    return "recent_check";
  }
  return "allowed";
}

export type FixedWindowAttempt = {
  allowed: boolean;
  windowStartedAt: Date;
  attemptCount: number;
};

export function planFixedWindowAttempt(
  windowStartedAt: Date | null,
  attemptCount: number,
  now: Date,
  windowMs: number,
  limit: number,
): FixedWindowAttempt {
  const windowExpired = !windowStartedAt || now.getTime() - windowStartedAt.getTime() >= windowMs;
  if (!windowExpired && attemptCount >= limit) {
    return { allowed: false, windowStartedAt, attemptCount };
  }
  return {
    allowed: true,
    windowStartedAt: windowExpired ? now : windowStartedAt,
    attemptCount: windowExpired ? 1 : attemptCount + 1,
  };
}
