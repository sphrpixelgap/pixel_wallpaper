import { describe, expect, it } from "vitest";
import { injectSeoPage, isSeoDocumentRequest, renderSeoPage } from "./seo-pages";

describe("crawler-visible page responses", () => {
  it("routes only page requests through the SEO renderer", () => {
    expect(isSeoDocumentRequest("GET", "/")).toBe(true);
    expect(isSeoDocumentRequest("GET", "/wallpapers/123")).toBe(true);
    expect(isSeoDocumentRequest("GET", "/api/trpc/wallpapers.page")).toBe(false);
    expect(isSeoDocumentRequest("GET", "/assets/app.js")).toBe(false);
    expect(isSeoDocumentRequest("POST", "/request")).toBe(false);
  });

  it("marks private pages noindex without exposing bearer codes or user data", async () => {
    const tracking = await renderSeoPage("/request/track?code=secret-value");
    const admin = await renderSeoPage("/admin/admin");
    const favorites = await renderSeoPage("/favorites");
    expect(tracking.robots).toBe("noindex, follow");
    expect(tracking.body).not.toContain("secret-value");
    expect(admin.robots).toBe("noindex, follow");
    expect(favorites.robots).toBe("noindex, follow");
  });

  it("returns a real noindex 404 for unknown public paths", async () => {
    const missing = await renderSeoPage("/not-a-real-page");
    expect(missing.status).toBe(404);
    expect(missing.robots).toBe("noindex, follow");
    expect(missing.body).toContain("این صفحه پیدا نشد");
  });

  it("includes a public image in the initial request and collections pages", async () => {
    const [request, collections] = await Promise.all([renderSeoPage("/request"), renderSeoPage("/collections")]);
    expect(request.body).toContain("<img");
    expect(collections.body).toContain("<img");
  });

  it("renders the community upload route with its own metadata and moderation explanation", async () => {
    const upload = await renderSeoPage("/submit-wallpaper");
    expect(upload.status).toBe(200);
    expect(upload.title).toContain("ارسال والپیپر توسط کاربران");
    expect(upload.canonical).toContain("/submit-wallpaper");
    expect(upload.body).toContain("<h1>ارسال والپیپر برای بررسی</h1>");
    expect(upload.body).toContain("فقط پس از تأیید منتشر می‌شود");
  });

  it("writes route-specific, escaped metadata and visible body into the initial document", () => {
    const html = injectSeoPage(`<!doctype html><html><head><title>__SEO_TITLE__</title><meta name="description" content="__SEO_DESCRIPTION__"><meta name="robots" content="__SEO_ROBOTS__">__SEO_CANONICAL_TAG__<meta property="og:type" content="__SEO_OG_TYPE__"><meta property="og:title" content="__SEO_OG_TITLE__"><meta property="og:description" content="__SEO_OG_DESCRIPTION__">__SEO_OG_URL_TAG__<meta property="og:image" content="__SEO_OG_IMAGE__"><meta property="og:image:alt" content="__SEO_OG_IMAGE_ALT__"><meta name="twitter:title" content="__SEO_TWITTER_TITLE__"><meta name="twitter:description" content="__SEO_TWITTER_DESCRIPTION__"><meta name="twitter:image" content="__SEO_TWITTER_IMAGE__"></head><body><div id="root"></div><div id="seo-fallback">__SEO_BODY__</div></body></html>`, {
      status: 200,
      title: `A <B> & C`,
      description: "A useful description for a route-specific page that is long enough to be meaningful.",
      canonical: "https://pixelwp-kngtqsrq.manus.space/wallpapers/7",
      robots: "index, follow",
      ogType: "article",
      ogImage: "https://pixelwp-kngtqsrq.manus.space/manus-storage/thumb.webp",
      ogImageAlt: "title & image",
      body: "<main><h1>Visible route content</h1></main>",
    });
    expect(html).toContain("<title>A &lt;B&gt; &amp; C</title>");
    expect(html).toContain('content="index, follow"');
    expect(html).toContain('href="https://pixelwp-kngtqsrq.manus.space/wallpapers/7"');
    expect(html).toContain("<h1>Visible route content</h1>");
    expect(html).not.toContain("__SEO_");
  });
});
