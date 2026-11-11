import { afterEach, describe, expect, it, vi } from "vitest";
import { isBootstrapOwnerCandidate } from "./admin";
import {
  ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT,
  ADMIN_LOGIN_ATTEMPT_LIMIT,
  ADMIN_LOGIN_WINDOW_MS,
  ADMIN_SESSION_COOKIE,
  hashAdminPassword,
  hashAdminSessionToken,
  makeAdminLoginBucketHashes,
  normalizeAdminUsername,
  verifyAdminPassword,
  verifyAdminPasswordOrDummy,
} from "./admin-auth";

afterEach(() => vi.unstubAllEnvs());

describe("administrator credential primitives", () => {
  it("stores salted scrypt hashes and verifies only the matching password", async () => {
    const password = "a-long-owner-password-2026";
    const first = await hashAdminPassword(password);
    const second = await hashAdminPassword(password);
    expect(first).not.toContain(password);
    expect(first).not.toBe(second);
    await expect(verifyAdminPassword(password, first)).resolves.toBe(true);
    await expect(verifyAdminPassword("different-password", first)).resolves.toBe(false);
  });

  it("performs a dummy password verification for unknown accounts", async () => {
    await expect(verifyAdminPasswordOrDummy("incorrect-password", null)).resolves.toBe(false);
  });

  it("normalizes account usernames and rejects unsupported characters", () => {
    expect(normalizeAdminUsername("  Pixel.Owner_7 ")).toBe("pixel.owner_7");
    expect(() => normalizeAdminUsername("مدیر-اول")).toThrow();
    expect(() => normalizeAdminUsername("ab")).toThrow();
  });

  it("uses opaque independent HMAC buckets and conservative shared rate policy", () => {
    const first = makeAdminLoginBucketHashes("OWNER", "203.0.113.8", "unit-test-secret");
    const normalized = makeAdminLoginBucketHashes("owner", "203.0.113.8", "unit-test-secret");
    const otherAddress = makeAdminLoginBucketHashes("owner", "203.0.113.9", "unit-test-secret");
    expect(first).toEqual(normalized);
    expect(first).not.toEqual(otherAddress);
    expect(first).toHaveLength(2);
    expect(first.every(hash => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(first.join("")).not.toContain("203.0.113.8");
    expect(ADMIN_LOGIN_ATTEMPT_LIMIT).toBe(8);
    expect(ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT).toBe(60);
    expect(ADMIN_LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("stores only a one-way digest of the random session token", () => {
    const token = "random-session-token-value";
    const digest = hashAdminSessionToken(token);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
  });

  it("uses a host-only protected cookie name for admin sessions", () => {
    expect(ADMIN_SESSION_COOKIE).toBe("__Host-pixelwp_admin_session");
  });
});

describe("owner bootstrap policy", () => {
  const user = { role: "admin" as const, email: "owner@example.com", openId: "owner-open-id" };

  it("allows bootstrap with the sole configured admin email only", () => {
    vi.stubEnv("OWNER_OPEN_ID", "");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    expect(isBootstrapOwnerCandidate(user)).toBe(true);
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com,other@example.com");
    expect(isBootstrapOwnerCandidate(user)).toBe(false);
  });

  it("prefers the explicit owner identity and permits the configured owner to recover a blocked site account", () => {
    vi.stubEnv("OWNER_OPEN_ID", "owner-open-id");
    vi.stubEnv("ADMIN_EMAILS", "other@example.com");
    expect(isBootstrapOwnerCandidate(user)).toBe(true);
    expect(isBootstrapOwnerCandidate({ ...user, openId: "another-id" })).toBe(false);
    expect(isBootstrapOwnerCandidate({ ...user, role: "blocked" })).toBe(true);
    vi.stubEnv("OWNER_OPEN_ID", "");
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com");
    expect(isBootstrapOwnerCandidate({ ...user, role: "blocked" })).toBe(true);
  });
});
