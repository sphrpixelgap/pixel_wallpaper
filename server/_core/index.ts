import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "http";
import { Readable } from "node:stream";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getAdminSessionFromRequest } from "../admin-auth";
import { hasAdminPermission } from "../../shared/admin-permissions";
import { getSitemapWallpapers, getWallpaperDownloadTarget, recordWallpaperDownload } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { serveStatic, setupVite } from "./vite";
import { buildRobotsTxt, buildSitemapXml } from "../seo";

const MAX_WALLPAPER_BYTES = 12 * 1024 * 1024;

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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
      const { key, url } = await storagePut(`${prefix}/${crypto.randomUUID()}.${detected.extension}`, req.body, detected.mime);
      res.status(201).json({ key, url });
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
      const target = await getWallpaperDownloadTarget(wallpaperId, variantId);
      if (!target) {
        res.status(404).send("والپیپر یا نسخهٔ انتخاب‌شده پیدا نشد.");
        return;
      }

      const signedUrl = await storageGetSignedUrl(target.imageKey);
      const upstream = await fetch(signedUrl, { redirect: "follow" });
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => undefined);
        res.status(502).send("دریافت فایل از فضای ذخیره‌سازی انجام نشد.");
        return;
      }

      const mime = ["image/png", "image/jpeg", "image/webp"].includes(target.imageMime) ? target.imageMime : "application/octet-stream";
      const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "bin";
      const safePart = (value: string) => value.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || "wallpaper";
      const filename = `${safePart(target.title)}-${safePart(target.resolution)}.${extension}`;
      const length = upstream.headers.get("content-length");
      if (length && /^\d+$/.test(length)) res.set("Content-Length", length);
      res.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff");
      res.attachment(filename);
      res.type(mime);
      await recordWallpaperDownload(wallpaperId, variantId).catch(() => undefined);

      const fileStream = Readable.fromWeb(upstream.body as any);
      fileStream.on("error", error => {
        console.error("[Wallpaper download] stream failed", error instanceof Error ? error.name : "unknown");
        sendDownloadFailure(res, "ارسال فایل دانلودی انجام نشد.", error);
      });
      res.on("close", () => { if (!res.writableEnded) fileStream.destroy(); });
      fileStream.pipe(res);
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
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
