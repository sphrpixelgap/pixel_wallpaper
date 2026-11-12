import sharp from "sharp";

export const MAX_COMMUNITY_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_COMMUNITY_IMAGE_PIXELS = 20_000_000;

export class CommunityImageError extends Error {
  constructor(message: string, readonly statusCode: 400 | 413 | 415 | 422) {
    super(message);
    this.name = "CommunityImageError";
  }
}

function detectImageMime(data: Buffer) {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function processCommunityWallpaperImage(data: Buffer, declaredMime: string | undefined) {
  if (!data.length) throw new CommunityImageError("فایل تصویر خالی یا نامعتبر است.", 400);
  if (data.length > MAX_COMMUNITY_IMAGE_BYTES) throw new CommunityImageError("حجم تصویر نباید از ۱۲ مگابایت بیشتر باشد.", 413);
  const detectedMime = detectImageMime(data);
  if (!detectedMime || declaredMime?.trim().toLowerCase() !== detectedMime) {
    throw new CommunityImageError("فرمت مجاز: PNG، JPG یا WEBP.", 415);
  }

  let inputImage: ReturnType<typeof sharp>;
  let metadata: { width?: number; height?: number; pages?: number; format?: string };
  try {
    inputImage = sharp(data, { limitInputPixels: MAX_COMMUNITY_IMAGE_PIXELS, failOn: "error" });
    metadata = await inputImage.metadata();
  } catch (error) {
    const tooManyPixels = error instanceof Error && /pixel limit/i.test(error.message);
    throw new CommunityImageError(tooManyPixels ? "ابعاد تصویر بیش از حد مجاز است." : "تصویر خراب است یا قابل پردازش نیست.", tooManyPixels ? 413 : 422);
  }

  if (!metadata.width || !metadata.height || metadata.width > 16_384 || metadata.height > 16_384 ||
      metadata.width * metadata.height > MAX_COMMUNITY_IMAGE_PIXELS || (metadata.pages ?? 1) > 1 ||
      !["png", "jpeg", "webp"].includes(metadata.format ?? "")) {
    throw new CommunityImageError("ابعاد تصویر بیش از حد مجاز است یا فرمت آن پشتیبانی نمی‌شود.", 413);
  }

  try {
    const { data: image, info } = await inputImage.rotate().webp({ quality: 92, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (image.length > MAX_COMMUNITY_IMAGE_BYTES) throw new CommunityImageError("حجم تصویر پس از بهینه‌سازی بیش از حد مجاز است.", 413);
    const thumbnail = await sharp(image).resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 }).toBuffer();
    if (thumbnail.length > 2 * 1024 * 1024) throw new CommunityImageError("حجم پیش‌نمایش بیش از حد مجاز است.", 413);
    return { image, thumbnail, width: info.width, height: info.height, mime: "image/webp" as const };
  } catch (error) {
    if (error instanceof CommunityImageError) throw error;
    throw new CommunityImageError("بازرمزگذاری تصویر انجام نشد.", 422);
  }
}
