import { describe, expect, it } from "vitest";
import { redactContactInfo, redactWallpaperIssueDetails } from "./privacy";

describe("contact redaction", () => {
  it("removes email, phone, URLs, domains and IP addresses", () => {
    const safe = redactContactInfo("ایمیل gamer@example.com، موبایل ۰۹۱۲۱۲۳۴۵۶۷ و 09121234567؛ https://example.com/private، pixelwp.example.com/path، 192.0.2.3 و ftp://files.example.net/a");
    expect(safe).toContain("[contact removed]");
    expect(safe).toContain("[link removed]");
    for (const sensitive of ["gamer@example.com", "09121234567", "https://", "pixelwp.example.com", "192.0.2.3", "files.example.net"]) {
      expect(safe).not.toContain(sensitive);
    }
  });

  it("preserves issue context, uses Persian placeholders, and caps sanitized text at 800 characters", () => {
    const safe = redactWallpaperIssueDetails("لینک دانلود خراب است؛ تماس: player@example.com، شماره ۰۹۱۲۱۲۳۴۵۶۷. آدرس https://example.com/file.webp");
    expect(safe).toContain("لینک دانلود خراب است");
    expect(safe).toContain("[اطلاعات تماس حذف شد]");
    expect(safe).toContain("[پیوند حذف شد]");
    expect(safe).not.toContain("player@example.com");
    expect(safe).not.toContain("۰۹۱۲۱۲۳۴۵۶۷");
    expect(redactWallpaperIssueDetails("x".repeat(801))).toHaveLength(800);
    expect(redactWallpaperIssueDetails(null)).toBeNull();
  });
});
