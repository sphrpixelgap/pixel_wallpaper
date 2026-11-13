import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getAdminRequestAddress, getAdminSessionFromRequest } from "../admin-auth";
import { hasAdminPermission } from "../../shared/admin-permissions";
import { consumeRateLimitBuckets, createCommunityWallpaper, enqueueImageKitCleanup, getSitemapWallpapers, getWallpaperDownloadTarget, listWallpaperCategories, recordWallpaperDownload } from "../db";
import { hashWallpaperDownloadAddress, WALLPAPER_DOWNLOAD_LIMIT, WALLPAPER_DOWNLOAD_WINDOW_MS } from "../request-rate-limit";
import { COMMUNITY_WALLPAPER_SUBMISSION_LIMIT, COMMUNITY_WALLPAPER_SUBMISSION_WINDOW_MS, communityWallpaperSubmissionBucketHash, parseCommunityWallpaperSubmissionHeader, resolutionForWallpaperDimensions, targetDeviceForWallpaperDimensions, type CommunityWallpaperSubmissionInput } from "../community-submissions";
import { CommunityImageError, processCommunityWallpaperImage } from "../community-image";
import { redactWallpaperIssueDetails } from "../privacy";
import { storageDeleteFile, storageGetAttachmentUrl, storagePut } from "../storage";
import { runImageKitCleanupQueue, startImageKitCleanupWorker } from "../imagekit-cleanup";
import { serveStatic, setupVite } from "./vite";
import { buildRobotsTxt, buildSitemapXml } from "../seo";
import { ENV } from "./env";

const MAX_WALLPAPER_BYTES = 12 * 1024 * 1024;
const MAX_ACTIVE_COMMUNITY_UPLOADS = 2;
const MAX_COMMUNITY_UPLOAD_BODY_DURATION_MS = 90_000;
let activeCommunityUploads = 0;

type CommunityUploadRequest = Request & { communitySubmission?: CommunityWallpaperSubmissionInput; communityHoneypot?: boolean; communityUploadTimedOut?: boolean };

function requireWallpaperOrSettingsPermission(req: Request, res: Response, next: NextFunction) {
  void getAdminSessionFromRequest(req).then(session => {
    if (!session || session.mustChangePassword) {
      res.status(session ? 403 : 401).json({ error: session ? "ابتدا رمز اولیه را تغییر دهید." : "برای بارگذاری وارد حساب مدیر شوید." });
      return;
    }
    const purpose = req.query.purpose;
    if (purpose !== "wallpaper" && purpose !== "logo") {
      res.status(400).json({ error: "نوع بارگذاری مشخص نشده است." });
      return;
    }
    const permission = purpose === "wallpaper" ? "wallpapers" : "settings";
    if (!hasAdminPermission(session.role, session.permissions, permission)) {
      res.status(403).json({ error: "حساب شما اجازهٔ بارگذاری در این بخش را ندارد." });
      return;
    }
    next();
  }).catch(error => {
    console.error("[Admin upload] Authorization check failed", error instanceof Error ? error.name : "UnknownError");
    if (!res.headersSent) res.status(503).json({ error: "بررسی دسترسی انجام نشد؛ کمی بعد دوباره تلاش کنید." });
  });
}

function detectImageType(data: Buffer): { mime: string; extension: string } | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}

function validateCommunitySubmissionHeader(req: Request, res: Response, next: NextFunction) {
  const submission = parseCommunityWallpaperSubmissionHeader(req.get("x-wallpaper-submission"));
  if (!submission) {
    res.status(400).json({ error: "اطلاعات فرم ناقص یا نامعتبر است." });
    return;
  }
  if (submission.website.trim()) {
    (req as CommunityUploadRequest).communityHoneypot = true;
  }
  (req as CommunityUploadRequest).communitySubmission = submission;
  next();
}

