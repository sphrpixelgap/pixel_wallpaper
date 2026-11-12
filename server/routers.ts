import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { adminSectionProcedure, adminSessionProcedure, ownerProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { isBootstrapOwnerCandidate, isSiteAdmin } from "./admin";
import { ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT, ADMIN_LOGIN_ATTEMPT_LIMIT, ADMIN_LOGIN_WINDOW_MS, clearAdminSession, getAdminRequestAddress, hashAdminPassword, issueAdminSession, makeAdminLoginBucketHashes, normalizeAdminUsername, verifyAdminPassword, verifyAdminPasswordOrDummy } from "./admin-auth";
import * as db from "./db";
import { NO_ADMIN_PERMISSIONS } from "../shared/admin-permissions";
import type { Wallpaper } from "../drizzle/schema";
import { checkWallpaperRequestDuplicates, getRequestDuplicatePolicy } from "./request-duplicate-check";
import { hashClientAddress } from "./request-rate-limit";
import { storageDeleteFile, storagePromotePrivateImage, storageSignPrivateUrl } from "./storage";
import { runImageKitCleanupQueue } from "./imagekit-cleanup";

type CommunitySubmission = NonNullable<Awaited<ReturnType<typeof db.getCommunityWallpaperSubmission>>>;
type AdminWallpaperWithSubmission = {
  imageKey: string;
  imageUrl: string;
  imageFileId?: string | null;
  thumbnailKey: string | null;
  thumbnailUrl: string | null;
  thumbnailFileId?: string | null;
  communitySubmission?: CommunitySubmission | null;
};

async function signAdminWallpaperPreview<T extends AdminWallpaperWithSubmission>(item: T): Promise<T> {
  const submission = item.communitySubmission;
  if (!submission) return item;
  return {
    ...item,
    imageFileId: submission.publicImageFileId,
    thumbnailFileId: submission.publicThumbnailFileId,
    imageUrl: submission.privateImageFileId ? storageSignPrivateUrl(item.imageKey, 900) : item.imageUrl,
    thumbnailUrl: submission.privateThumbnailFileId && item.thumbnailKey
      ? storageSignPrivateUrl(item.thumbnailKey, 900)
      : item.thumbnailUrl,
  };
}

async function signAdminWallpaperPage<T extends { items: AdminWallpaperWithSubmission[] }>(page: T): Promise<T> {
  return { ...page, items: await Promise.all(page.items.map(signAdminWallpaperPreview)) };
}

function requestClientHash(request: Parameters<typeof getAdminRequestAddress>[0]) {
  const address = getAdminRequestAddress(request);
  const secret = ENV.cookieSecret || process.env.DATABASE_URL || "pixelwp-client-rate-limit-v1";
  return hashClientAddress(address, secret);
}

function publicWallpaper<T extends Wallpaper>(item: T): Omit<T, "imageFileId" | "thumbnailFileId"> {
  const result = { ...item } as Omit<T, "imageFileId" | "thumbnailFileId"> & Partial<Pick<T, "imageFileId" | "thumbnailFileId">>;
  delete result.imageFileId;
  delete result.thumbnailFileId;
  return result;
}

function publicWallpaperPage<TItem extends Wallpaper, TPage extends { items: TItem[] }>(page: TPage): Omit<TPage, "items"> & { items: Array<Omit<TItem, "imageFileId" | "thumbnailFileId">> } {
  return { ...page, items: page.items.map(publicWallpaper) };
}

const siteSettingsFields = z.object({
  brandName: z.string().trim().min(2).max(100),
  brandCaption: z.string().trim().min(2).max(120),
  footerTagline: z.string().trim().min(2).max(180),
  logoUrl: z.string().trim().min(1).max(1024).refine(value => {
    if (value.startsWith("/manus-storage/") && !value.includes("..")) return true;
    try { const parsed = new URL(value); return parsed.protocol === "https:" && !parsed.username && !parsed.password; }
    catch { return false; }
  }, "نشانی لوگو باید HTTPS یا مسیر ذخیره‌سازی سایت باشد."),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  heroEyebrow: z.string().trim().min(2).max(120),
  heroTitle: z.string().trim().min(2).max(100),
  heroAccentTitle: z.string().trim().min(2).max(100),
  heroSubtitle: z.string().trim().min(2).max(500),
  seoTitle: z.string().trim().min(2).max(180),
  seoDescription: z.string().trim().min(2).max(320),
});

const variantFields = z.object({
  resolution: z.string().trim().min(2).max(40),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  targetDevice: z.enum(["desktop", "mobile", "ultrawide"]),
  imageKey: z.string().min(1).max(512),
  imageUrl: z.string().url().startsWith("https://").max(1024),
  imageMime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  fileSize: z.number().int().min(0).max(12 * 1024 * 1024),
});

const wallpaperFields = z.object({
  title: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(80),
  gameTitle: z.string().trim().max(160).optional().nullable(),
  tags: z.string().max(1500).optional().nullable(),
  mood: z.string().trim().max(40).optional(),
  dominantColor: z.enum(["purple", "blue", "red", "green", "orange", "mono"]).optional(),
  targetDevice: z.enum(["desktop", "mobile", "ultrawide"]).optional(),
  resolution: z.string().trim().min(2).max(40),
  width: z.number().int().positive().max(20000).nullable().optional(),
  height: z.number().int().positive().max(20000).nullable().optional(),
  description: z.string().trim().max(3000).optional().nullable(),
  imageKey: z.string().min(1).max(512),
  imageUrl: z.string().url().startsWith("https://").max(1024),
  imageFileId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional().nullable(),
  imageMime: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  fileSize: z.number().int().min(0).max(12 * 1024 * 1024).optional(),
  thumbnailKey: z.string().max(512).optional().nullable(),
  thumbnailUrl: z.string().url().startsWith("https://").max(1024).optional().nullable(),
  thumbnailFileId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional().nullable(),
});

const wallpaperRequestFields = z.object({
  gameTitle: z.string().trim().min(2).max(160),
  wantedContent: z.string().trim().min(2).max(200),
  targetDevice: z.enum(["desktop", "mobile", "ultrawide", "any"]),
  resolution: z.string().trim().max(40).optional().nullable(),
  details: z.string().trim().max(1200).optional().nullable(),
  website: z.string().max(200).optional(),
});
const wallpaperIssueReportFields = z.object({
  wallpaperId: z.number().int().positive(),
  reason: z.enum(["download", "quality", "wrong_info", "duplicate", "broken", "irrelevant", "other"]),
  details: z.string().trim().max(800).optional().nullable(),
  website: z.string().max(200).optional(),
});

const adminUsernameInput = z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/);
const adminPasswordInput = z.string().min(12).max(128);
const adminLoginPasswordInput = z.string().min(1).max(128);
const adminAccountIdInput = z.number().int().positive();
const adminPermissionsSchema = z.object({
  overview: z.boolean(),
  wallpapers: z.boolean(),
  requests: z.boolean(),
  taxonomy: z.boolean(),
  settings: z.boolean(),
  users: z.boolean(),
}).strict();

