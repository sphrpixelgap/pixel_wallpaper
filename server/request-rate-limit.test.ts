import { describe, expect, it } from "vitest";
import {
  getRequestCreationThrottleStatus,
  hashClientAddress,
  hashWallpaperDownloadAddress,
  planFixedWindowAttempt,
  REQUEST_AI_CHECK_COOLDOWN_MS,
  REQUEST_LOOKUP_LIMIT,
  REQUEST_LOOKUP_WINDOW_MS,
  REQUEST_SUBMISSION_COOLDOWN_MS,
  WALLPAPER_REPORT_LIMIT,
  WALLPAPER_REPORT_WINDOW_MS,
  WALLPAPER_DOWNLOAD_LIMIT,
  WALLPAPER_DOWNLOAD_WINDOW_MS,
  WALLPAPER_VIEW_LIMIT,
  WALLPAPER_VIEW_WINDOW_MS,
} from "./request-rate-limit";

const now = new Date("2026-11-02T15:00:00.000Z");

function offset(ms: number) {
  return new Date(now.getTime() - ms);
}

describe("shared request throttling policy", () => {
  it("blocks only within the successful-submission cooldown", () => {
    expect(getRequestCreationThrottleStatus({
      lastAiCheckAt: null,
      lastSubmittedAt: offset(REQUEST_SUBMISSION_COOLDOWN_MS - 1),
      checkLockExpiresAt: null,
    }, now)).toBe("recent_submission");
    expect(getRequestCreationThrottleStatus({
      lastAiCheckAt: null,
      lastSubmittedAt: offset(REQUEST_SUBMISSION_COOLDOWN_MS),
      checkLockExpiresAt: null,
    }, now)).toBe("allowed");
  });

  it("rejects an active in-flight lock and enforces the AI-check cooldown", () => {
    expect(getRequestCreationThrottleStatus({
      lastAiCheckAt: offset(REQUEST_AI_CHECK_COOLDOWN_MS),
      lastSubmittedAt: null,
      checkLockExpiresAt: new Date(now.getTime() + 1),
    }, now)).toBe("in_progress");
    expect(getRequestCreationThrottleStatus({
      lastAiCheckAt: offset(REQUEST_AI_CHECK_COOLDOWN_MS - 1),
      lastSubmittedAt: null,
      checkLockExpiresAt: null,
    }, now)).toBe("recent_check");
    expect(getRequestCreationThrottleStatus({
      lastAiCheckAt: offset(REQUEST_AI_CHECK_COOLDOWN_MS),
      lastSubmittedAt: null,
      checkLockExpiresAt: null,
    }, now)).toBe("allowed");
  });

  it("increments fixed windows up to their limits and resets at the boundary", () => {
    const lookupStart = offset(1_000);
    expect(planFixedWindowAttempt(lookupStart, REQUEST_LOOKUP_LIMIT - 1, now, REQUEST_LOOKUP_WINDOW_MS, REQUEST_LOOKUP_LIMIT))
      .toEqual({ allowed: true, windowStartedAt: lookupStart, attemptCount: REQUEST_LOOKUP_LIMIT });
    expect(planFixedWindowAttempt(lookupStart, REQUEST_LOOKUP_LIMIT, now, REQUEST_LOOKUP_WINDOW_MS, REQUEST_LOOKUP_LIMIT))
      .toEqual({ allowed: false, windowStartedAt: lookupStart, attemptCount: REQUEST_LOOKUP_LIMIT });
    expect(planFixedWindowAttempt(offset(REQUEST_LOOKUP_WINDOW_MS), REQUEST_LOOKUP_LIMIT, now, REQUEST_LOOKUP_WINDOW_MS, REQUEST_LOOKUP_LIMIT))
      .toEqual({ allowed: true, windowStartedAt: now, attemptCount: 1 });

    const viewStart = offset(1_000);
    expect(planFixedWindowAttempt(viewStart, WALLPAPER_VIEW_LIMIT, now, WALLPAPER_VIEW_WINDOW_MS, WALLPAPER_VIEW_LIMIT).allowed)
      .toBe(false);

    const reportStart = offset(1_000);
    expect(planFixedWindowAttempt(reportStart, WALLPAPER_REPORT_LIMIT - 1, now, WALLPAPER_REPORT_WINDOW_MS, WALLPAPER_REPORT_LIMIT))
      .toEqual({ allowed: true, windowStartedAt: reportStart, attemptCount: WALLPAPER_REPORT_LIMIT });
    expect(planFixedWindowAttempt(reportStart, WALLPAPER_REPORT_LIMIT, now, WALLPAPER_REPORT_WINDOW_MS, WALLPAPER_REPORT_LIMIT).allowed)
      .toBe(false);
    expect(planFixedWindowAttempt(offset(WALLPAPER_REPORT_WINDOW_MS), WALLPAPER_REPORT_LIMIT, now, WALLPAPER_REPORT_WINDOW_MS, WALLPAPER_REPORT_LIMIT))
      .toEqual({ allowed: true, windowStartedAt: now, attemptCount: 1 });
  });

  it("creates a stable keyed pseudonymous address fingerprint", () => {
    const first = hashClientAddress("203.0.113.4", "private-project-secret");
    expect(first).toHaveLength(64);
    expect(hashClientAddress("203.0.113.4", "private-project-secret")).toBe(first);
    expect(hashClientAddress("203.0.113.4", "different-secret")).not.toBe(first);
    expect(first).not.toContain("203.0.113.4");
  });

  it("uses a separate opaque fixed-window bucket for wallpaper downloads", () => {
    const first = hashWallpaperDownloadAddress("203.0.113.4", "private-project-secret");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.4");
    expect(first).not.toBe(hashClientAddress("203.0.113.4", "private-project-secret"));
    expect(WALLPAPER_DOWNLOAD_WINDOW_MS).toBe(5 * 60_000);
    expect(WALLPAPER_DOWNLOAD_LIMIT).toBe(60);
    expect(planFixedWindowAttempt(offset(1_000), WALLPAPER_DOWNLOAD_LIMIT, now, WALLPAPER_DOWNLOAD_WINDOW_MS, WALLPAPER_DOWNLOAD_LIMIT).allowed).toBe(false);
  });
});