function limitCommunitySubmissions(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    if (activeCommunityUploads >= MAX_ACTIVE_COMMUNITY_UPLOADS) {
      res.set("Retry-After", "15").set("Cache-Control", "no-store").status(503).json({ error: "سامانهٔ ارسال موقتاً مشغول است؛ چند ثانیهٔ دیگر دوباره تلاش کنید." });
      return;
    }
    activeCommunityUploads += 1;
    let released = false;
    res.once("close", () => {
      if (released) return;
      released = true;
      activeCommunityUploads = Math.max(0, activeCommunityUploads - 1);
    });
    const secret = ENV.cookieSecret || ENV.databaseUrl;
    if (!secret) {
      res.set("Cache-Control", "no-store").status(503).json({ error: "محدودکنندهٔ ارسال موقتاً در دسترس نیست." });
      return;
    }
    try {
      const bucketHash = communityWallpaperSubmissionBucketHash(getAdminRequestAddress(req), secret);
      const allowed = await consumeRateLimitBuckets(
        [{ hash: bucketHash, limit: COMMUNITY_WALLPAPER_SUBMISSION_LIMIT }],
        new Date(),
        COMMUNITY_WALLPAPER_SUBMISSION_WINDOW_MS,
      );
      if (!allowed) {
        res.set("Retry-After", String(Math.ceil(COMMUNITY_WALLPAPER_SUBMISSION_WINDOW_MS / 1000)))
          .set("Cache-Control", "no-store").status(429).json({ error: "سقف ارسال روزانه پر شده است؛ فردا دوباره تلاش کنید." });
        return;
      }
      next();
    } catch (error) {
      console.error("[Community wallpaper] Rate limiter unavailable", error instanceof Error ? error.name : "UnknownError");
      if (!res.headersSent) res.set("Cache-Control", "no-store").status(503).json({ error: "محدودکنندهٔ ارسال موقتاً در دسترس نیست." });
    }
  })();
}

function enforceCommunityUploadBodyDeadline(req: Request, res: Response, next: NextFunction) {
  const communityReq = req as CommunityUploadRequest;
  const timer = setTimeout(() => {
    communityReq.communityUploadTimedOut = true;
    res.set("Cache-Control", "no-store").status(408).json({ error: "دریافت تصویر بیش از حد طول کشید؛ اتصال را بررسی و دوباره تلاش کنید." });
    res.once("finish", () => req.destroy());
  }, MAX_COMMUNITY_UPLOAD_BODY_DURATION_MS);
  timer.unref?.();
  const clearDeadline = () => clearTimeout(timer);
  req.once("end", clearDeadline);
  req.once("close", clearDeadline);
  res.once("close", clearDeadline);
  next();
}

function parseCommunityImageBody(req: Request, res: Response, next: NextFunction) {
  express.raw({ type: "*/*", limit: MAX_WALLPAPER_BYTES })(req, res, error => {
    if ((req as CommunityUploadRequest).communityUploadTimedOut) return;
    if (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 400;
      const isTooLarge = status === 413;
      res.status(isTooLarge ? 413 : 400).json({ error: isTooLarge ? "حجم تصویر نباید از ۱۲ مگابایت بیشتر باشد." : "بدنهٔ تصویر قابل‌خواندن نیست." });
      return;
    }
    next();
  });
}