function isDuplicateUsernameError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; errno?: unknown };
  return value.code === "ER_DUP_ENTRY" || value.errno === 1062;
}

const filterInput = z.object({
  q: z.string().max(120).optional(), category: z.string().max(80).optional(), resolution: z.string().max(40).optional(),
  gameTitle: z.string().max(160).optional(), targetDevice: z.enum(["desktop", "mobile", "ultrawide"]).optional(),
  mood: z.string().max(40).optional(), dominantColor: z.enum(["purple", "blue", "red", "green", "orange", "mono"]).optional(),
  sort: z.enum(["newest", "popular", "resolution", "aspect", "size"]).optional(), limit: z.number().int().min(1).max(120).optional(),
}).optional();
const catalogPageInput = z.object({
  q: z.string().max(120).optional(), category: z.string().max(80).optional(), resolution: z.string().max(40).optional(),
  gameTitle: z.string().max(160).optional(), targetDevice: z.enum(["desktop", "mobile", "ultrawide"]).optional(),
  mood: z.string().max(40).optional(), dominantColor: z.enum(["purple", "blue", "red", "green", "orange", "mono"]).optional(),
  sort: z.enum(["newest", "popular", "resolution", "aspect", "size"]).optional(),
  page: z.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / 24)),
  pageSize: z.number().int().min(1).max(24).optional(),
});

