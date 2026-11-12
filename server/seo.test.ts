import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRobotsTxt, buildSitemapXml, getPublicImageUrl, SITE_ORIGIN } from "./seo";

afterEach(() => vi.unstubAllEnvs());

describe("SEO discovery documents", () => {
  it("builds a canonical image sitemap from active wallpaper records and distinct game routes", () => {
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/xwqxnxqle");
    const sitemap = buildSitemapXml([
      { id: 42, title: "بازی \u0001<سایبر> & شب", gameTitle: "بازی سایبر", updatedAt: new Date("2026-11-04T10:20:30.000Z"), thumbnailUrl: "/manus-storage/wallpapers/thumbs/42.webp" },
      { id: 43, title: "بازی دیگر", gameTitle: "بازی سایبر", updatedAt: null, imageUrl: "https://ik.imagekit.io/xwqxnxqle/wallpapers/43.webp?Expires=123&Signature=temporary" },
      { id: 44, title: "تصویر ImageKit", gameTitle: null, updatedAt: null, imageUrl: "https://ik.imagekit.io/xwqxnxqle/wallpapers/44.webp" },
      { id: 0, gameTitle: "ignored", updatedAt: null, imageUrl: "/manus-storage/wallpapers/ignored.webp" },
    ]);

    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/request</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/collections</loc>`);
    for (const slug of ["action", "adventure", "cyberpunk", "mobile", "4k", "purple", "ultrawide"]) {
      expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/collections/${slug}</loc>`);
    }
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/wallpapers/42</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/wallpapers/43</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/wallpapers/44</loc>`);
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/games/%D8%A8%D8%A7%D8%B2%DB%8C-%D8%B3%D8%A7%DB%8C%D8%A8%D8%B1</loc>`);
    expect(sitemap).toContain(`<image:loc>${SITE_ORIGIN}/manus-storage/wallpapers/thumbs/42.webp</image:loc>`);
    expect(sitemap).toContain("<image:loc>https://ik.imagekit.io/xwqxnxqle/wallpapers/44.webp</image:loc>");
    expect(sitemap).toContain("<image:title>بازی &lt;سایبر&gt; &amp; شب</image:title>");
    expect(sitemap).not.toContain("wallpapers/43.webp");
    expect(sitemap).not.toContain("\u0001");
    expect(sitemap.match(/<url>/g)).toHaveLength(14);
    expect(sitemap).toContain("<lastmod>2026-11-04T10:20:30.000Z</lastmod>");
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/request/track");
  });

  it("accepts only this site's public storage and the configured ImageKit endpoint", () => {
    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/xwqxnxqle");
    expect(getPublicImageUrl("https://ik.imagekit.io/xwqxnxqle/wallpapers/1.webp")).toBe("https://ik.imagekit.io/xwqxnxqle/wallpapers/1.webp");
    expect(getPublicImageUrl("https://ik.imagekit.io/another-account/wallpapers/1.webp")).toBeUndefined();
    expect(getPublicImageUrl("https://evil.example/manus-storage/wallpapers/1.webp")).toBeUndefined();
    expect(getPublicImageUrl("/manus-storage/wallpapers/1.webp")).toBe(`${SITE_ORIGIN}/manus-storage/wallpapers/1.webp`);

    vi.stubEnv("IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/");
    expect(getPublicImageUrl("https://ik.imagekit.io/another-account/wallpapers/1.webp")).toBeUndefined();
  });

  it("points crawlers to the canonical sitemap and excludes API endpoints", () => {
    expect(buildRobotsTxt()).toBe([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/*",
      `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
      "",
    ].join("\n"));
  });
});
