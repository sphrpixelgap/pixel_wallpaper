export const ADMIN_PERMISSION_SECTIONS = [
  { key: "overview", label: "نمای کلی", description: "آمار و میانبرهای داشبورد" },
  { key: "wallpapers", label: "والپیپرها", description: "افزودن، ویرایش، بایگانی و مدیریت نسخه‌ها" },
  { key: "requests", label: "درخواست‌ها", description: "مشاهده و مدیریت درخواست کاربران" },
  { key: "taxonomy", label: "دسته‌ها و برچسب‌ها", description: "مدیریت دسته‌ها، بازی‌ها و برچسب‌ها" },
  { key: "settings", label: "تنظیمات سایت", description: "ویرایش برند، صفحهٔ اصلی و SEO" },
  { key: "users", label: "حساب‌های سایت", description: "مشاهده و مدیریت نقش کاربران سایت؛ بدون مدیریت حساب مدیران" },
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_SECTIONS)[number]["key"];
export type AdminPermissions = Record<AdminPermissionKey, boolean>;

export const NO_ADMIN_PERMISSIONS: AdminPermissions = {
  overview: false,
  wallpapers: false,
  requests: false,
  taxonomy: false,
  settings: false,
  users: false,
};

export const FULL_ADMIN_PERMISSIONS: AdminPermissions = {
  overview: true,
  wallpapers: true,
  requests: true,
  taxonomy: true,
  settings: true,
  users: true,
};

export function hasAdminPermission(
  role: "owner" | "admin",
  permissions: Partial<AdminPermissions> | null | undefined,
  section: AdminPermissionKey,
): boolean {
  return role === "owner" || permissions?.[section] === true;
}