export const appRouter = router({
  system: systemRouter,
  adminAuth: router({
    status: publicProcedure.query(async ({ ctx }) => {
      const owner = await db.getOwnerAdminAccount();
      const session = ctx.adminSession;
      return {
        setupRequired: !owner,
        bootstrapAvailable: !owner && isBootstrapOwnerCandidate(ctx.user),
        recoveryAvailable: false,
        account: session ? {
          id: session.id,
          username: session.username,
          role: session.role,
          permissions: session.permissions,
          mustChangePassword: session.mustChangePassword,
          isRecovery: session.isRecovery,
        } : null,
      };
    }),
    login: publicProcedure.input(z.object({ username: adminUsernameInput, password: adminLoginPasswordInput })).mutation(async ({ input, ctx }) => {
      const username = normalizeAdminUsername(input.username);
      const buckets = makeAdminLoginBucketHashes(username, getAdminRequestAddress(ctx.req), ENV.cookieSecret);
      const allowed = await db.consumeAdminLoginLimits([
        { hash: buckets[0], limit: ADMIN_LOGIN_ATTEMPT_LIMIT },
        { hash: buckets[1], limit: ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT },
      ], new Date(), ADMIN_LOGIN_WINDOW_MS);
      if (!allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تلاش‌های ورود بیش از حد بوده؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." });
      const account = await db.getAdminAccountByUsername(username);
      const validPassword = await verifyAdminPasswordOrDummy(input.password, account?.passwordHash);
      if (!account || account.isActive !== 1 || !validPassword) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "نام‌کاربری یا رمز عبور درست نیست." });
      }
      await db.clearAdminLoginLimits([buckets[0]]);
      await issueAdminSession(account.id, ctx.req, ctx.res);
      return { success: true } as const;
    }),
    bootstrapOwner: protectedProcedure.input(z.object({ username: adminUsernameInput, password: adminPasswordInput })).mutation(async ({ input, ctx }) => {
      if (!isBootstrapOwnerCandidate(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "راه‌اندازی مالک فقط برای هویت OAuth از پیش مجاز امکان‌پذیر است." });
      if (await db.getOwnerAdminAccount()) throw new TRPCError({ code: "CONFLICT", message: "حساب مالک قبلاً راه‌اندازی شده است." });
      const now = new Date();
      const id = await db.createOwnerAdminAccount({
        username: normalizeAdminUsername(input.username),
        passwordHash: await hashAdminPassword(input.password),
        ownerOpenId: ctx.user.openId,
        now,
      });
      if (!id) throw new TRPCError({ code: "CONFLICT", message: "حساب مالک قبلاً راه‌اندازی شده است." });
      await issueAdminSession(id, ctx.req, ctx.res);
      return { success: true } as const;
    }),
    recoverOwner: publicProcedure.mutation(async ({ ctx }) => {
      throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "بازیابی Manus غیرفعال است؛ از رمز پنل استفاده کنید." });
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await clearAdminSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
    changePassword: adminSessionProcedure.input(z.object({ currentPassword: adminLoginPasswordInput, newPassword: adminPasswordInput }))
      .mutation(async ({ input, ctx }) => {
        if (input.currentPassword === input.newPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "رمز جدید باید با رمز فعلی متفاوت باشد." });
        const buckets = makeAdminLoginBucketHashes(ctx.adminSession!.username, getAdminRequestAddress(ctx.req), ENV.cookieSecret);
        const allowed = await db.consumeAdminLoginLimits([
          { hash: buckets[0], limit: ADMIN_LOGIN_ATTEMPT_LIMIT },
          { hash: buckets[1], limit: ADMIN_LOGIN_ADDRESS_ATTEMPT_LIMIT },
        ], new Date(), ADMIN_LOGIN_WINDOW_MS);
        if (!allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تلاش‌های تغییر رمز بیش از حد بوده؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." });
        const account = await db.getAdminAccountById(ctx.adminSession!.id);
        if (!account || !await verifyAdminPassword(input.currentPassword, account.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "رمز فعلی درست نیست." });
        }
        await db.changeAdminPassword(account.id, await hashAdminPassword(input.newPassword), ctx.adminSession!.tokenHash, new Date());
        await db.clearAdminLoginLimits([buckets[0]]);
        try { await db.recordAdminActivity({ actorAccountId: account.id, actorUsername: account.username, section: "admins", actionKey: "adminAuth.changePassword", entityId: account.id, createdAt: new Date() }); }
        catch (error) { console.warn(`[AdminAudit] Password-change activity could not be recorded (${error instanceof Error ? error.name : "UnknownError"}).`); }
        return { success: true } as const;
      }),
    updateOwnerCredentials: ownerProcedure.input(z.object({ username: adminUsernameInput.optional(), password: adminPasswordInput.optional() })
      .refine(value => Boolean(value.username || value.password), "نام‌کاربری یا رمز جدید لازم است."))
      .mutation(async ({ input, ctx }) => {
        try {
          const updated = await db.updateOwnerAdminCredentials({
            accountId: ctx.adminSession!.id,
            username: input.username ? normalizeAdminUsername(input.username) : undefined,
            passwordHash: input.password ? await hashAdminPassword(input.password) : undefined,
            tokenHash: ctx.adminSession!.tokenHash,
            now: new Date(),
          });
          if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مالک پیدا نشد." });
          return { success: true } as const;
        } catch (error) {
          if (isDuplicateUsernameError(error)) throw new TRPCError({ code: "CONFLICT", message: "این نام‌کاربری از قبل استفاده شده است." });
          throw error;
        }
      }),
    accounts: ownerProcedure.query(() => db.listManagedAdminAccounts()),
    createAccount: ownerProcedure.input(z.object({
      username: adminUsernameInput,
      password: adminPasswordInput,
      permissions: adminPermissionsSchema.default(NO_ADMIN_PERMISSIONS),
    })).mutation(async ({ input }) => {
      try {
        const id = await db.createManagedAdminAccount({ username: normalizeAdminUsername(input.username), passwordHash: await hashAdminPassword(input.password), permissions: input.permissions, now: new Date() });
        return { success: true, id } as const;
      } catch (error) {
        if (isDuplicateUsernameError(error)) throw new TRPCError({ code: "CONFLICT", message: "این نام‌کاربری از قبل استفاده شده است." });
        throw error;
      }
    }),
    updateAccountPermissions: ownerProcedure.input(z.object({ id: adminAccountIdInput, permissions: adminPermissionsSchema })).mutation(async ({ input }) => {
      const updated = await db.updateManagedAdminPermissions(input.id, input.permissions, new Date());
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مدیر پیدا نشد." });
      return { success: true } as const;
    }),
    renameAccount: ownerProcedure.input(z.object({ id: adminAccountIdInput, username: adminUsernameInput })).mutation(async ({ input }) => {
      try {
        const updated = await db.renameManagedAdminAccount(input.id, normalizeAdminUsername(input.username), new Date());
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مدیر پیدا نشد." });
        return { success: true } as const;
      } catch (error) {
        if (isDuplicateUsernameError(error)) throw new TRPCError({ code: "CONFLICT", message: "این نام‌کاربری از قبل استفاده شده است." });
        throw error;
      }
    }),
    resetAccountPassword: ownerProcedure.input(z.object({ id: adminAccountIdInput, password: adminPasswordInput })).mutation(async ({ input }) => {
      const updated = await db.resetManagedAdminPassword(input.id, await hashAdminPassword(input.password), new Date());
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مدیر پیدا نشد." });
      return { success: true } as const;
    }),
    setAccountActive: ownerProcedure.input(z.object({ id: adminAccountIdInput, active: z.boolean() })).mutation(async ({ input }) => {
      const updated = await db.setManagedAdminActive(input.id, input.active, new Date());
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مدیر پیدا نشد." });
      return { success: true } as const;
    }),
    deleteAccount: ownerProcedure.input(z.object({ id: adminAccountIdInput })).mutation(async ({ input, ctx }) => {
      if (ctx.adminSession!.id === input.id) throw new TRPCError({ code: "FORBIDDEN", message: "حساب مدیرِ واردشده قابل حذف نیست." });
      const deleted = await db.deleteManagedAdminAccount(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "حساب مدیر پیدا نشد." });
      return { success: true } as const;
    }),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user ? { ...ctx.user, isAdmin: isSiteAdmin(ctx.user) } : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  games: router({ list: publicProcedure.query(() => db.listGames()) }),
  discover: router({
    random: publicProcedure.query(() => db.getRandomWallpaper()),
    daily: publicProcedure.query(() => {
      const day = new Date().toISOString().slice(0, 10);
      return db.getDailyWallpaper(day).then(wallpaper => wallpaper ? { day, wallpaper } : null);
    }),
  }),
  siteSettings: router({
    public: publicProcedure.query(() => db.getSiteSettings()),
    update: adminSectionProcedure("settings").input(siteSettingsFields).mutation(({ input }) => db.updateSiteSettings(input)),
  }),
  taxonomy: router({
    categories: publicProcedure.query(() => db.listWallpaperCategories()),
    adminList: adminSectionProcedure("taxonomy").query(() => db.listAdminTaxonomy()),
    createCategory: adminSectionProcedure("taxonomy").input(z.object({ name: z.string().trim().min(2).max(80) })).mutation(({ input }) => db.createWallpaperCategory(input.name)),
    renameCategory: adminSectionProcedure("taxonomy").input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(80) })).mutation(({ input }) => db.renameWallpaperCategory(input.id, input.name)),
    deleteCategory: adminSectionProcedure("taxonomy").input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => db.deleteWallpaperCategory(input.id)),
    renameGame: adminSectionProcedure("taxonomy").input(z.object({ oldName: z.string().trim().min(1).max(160), newName: z.string().trim().min(2).max(160) })).mutation(({ input }) => db.renameGame(input.oldName, input.newName)),
    removeGame: adminSectionProcedure("taxonomy").input(z.object({ name: z.string().trim().min(1).max(160) })).mutation(({ input }) => db.removeGame(input.name)),
    renameTag: adminSectionProcedure("taxonomy").input(z.object({ oldName: z.string().trim().min(1).max(80), newName: z.string().trim().min(1).max(80) })).mutation(({ input }) => db.renameTag(input.oldName, input.newName)),
    removeTag: adminSectionProcedure("taxonomy").input(z.object({ name: z.string().trim().min(1).max(80) })).mutation(({ input }) => db.removeTag(input.name)),
  }),
  requests: router({
    create: publicProcedure.input(wallpaperRequestFields).mutation(async ({ input, ctx }) => {
      if (input.website?.trim()) return { success: true, trackingCode: null, duplicateBlocked: false, duplicateWarning: null, matches: [] };
      const clientHash = requestClientHash(ctx.req);
      const lockToken = randomBytes(16).toString("hex");
      const throttle = await db.claimWallpaperRequestCheck(clientHash, lockToken, new Date());
      if (throttle !== "claimed") {
        const message = throttle === "recent_submission"
          ? "برای ثبت درخواست بعدی کمی صبر کنید."
          : throttle === "recent_check"
            ? "برای بررسی دوباره کمی صبر کنید."
            : "درخواستت در حال بررسی است.";
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
      }
      const { website: _website, ...request } = input;
      try {
        const duplicateCheck = await checkWallpaperRequestDuplicates(request);
        const duplicatePolicy = getRequestDuplicatePolicy(duplicateCheck.state);
        if (duplicatePolicy.blocked) {
          return { success: false, trackingCode: null, duplicateBlocked: true, duplicateWarning: null, matches: duplicateCheck.matches };
        }

        const trackingCode = randomBytes(16).toString("hex");
        const createdRequestId = await db.createWallpaperRequestWithActiveCheckLock(
          { ...request, trackingCode }, clientHash, lockToken, new Date(),
        );
        if (!createdRequestId) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "بررسی درخواست طولانی شد؛ لطفاً کمی بعد دوباره تلاش کنید." });
        }
        return { success: true, trackingCode, duplicateBlocked: false, duplicateWarning: duplicatePolicy.warning, matches: duplicateCheck.matches };
      } finally {
        try {
          await db.releaseWallpaperRequestCheck(clientHash, lockToken);
        } catch (error) {
          console.warn(`[RequestRateLimit] Could not release request lock (${error instanceof Error ? error.name : "UnknownError"}).`);
        }
      }
    }),
    lookup: publicProcedure.input(z.unknown().transform(value => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return "";
      const code = (value as { code?: unknown }).code;
      return typeof code === "string" ? code.trim().slice(0, 256).toLowerCase() : "";
    })).query(async ({ input: code, ctx }) => {
      if (!await db.consumeRequestLookupAttempt(requestClientHash(ctx.req), new Date())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید." });
      }
      if (!/^[a-f0-9]{32}$/.test(code)) return null;
      return db.getPublicRequestStatus(code);
    }),
    adminList: adminSectionProcedure("requests").input(z.object({ page: z.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / 25)) })).query(({ input }) => db.listWallpaperRequests(input.page)),
    updateStatus: adminSectionProcedure("requests").input(z.object({
      id: z.number().int().positive(), status: z.enum(["new", "reviewed", "completed"]),
    })).mutation(async ({ input }) => {
      await db.updateWallpaperRequestStatus(input.id, input.status);
      return { success: true };
    }),
    deletePermanently: adminSectionProcedure("requests").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await db.deleteWallpaperRequest(input.id);
      return { success: true };
    }),
    issueReportsPage: adminSectionProcedure("requests").input(z.object({ page: z.number().int().min(1).max(1_000_000), status: z.enum(["new", "reviewed", "resolved", "dismissed"]).optional() }))
      .query(({ input }) => db.listWallpaperIssueReports(input.page, input.status)),
    updateIssueReportStatus: adminSectionProcedure("requests").input(z.object({ id: z.number().int().positive(), status: z.enum(["new", "reviewed", "resolved", "dismissed"]) }))
      .mutation(async ({ input }) => {
        if (!await db.updateWallpaperIssueReportStatus(input.id, input.status)) throw new TRPCError({ code: "NOT_FOUND", message: "گزارش پیدا نشد." });
        return { success: true };
      }),
  }),
  wallpapers: router({
    list: publicProcedure.input(filterInput).query(async ({ input }) => (await db.listWallpapers(input ?? {})).map(publicWallpaper)),
    page: publicProcedure.input(catalogPageInput).query(async ({ input }) => {
      const { page, pageSize, ...filters } = input;
      return publicWallpaperPage(await db.listWallpapersPage(filters, page, pageSize ?? 24));
    }),
    byIds: publicProcedure.input(z.object({ ids: z.array(z.number().int().positive()).max(1000) })).query(async ({ input }) => (await db.listWallpapersByIds(input.ids)).map(publicWallpaper)),
    suggestions: publicProcedure.input(z.object({ q: z.string().trim().min(2).max(80) })).query(({ input }) => db.listSuggestions(input.q)),
    detail: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const wallpaper = await db.getWallpaperById(input.id);
      if (!wallpaper) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد" });
      return publicWallpaper(wallpaper);
    }),
    recordView: publicProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      if (!await db.consumeWallpaperViewAttempt(requestClientHash(ctx.req), new Date())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ثبت بازدید بیش از حد مجاز است." });
      }
      await db.recordWallpaperView(input.id);
      return { success: true };
    }),
  }),
  wallpaperReactions: router({
    summary: publicProcedure.input(z.object({ wallpaperId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const summary = await db.getWallpaperLikeSummary(input.wallpaperId, requestClientHash(ctx.req));
      if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد." });
      return summary;
    }),
    like: publicProcedure.input(z.object({ wallpaperId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const clientHash = requestClientHash(ctx.req);
      const current = await db.getWallpaperLikeSummary(input.wallpaperId, clientHash);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد." });
      if (current.liked) return current;
      if (!await db.consumeWallpaperLikeAttempt(clientHash, new Date())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تعداد پسندها برای امروز کافی است؛ فردا دوباره تلاش کنید." });
      }
      const summary = await db.likeWallpaper(input.wallpaperId, clientHash);
      if (!summary) throw new TRPCError({ code: "NOT_FOUND", message: "این والپیپر دیگر در دسترس نیست." });
      return summary;
    }),
  }),
  wallpaperReports: router({
    submit: publicProcedure.input(wallpaperIssueReportFields).mutation(async ({ input, ctx }) => {
      if (input.website?.trim()) return { success: true } as const;
      const clientHash = requestClientHash(ctx.req);
      if (!await db.consumeWallpaperIssueReportAttempt(clientHash, new Date())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تعداد گزارش‌ها زیاد است؛ کمی بعد دوباره تلاش کنید." });
      }
      const id = await db.createWallpaperIssueReport({
        wallpaperId: input.wallpaperId, reason: input.reason, details: input.details?.trim() || null, clientHash, createdAt: new Date(),
      });
      if (!id) throw new TRPCError({ code: "NOT_FOUND", message: "این والپیپر دیگر در دسترس نیست." });
      return { success: true } as const;
    }),
  }),
  admin: router({
    overview: adminSectionProcedure("overview").query(() => db.getAdminOverview()),
    actionableStats: adminSectionProcedure("overview").query(async ({ ctx }) => {
      const stats = await db.getActionableAdminStats();
      const canInspectWallpapers = ctx.adminSession.role === "owner" || ctx.adminSession.permissions.wallpapers;
      return canInspectWallpapers ? stats : { ...stats, topViewed: [], topDownloaded: [], noDownloads: [] };
    }),
    activityLog: adminSectionProcedure("overview").input(z.object({ page: z.number().int().min(1).max(1_000_000) })).query(({ input, ctx }) => {
      const permissionKeys = ["wallpapers", "requests", "taxonomy", "settings", "users"] as const;
      const sections = ctx.adminSession.role === "owner"
        ? [...permissionKeys, "admins" as const]
        : permissionKeys.filter(key => ctx.adminSession.permissions[key]);
      return db.getAdminActivityPage(input.page, sections);
    }),
    contentHealth: adminSectionProcedure("wallpapers").query(() => db.getContentHealthReport()),
    getForEdit: adminSectionProcedure("wallpapers").input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const item = await db.getAdminWallpaperForEdit(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد." });
      return signAdminWallpaperPreview(item);
    }),
    reviewQueue: adminSectionProcedure("wallpapers").input(z.object({ page: z.number().int().min(1).max(1_000_000) }))
      .query(async ({ input }) => signAdminWallpaperPage(await db.listAdminWallpapersPage({ page: input.page, pageSize: 20, state: "pending" }))),
    setPublicationStatus: adminSectionProcedure("wallpapers").input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "pending", "published"]) })).mutation(async ({ input }) => {
      if (input.status !== "published") {
        if (!await db.setWallpaperPublicationStatus(input.id, input.status)) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد یا بایگانی شده است." });
        return { success: true };
      }

      const item = await db.getAdminWallpaperForEdit(input.id);
      if (!item || item.isArchived !== 0 || item.publicationStatus !== "pending") {
        throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد یا دیگر در صف انتظار نیست." });
      }
      const submission = item.communitySubmission;
      const stagedImageId = submission?.privateImageFileId ?? null;
      const stagedThumbnailId = submission?.privateThumbnailFileId ?? null;
      if (!stagedImageId && !stagedThumbnailId) {
        if (!await db.setWallpaperPublicationStatus(input.id, "published")) throw new TRPCError({ code: "NOT_FOUND", message: "والپیپر پیدا نشد یا بایگانی شده است." });
        return { success: true };
      }

      const publicFileIds: string[] = [];
      const assets: { imageKey?: string; imageUrl?: string; imageFileId?: string; thumbnailKey?: string; thumbnailUrl?: string; thumbnailFileId?: string } = {};
      let committed = false;
      try {
        if (stagedImageId) {
          const promotedImage = await storagePromotePrivateImage(item.imageKey);
          if (promotedImage.fileId) publicFileIds.push(promotedImage.fileId);
          if (!promotedImage.fileId || !promotedImage.filePath) throw new Error("ImageKit did not return identifiers for the public image.");
          assets.imageKey = promotedImage.filePath;
          assets.imageUrl = promotedImage.url;
          assets.imageFileId = promotedImage.fileId;
        }
        if (stagedThumbnailId && item.thumbnailKey) {
          const promotedThumbnail = await storagePromotePrivateImage(item.thumbnailKey);
          if (promotedThumbnail.fileId) publicFileIds.push(promotedThumbnail.fileId);
          if (!promotedThumbnail.fileId || !promotedThumbnail.filePath) throw new Error("ImageKit did not return identifiers for the public thumbnail.");
          assets.thumbnailKey = promotedThumbnail.filePath;
          assets.thumbnailUrl = promotedThumbnail.url;
          assets.thumbnailFileId = promotedThumbnail.fileId;
        }
        const published = await db.publishCommunityWallpaperWithAssets(input.id, assets, {
          imageKey: item.imageKey,
          imageUrl: item.imageUrl,
          thumbnailKey: item.thumbnailKey,
          thumbnailUrl: item.thumbnailUrl,
          privateImageFileId: stagedImageId,
          privateThumbnailFileId: stagedThumbnailId,
          publicImageFileId: item.communitySubmission?.publicImageFileId ?? null,
          publicThumbnailFileId: item.communitySubmission?.publicThumbnailFileId ?? null,
        }, new Date());
        if (!published) throw new TRPCError({ code: "NOT_FOUND", message: "وضعیت والپیپر هنگام انتشار تغییر کرده است؛ صف را تازه‌سازی کنید." });
        committed = true;
        void runImageKitCleanupQueue();
        return { success: true };
      } catch (error) {
        if (!committed && publicFileIds.length) {
          try {
            await db.enqueueImageKitCleanup(publicFileIds);
            void runImageKitCleanupQueue();
          } catch {
            await Promise.all(publicFileIds.map(fileId => storageDeleteFile(fileId).catch(() => undefined)));
          }
        }
        if (error instanceof TRPCError) throw error;
        console.error("[Community wallpaper] Promotion failed", error instanceof Error ? error.name : "UnknownError");
        throw new TRPCError({ code: "BAD_GATEWAY", message: "انتقال تصویر به فضای عمومی کامل نشد؛ مورد همچنان در صف انتظار است." });
      }
    }),
    list: adminSectionProcedure("wallpapers").query(async () => Promise.all((await db.listAdminWallpapers()).map(signAdminWallpaperPreview))),
    listPage: adminSectionProcedure("wallpapers").input(z.object({
      page: z.number().int().min(1).max(1_000_000), pageSize: z.number().int().min(1).max(50),
      q: z.string().max(120).optional(), category: z.string().max(80).optional(), state: z.enum(["all", "active", "archived", "pending", "draft", "published"]).default("all"),
    })).query(async ({ input }) => signAdminWallpaperPage(await db.listAdminWallpapersPage(input))),
    bulkUpdate: adminSectionProcedure("wallpapers").input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(100),
      operation: z.discriminatedUnion("type", [
        z.object({ type: z.literal("setCategory"), value: z.string().trim().min(2).max(80) }),
        z.object({ type: z.literal("setGameTitle"), value: z.string().trim().max(160) }),
        z.object({ type: z.literal("setTags"), value: z.string().max(1500) }),
        z.object({ type: z.literal("archive") }),
        z.object({ type: z.literal("restore") }),
      ]),
    })).mutation(({ input }) => db.bulkUpdateWallpapers(input.ids, input.operation)),
    duplicateCandidates: adminSectionProcedure("wallpapers").query(async () => Promise.all((await db.listPossibleWallpaperDuplicates()).map(group => Promise.all(group.map(signAdminWallpaperPreview))))),
    deleteExtraVariants: adminSectionProcedure("wallpapers").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await db.deleteExtraWallpaperVariants(input.id);
      return { success: true };
    }),
    deleteVariant: adminSectionProcedure("wallpapers").input(z.object({ wallpaperId: z.number().int().positive(), variantId: z.number().int().positive() })).mutation(async ({ input }) => {
      await db.deleteWallpaperVariant(input.wallpaperId, input.variantId);
      return { success: true };
    }),
    create: adminSectionProcedure("wallpapers").input(z.object({ wallpaper: wallpaperFields, variants: z.array(variantFields).max(8).optional(), publicationStatus: z.enum(["draft", "pending"]).default("pending") }))
      .mutation(async ({ input }) => ({ id: await db.createWallpaper(input.wallpaper, input.variants, input.publicationStatus) })),
    update: adminSectionProcedure("wallpapers").input(z.object({
      id: z.number().int().positive(), data: wallpaperFields.partial(),
      variants: z.array(variantFields).max(8).optional(), replaceVariants: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      await db.updateWallpaper(input.id, input.data, input.variants, input.replaceVariants);
      void runImageKitCleanupQueue();
      return { success: true };
    }),
    archive: adminSectionProcedure("wallpapers").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await db.archiveWallpaper(input.id);
      return { success: true };
    }),
    deletePermanently: adminSectionProcedure("wallpapers").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      await db.deleteWallpaperPermanently(input.id);
      void runImageKitCleanupQueue();
      return { success: true };
    }),
    users: adminSectionProcedure("users").input(z.object({ page: z.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / 25)) })).query(async ({ input }) => {
      const allowedEmails = new Set((process.env.ADMIN_EMAILS ?? "").split(/[;,\n]/).map(email => email.trim().toLowerCase()).filter(Boolean));
      const ownerOpenId = await db.getOwnerAdminOpenId() ?? process.env.OWNER_OPEN_ID?.trim() ?? null;
      const result = await db.listUsers(input.page);
      return { total: result.total, items: result.items.map(({ openId, ...user }) => ({
        ...user,
        effectiveAdmin: isSiteAdmin({ ...user, openId }),
        isConfiguredAdmin: Boolean(user.email && allowedEmails.has(user.email.trim().toLowerCase())),
        isOwner: Boolean(ownerOpenId && openId === ownerOpenId),
      })) };
    }),
    updateUserRole: adminSectionProcedure("users").input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "admin", "blocked"]) }))
      .mutation(async ({ input, ctx }) => {
        const target = await db.getUserById(input.id);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "حساب پیدا نشد." });
        const ownerOpenId = await db.getOwnerAdminOpenId() ?? process.env.OWNER_OPEN_ID?.trim() ?? null;
        if (ownerOpenId && target.openId === ownerOpenId) throw new TRPCError({ code: "FORBIDDEN", message: "دسترسی حساب Manus مالک از این صفحه قابل تغییر نیست." });
        if (ctx.adminSession.role !== "owner" && (input.role === "admin" || isSiteAdmin(target))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "فقط مالک می‌تواند نقش مدیر سایت را تعیین یا تغییر دهد." });
        }
        const currentUsers = await db.listAllUsers();
        const activeAdmins = currentUsers.filter(isSiteAdmin);
        const willRemainAdmin = isSiteAdmin({ ...target, role: input.role });
        if (isSiteAdmin(target) && !willRemainAdmin && activeAdmins.length <= 1) throw new TRPCError({ code: "FORBIDDEN", message: "حداقل یک مدیر فعال باید باقی بماند." });
        await db.updateUserRole(input.id, input.role);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
