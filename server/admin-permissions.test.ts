import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSION_SECTIONS, FULL_ADMIN_PERMISSIONS, hasAdminPermission, NO_ADMIN_PERMISSIONS } from "../shared/admin-permissions";

describe("admin section permissions", () => {
  it("defines all six independently controlled sections", () => {
    expect(ADMIN_PERMISSION_SECTIONS.map(section => section.key)).toEqual([
      "overview",
      "wallpapers",
      "requests",
      "taxonomy",
      "settings",
      "users",
    ]);
  });

  it("defaults a new admin to no section access", () => {
    for (const section of ADMIN_PERMISSION_SECTIONS) {
      expect(hasAdminPermission("admin", NO_ADMIN_PERMISSIONS, section.key)).toBe(false);
    }
  });

  it("does not let one enabled section grant another section", () => {
    const permissions = { ...NO_ADMIN_PERMISSIONS, wallpapers: true };
    expect(hasAdminPermission("admin", permissions, "wallpapers")).toBe(true);
    expect(hasAdminPermission("admin", permissions, "requests")).toBe(false);
    expect(hasAdminPermission("admin", permissions, "settings")).toBe(false);
  });

  it("always gives the owner access to every section", () => {
    for (const section of ADMIN_PERMISSION_SECTIONS) {
      expect(hasAdminPermission("owner", NO_ADMIN_PERMISSIONS, section.key)).toBe(true);
    }
    expect(FULL_ADMIN_PERMISSIONS).toEqual({
      overview: true,
      wallpapers: true,
      requests: true,
      taxonomy: true,
      settings: true,
      users: true,
    });
  });
});
