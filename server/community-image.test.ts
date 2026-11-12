import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CommunityImageError, MAX_COMMUNITY_IMAGE_BYTES, processCommunityWallpaperImage } from "./community-image";

async function makePng(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 36, g: 24, b: 55 } } }).png().toBuffer();
}

describe("community image processing", () => {
  it("decodes PNG and emits optimized metadata-free WebP plus a bounded thumbnail", async () => {
    const png = await makePng(1600, 900);
    const result = await processCommunityWallpaperImage(png, "image/png");
    const imageMetadata = await sharp(result.image).metadata();
    const thumbnailMetadata = await sharp(result.thumbnail).metadata();
    expect(result.mime).toBe("image/webp");
    expect(result.width).toBe(1600);
    expect(result.height).toBe(900);
    expect(imageMetadata.format).toBe("webp");
    expect(imageMetadata.exif).toBeUndefined();
    expect(thumbnailMetadata.width).toBeLessThanOrEqual(720);
    expect(thumbnailMetadata.height).toBeLessThanOrEqual(720);
  });

  it("rejects MIME spoofing, unsupported signatures, and oversized source files", async () => {
    const png = await makePng(32, 32);
    await expect(processCommunityWallpaperImage(png, "image/jpeg")).rejects.toMatchObject({ statusCode: 415 });
    await expect(processCommunityWallpaperImage(Buffer.from("not an image"), "image/png")).rejects.toMatchObject({ statusCode: 415 });
    await expect(processCommunityWallpaperImage(Buffer.alloc(MAX_COMMUNITY_IMAGE_BYTES + 1), "image/png"))
      .rejects.toBeInstanceOf(CommunityImageError);
    await expect(processCommunityWallpaperImage(Buffer.alloc(MAX_COMMUNITY_IMAGE_BYTES + 1), "image/png"))
      .rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects extreme dimensions and corrupted input", async () => {
    const tooWide = await makePng(17_000, 1);
    await expect(processCommunityWallpaperImage(tooWide, "image/png")).rejects.toMatchObject({ statusCode: 413 });
    const tooManyPixels = await makePng(5_000, 4_100);
    await expect(processCommunityWallpaperImage(tooManyPixels, "image/png")).rejects.toMatchObject({ statusCode: 413 });
    const brokenPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0]);
    await expect(processCommunityWallpaperImage(brokenPng, "image/png")).rejects.toBeInstanceOf(CommunityImageError);
  });
});