function sendDownloadFailure(res: Response, message: string, error?: unknown) {
  if (res.headersSent) {
    res.destroy(error instanceof Error ? error : undefined);
    return;
  }
  res.removeHeader("Content-Disposition");
  res.removeHeader("Content-Length");
  res.status(502).set("Content-Type", "text/plain; charset=utf-8").send(message);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    next();
  });
  const jsonParser = express.json({ limit: "2mb" });
  const formParser = express.urlencoded({ limit: "128kb", extended: true });
  const skipCommunityUploadBodyParsing = (req: Request) => req.path.toLowerCase().replace(/\/+$/, "") === "/api/community/wallpapers";
  app.use((req, res, next) => skipCommunityUploadBodyParsing(req) ? next() : jsonParser(req, res, next));
  app.use((req, res, next) => skipCommunityUploadBodyParsing(req) ? next() : formParser(req, res, next));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/robots.txt", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").set("Content-Type", "text/plain; charset=utf-8").send(buildRobotsTxt());
  });
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const wallpapers = await getSitemapWallpapers();
      res.set("Cache-Control", "public, max-age=0, s-maxage=300").set("Content-Type", "application/xml; charset=utf-8").send(buildSitemapXml(wallpapers));
    } catch (error) {
      console.error("[SEO] Failed to build sitemap", error instanceof Error ? error.name : "UnknownError");
      res.set("Cache-Control", "no-store").status(503).type("text/plain").send("Sitemap is temporarily unavailable.");
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  app.post("/api/community/wallpapers", validateCommunitySubmissionHeader, limitCommunitySubmissions, enforceCommunityUploadBodyDeadline, parseCommunityImageBody, async (req, res) => {
    const communityRequest = req as CommunityUploadRequest;
    const submission = communityRequest.communitySubmission;
    if (communityRequest.communityUploadTimedOut || res.headersSent) return;
    if (communityRequest.communityHoneypot) {
      res.set("Cache-Control", "no-store").status(201).json({ success: true });
      return;
    }
    const uploadedPrivateFileIds: string[] = [];
    let saved = false;
    try {
      if (!submission || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "فایل تصویر خالی یا نامعتبر است." });
        return;
      }
      let processed: Awaited<ReturnType<typeof processCommunityWallpaperImage>>;
      try {
        processed = await processCommunityWallpaperImage(req.body, req.get("content-type")?.split(";")[0]);
      } catch (error) {
        if (error instanceof CommunityImageError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }
        throw error;
      }
      if (!processed.image.length || !processed.thumbnail.length) {
        res.status(422).json({ error: "بازرمزگذاری تصویر انجام نشد." });
        return;
      }

      const categories = await listWallpaperCategories();
      if (!categories.includes(submission.category)) {
        res.status(400).json({ error: "دسته‌بندی انتخاب‌شده دیگر در دسترس نیست؛ صفحه را تازه‌سازی کنید." });
        return;
      }

      const safeTitle = redactWallpaperIssueDetails(submission.title)?.trim();
      if (!safeTitle) {
        res.status(400).json({ error: "عنوان پس از پاک‌سازی قابل ثبت نیست." });
        return;
      }
      const gameTitle = redactWallpaperIssueDetails(submission.gameTitle)?.trim() || null;
      const tags = redactWallpaperIssueDetails(submission.tags)?.trim() || null;
      const description = redactWallpaperIssueDetails(submission.description)?.trim() || null;
      const image = await storagePut(`community-pending/${crypto.randomUUID()}.webp`, processed.image, processed.mime, { isPrivateFile: true });
      if (image.fileId) uploadedPrivateFileIds.push(image.fileId);
      if (!image.fileId || !image.filePath) throw new Error("ImageKit did not return private image identifiers.");
      const preview = await storagePut(`community-pending/${crypto.randomUUID()}-thumb.webp`, processed.thumbnail, processed.mime, { isPrivateFile: true });
      if (preview.fileId) uploadedPrivateFileIds.push(preview.fileId);
      if (!preview.fileId || !preview.filePath) throw new Error("ImageKit did not return private thumbnail identifiers.");

      await createCommunityWallpaper({
        title: safeTitle,
        category: submission.category,
        gameTitle,
        tags,
        mood: "سایر",
        dominantColor: "purple",
        targetDevice: targetDeviceForWallpaperDimensions(processed.width, processed.height),
        resolution: resolutionForWallpaperDimensions(processed.width, processed.height),
        width: processed.width,
        height: processed.height,
        description,
        imageKey: image.filePath,
        imageUrl: image.url,
        imageMime: "image/webp",
        fileSize: processed.image.length,
        thumbnailKey: preview.filePath,
        thumbnailUrl: preview.url,
      }, {
        privateImageFileId: image.fileId,
        privateThumbnailFileId: preview.fileId,
        sourceUrl: submission.sourceUrl || null,
        rightsConfirmedAt: new Date(),
      });
      saved = true;
      res.set("Cache-Control", "no-store").status(201).json({ success: true });
    } catch (error) {
      console.error("[Community wallpaper] Submission failed", error instanceof Error ? error.name : "UnknownError");
      if (!saved) await Promise.all(uploadedPrivateFileIds.map(async fileId => {
        try { await storageDeleteFile(fileId); }
        catch { await enqueueImageKitCleanup([fileId]).catch(() => undefined); }
      }));
      void runImageKitCleanupQueue();
      if (!res.headersSent) res.status(503).json({ error: "ارسال تصویر کامل نشد؛ کمی بعد دوباره تلاش کنید." });
    }
  });
  app.post("/api/admin/upload", requireWallpaperOrSettingsPermission, express.raw({ type: "image/*", limit: MAX_WALLPAPER_BYTES }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "فایل تصویر خالی یا نامعتبر است." });
        return;
      }
      if (req.body.length > MAX_WALLPAPER_BYTES) {
        res.status(413).json({ error: "حداکثر حجم تصویر ۱۲ مگابایت است." });
        return;
      }
      if (req.query.purpose === "logo" && req.body.length > 4 * 1024 * 1024) {
        res.status(413).json({ error: "حداکثر حجم لوگو ۴ مگابایت است." });
        return;
      }
      const detected = detectImageType(req.body);
      if (!detected || req.get("content-type")?.split(";")[0] !== detected.mime) {
        res.status(415).json({ error: "فرمت مجاز: PNG، JPG یا WEBP." });
        return;
      }
      const prefix = req.query.purpose === "logo" ? "site-settings" : "wallpapers";
      const uploaded = await storagePut(`${prefix}/${crypto.randomUUID()}.${detected.extension}`, req.body, detected.mime);
      if (prefix === "wallpapers" && !uploaded.fileId) throw new Error("ImageKit returned no file ID for a wallpaper upload.");
      res.status(201).json({ key: uploaded.key, url: uploaded.url, fileId: uploaded.fileId });
    } catch (error) {
      console.error("[Wallpaper upload] Failed", error instanceof Error ? error.message : "unknown error");
      res.status(500).json({ error: "بارگذاری تصویر انجام نشد. دوباره تلاش کنید." });
    }
  });
  app.get("/api/wallpapers/:id/download", async (req, res) => {
    const wallpaperId = Number(req.params.id);
    const rawVariantId = req.query.variantId;
    const variantId = rawVariantId === undefined ? undefined : typeof rawVariantId === "string" ? Number(rawVariantId) : Number.NaN;
    if (!Number.isSafeInteger(wallpaperId) || wallpaperId < 1 || (variantId !== undefined && (!Number.isSafeInteger(variantId) || variantId < 1))) {
      res.status(400).send("درخواست دانلود نامعتبر است.");
      return;
    }

    try {
      const rateLimitSecret = ENV.cookieSecret || ENV.databaseUrl;
      if (!rateLimitSecret) {
        res.set("Cache-Control", "no-store").status(503).send("محدودکنندهٔ دانلود موقتاً در دسترس نیست.");
        return;
      }
      let allowed: boolean;
      try {
        const hash = hashWallpaperDownloadAddress(getAdminRequestAddress(req), rateLimitSecret);
        allowed = await consumeRateLimitBuckets([{ hash, limit: WALLPAPER_DOWNLOAD_LIMIT }], new Date(), WALLPAPER_DOWNLOAD_WINDOW_MS);
      } catch (error) {
        console.error("[Wallpaper download] Rate limiter unavailable", error instanceof Error ? error.name : "UnknownError");
        res.set("Cache-Control", "no-store").status(503).send("محدودکنندهٔ دانلود موقتاً در دسترس نیست.");
        return;
      }
      if (!allowed) {
        res.set("Retry-After", String(Math.ceil(WALLPAPER_DOWNLOAD_WINDOW_MS / 1000))).set("Cache-Control", "no-store").status(429).send("تعداد دانلودها زیاد است؛ چند دقیقهٔ دیگر دوباره تلاش کنید.");
        return;
      }

      const target = await getWallpaperDownloadTarget(wallpaperId, variantId);
      if (!target) {
        res.status(404).send("والپیپر یا نسخهٔ انتخاب‌شده پیدا نشد.");
        return;
      }

      const safePart = (value: string) => value.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "") || "wallpaper";
      const filename = `${safePart(target.title)}-${safePart(target.resolution)}`;
      const downloadUrl = storageGetAttachmentUrl(target.imageKey, filename);
      res.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff");
      res.once("finish", () => { void recordWallpaperDownload(wallpaperId, variantId).catch(() => undefined); });
      res.redirect(302, downloadUrl);
    } catch (error) {
      console.error("[Wallpaper download] failed", error instanceof Error ? error.name : "unknown");
      sendDownloadFailure(res, "دانلود فایل انجام نشد؛ لطفاً دوباره تلاش کنید.", error);
    }
  });
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`);
    startImageKitCleanupWorker();
  });
}

startServer().catch(error => { console.error(error); process.exit(1); });
