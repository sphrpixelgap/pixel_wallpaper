import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml } from "./seo";

describe("SEO discovery documents", () => {
  it("builds a canonical image sitemap from active wallpaper records and distinct game routes", () => {
    const sitemap = buildSitemapXml([
      { id: 42, title: "بازی <سایبر> & شب", gameTitle: "بازی سایبر", updatedAt: new Date("2026-11-04T10:20:30.000Z"), thumbnailUrl: "/manus-storage/wallpapers/thumbs/42.webp" },
      { id: 43, title: "بازی دیگر", gameTitle: "بازی سایبر", updatedAt: null, imageUrl: "/manus-storage/wallpapers/43.webp?Expires=123&Signature=temporary" },
      { id: 0, gameTitle: "ignored", updatedAt: null, imageUrl: "/manus-storage/wallpapers/ignored.webp" },
    ]);

    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/request</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/action</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/adventure</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/cyberpunk</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/mobile</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/4k</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/purple</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/collections/ultrawide</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/wallpapers/42</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/wallpapers/43</loc>");
    expect(sitemap).toContain("<loc>https://pixelwp-kngtqsrq.manus.space/games/%D8%A8%D8%A7%D8%B2%DB%8C-%D8%B3%D8%A7%DB%8C%D8%A8%D8%B1</loc>");
    expect(sitemap).toContain("<image:loc>https://pixelwp-kngtqsrq.manus.space/manus-storage/wallpapers/thumbs/42.webp</image:loc>");
    expect(sitemap).toContain("<image:title>بازی &lt;سایبر&gt; &amp; شب</image:title>");
    expect(sitemap).not.toContain("wallpapers/43.webp");
    expect(sitemap.match(/<url>/g)).toHaveLength(13);
    expect(sitemap).toContain("<lastmod>2026-11-04T10:20:30.000Z</lastmod>");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/request/track");
  });

  it("points crawlers to the canonical sitemap and excludes API endpoints", () => {
    expect(buildRobotsTxt()).toBe([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/*",
      "Sitemap: https://pixelwp-kngtqsrq.manus.space/sitemap.xml",
      "",
    ].join("\n"));
  });
});
