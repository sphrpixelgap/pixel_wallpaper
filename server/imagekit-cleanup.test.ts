import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  listDueImageKitCleanupJobs: vi.fn(),
  completeImageKitCleanupJob: vi.fn(),
  retryImageKitCleanupJob: vi.fn(),
}));
vi.mock("./storage", () => ({ storageDeleteFile: vi.fn() }));

import * as db from "./db";
import { storageDeleteFile } from "./storage";
import { runImageKitCleanupQueue } from "./imagekit-cleanup";

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

describe("ImageKit cleanup outbox worker", () => {
  it("deletes the external file before completing its durable job", async () => {
    vi.mocked(db.listDueImageKitCleanupJobs).mockResolvedValue([{ fileId: "file-1", attempts: 0, nextAttemptAt: new Date(), createdAt: new Date() }]);
    vi.mocked(storageDeleteFile).mockResolvedValue();
    vi.mocked(db.completeImageKitCleanupJob).mockResolvedValue();
    await runImageKitCleanupQueue();
    expect(storageDeleteFile).toHaveBeenCalledWith("file-1");
    expect(db.completeImageKitCleanupJob).toHaveBeenCalledWith("file-1");
    expect(db.retryImageKitCleanupJob).not.toHaveBeenCalled();
  });

  it("keeps a failed deletion in the queue and schedules exponential backoff", async () => {
    vi.mocked(db.listDueImageKitCleanupJobs).mockResolvedValue([{ fileId: "file-2", attempts: 1, nextAttemptAt: new Date(), createdAt: new Date() }]);
    vi.mocked(storageDeleteFile).mockRejectedValue(new Error("temporary ImageKit outage"));
    vi.mocked(db.retryImageKitCleanupJob).mockResolvedValue();
    await runImageKitCleanupQueue();
    expect(db.completeImageKitCleanupJob).not.toHaveBeenCalled();
    const [fileId, nextAttempt] = vi.mocked(db.retryImageKitCleanupJob).mock.calls[0];
    expect(fileId).toBe("file-2");
    expect(nextAttempt.getTime()).toBeGreaterThan(Date.now());
    expect(nextAttempt.getTime()).toBeLessThanOrEqual(Date.now() + 120_000);
  });
});
