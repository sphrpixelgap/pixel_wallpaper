import { UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ADMIN_PERMISSION_SECTIONS, hasAdminPermission, type AdminPermissionKey } from "../../shared/admin-permissions";
import { recordAdminActivity } from "../db";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const adminSessionProcedure = t.procedure.use(t.middleware(async ({ ctx, next }) => {
  if (!ctx.adminSession) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, adminSession: ctx.adminSession } });
}));

function adminAuditSection(path: string): "wallpapers" | "requests" | "taxonomy" | "settings" | "users" | "admins" | null {
  if (path.startsWith("adminAuth.")) return "admins";
  if (path === "admin.updateUserRole") return "users";
  if (path.startsWith("admin.")) return "wallpapers";
  if (path.startsWith("requests.")) return "requests";
  if (path.startsWith("taxonomy.")) return "taxonomy";
  if (path === "siteSettings.update") return "settings";
  return null;
}

function safeAuditEntityId(input: unknown): number | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const nested = record.wallpaper && typeof record.wallpaper === "object" ? record.wallpaper as Record<string, unknown> : null;
  const value = record.id ?? record.wallpaperId ?? nested?.id;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export const adminProcedure = adminSessionProcedure.use(t.middleware(async ({ ctx, next, path, type, input }) => {
  const session = ctx.adminSession;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (session.mustChangePassword) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "پیش از ادامه، رمز عبور اولیه را تغییر دهید." });
  }
  const result = await next({ ctx: { ...ctx, adminSession: session } });
  if (type === "mutation" && result.ok) {
    const section = adminAuditSection(path);
    if (section) {
      try {
        await recordAdminActivity({
          actorAccountId: session.id, actorUsername: session.username, section,
          actionKey: path.slice(0, 128), entityId: safeAuditEntityId(input), createdAt: new Date(),
        });
      } catch (error) {
        console.warn(`[AdminAudit] Activity could not be recorded (${error instanceof Error ? error.name : "UnknownError"}).`);
      }
    }
  }
  return result;
}));

export const adminSectionProcedure = (section: AdminPermissionKey) => adminProcedure.use(t.middleware(async ({ ctx, next }) => {
  const session = ctx.adminSession;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!hasAdminPermission(session.role, session.permissions, section)) {
    const label = ADMIN_PERMISSION_SECTIONS.find(item => item.key === section)?.label ?? section;
    throw new TRPCError({ code: "FORBIDDEN", message: `حساب شما اجازهٔ دسترسی به بخش «${label}» را ندارد.` });
  }
  return next({ ctx: { ...ctx, adminSession: session } });
}));

export const ownerProcedure = adminProcedure.use(t.middleware(async ({ ctx, next }) => {
  const session = ctx.adminSession;
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (session.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط برای مالک سایت مجاز است." });
  }
  return next({ ctx: { ...ctx, adminSession: session } });
}));
