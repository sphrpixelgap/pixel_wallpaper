import { afterEach, describe, expect, it } from "vitest";
import { isSiteAdmin } from "./admin";

describe("site administrator access", () => {
  const originalAllowedEmails = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (originalAllowedEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalAllowedEmails;
  });

  it("allows a configured email regardless of letter case", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isSiteAdmin({ role: "user", email: "OWNER@EXAMPLE.COM", openId: "user-1" })).toBe(true);
  });

  it("lets an explicit blocked role override ADMIN_EMAILS", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isSiteAdmin({ role: "blocked", email: "owner@example.com", openId: "user-1" })).toBe(false);
  });

  it("keeps an explicit admin role active without an email allowlist", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isSiteAdmin({ role: "admin", email: null, openId: "user-1" })).toBe(true);
  });
});
