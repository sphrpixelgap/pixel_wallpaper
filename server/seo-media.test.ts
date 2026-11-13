import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(async () => undefined),
  getSiteSettings: vi.fn(async () => undefined),
  getWallpaperById: vi.fn(async (id: number) => ({
    id,
    title: "Sample wallpaper",
    category: "action",
    gameTitle: "Sample game",
    description: "Sample description",
    resolution: "4K",
    width: 3840,
    height: 2160,
    imageUrl: "https://ik.imagekit.io/xwqxnxqle/wallpapers/sample.webp",
    thumbnailUrl: "https://ik.imagekit.io/xwqxnxqle/wallpapers/sample.webp",
  })),
  listGames: vi.fn(async () => []),
  listWallpapers: vi.fn(async () => []),
  listWallpapersPage: vi.fn(async () => ({ items: [], total: 0 })),
}));

import { renderSeoPage } from "./seo-pages";

describe("server-rendered wallpaper media paths", () => {
  it("uses the first-party media route in visible detail markup", async () => {
    const page = await renderSeoPage("/wallpapers/123");
    expect(page.status).toBe(200);
    expect(page.body).toContain('src="/media/wallpapers/sample.webp?w=640&amp;q=80"');
    expect(page.body).not.toContain('src="https://ik.imagekit.io');
    expect(page.ogImage).toBe("https://ik.imagekit.io/xwqxnxqle/wallpapers/sample.webp");
  });
});
