import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { injectSeoPage, isSeoDocumentRequest, renderSeoPage } from "../seo-pages";

async function sendSeoPage(req: Request, res: Response, templatePath: string, transform?: (url: string, html: string) => Promise<string>) {
  if (!isSeoDocumentRequest(req.method, req.path)) return false;
  const result = await renderSeoPage(req.originalUrl);
  if (result.redirect) {
    res.redirect(result.status, result.redirect);
    return true;
  }
  const template = await fs.promises.readFile(templatePath, "utf-8");
  const document = injectSeoPage(template, result);
  const html = transform ? await transform(req.originalUrl, document) : document;
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
  if ((req.method === "GET" || req.method === "HEAD") && req.path === "/" && !req.originalUrl.includes("?")) {
    headers["Cache-Control"] = "public, max-age=0, s-maxage=20, stale-while-revalidate=60";
  }
  res.status(result.status).set(headers).send(html);
  return true;
}

function sendPageError(res: Response, error: unknown, next: NextFunction) {
  console.error("[SEO] Page response failed", error instanceof Error ? error.name : "UnknownError");
  if (res.headersSent) return;
  next(error);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  const clientTemplate = path.resolve(import.meta.dirname, "../..", "client", "index.html");
  app.use((req, res, next) => {
    void sendSeoPage(req, res, clientTemplate, (url, html) => vite.transformIndexHtml(url, html))
      .then(handled => { if (!handled) next(); })
      .catch(error => sendPageError(res, error, next));
  });
  app.use(vite.middlewares);
  app.use((req, res) => {
    if (req.method === "GET" || req.method === "HEAD") res.status(404).type("text/plain; charset=utf-8").send("Not Found");
  });
}

export function serveStatic(app: Express) {
  const distPath = process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "dist", "public")
    : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use(express.static(distPath, { index: false }));
  const indexPath = path.resolve(distPath, "index.html");
  app.use((req, res, next) => {
    void sendSeoPage(req, res, indexPath)
      .then(handled => { if (!handled) next(); })
      .catch(error => sendPageError(res, error, next));
  });
  app.use((req, res) => {
    if (req.method === "GET" || req.method === "HEAD") res.status(404).type("text/plain; charset=utf-8").send("Not Found");
  });
}
