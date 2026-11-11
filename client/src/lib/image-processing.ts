export type ProcessedWallpaperImage = {
  original: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  originalMime: "image/webp";
};

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("پردازش تصویر انجام نشد.")), "image/webp", quality));
}

export async function processWallpaperImage(file: File): Promise<ProcessedWallpaperImage> {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) throw new Error("فقط PNG، JPG یا WEBP مجاز است.");
  if (file.size > 12 * 1024 * 1024) throw new Error("حجم فایل اولیه نباید از ۱۲ مگابایت بیشتر باشد.");
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height || width > 20000 || height > 20000) {
    bitmap.close();
    throw new Error("ابعاد تصویر معتبر نیست.");
  }
  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = width;
  originalCanvas.height = height;
  const originalContext = originalCanvas.getContext("2d", { alpha: false });
  if (!originalContext) { bitmap.close(); throw new Error("مرورگر امکان پردازش تصویر را ندارد."); }
  originalContext.drawImage(bitmap, 0, 0, width, height);
  const original = await canvasBlob(originalCanvas, 0.92);

  const scale = Math.min(1, 720 / Math.max(width, height));
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = Math.max(1, Math.round(width * scale));
  thumbnailCanvas.height = Math.max(1, Math.round(height * scale));
  const thumbContext = thumbnailCanvas.getContext("2d", { alpha: false });
  if (!thumbContext) { bitmap.close(); throw new Error("ساخت پیش‌نمایش انجام نشد."); }
  thumbContext.drawImage(bitmap, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
  const thumbnail = await canvasBlob(thumbnailCanvas, 0.78);
  bitmap.close();
  if (original.size > 12 * 1024 * 1024) throw new Error("پس از بهینه‌سازی، حجم نسخهٔ اصلی هنوز بیش از ۱۲ مگابایت است.");
  return { original, thumbnail, width, height, originalMime: "image/webp" };
}

export function blobAsFile(blob: Blob, name: string) {
  return new File([blob], name, { type: blob.type || "image/webp" });
}
