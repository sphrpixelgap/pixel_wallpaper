const IMAGEKIT_HOST = "ik.imagekit.io";
const IMAGEKIT_ACCOUNT_ID = "xwqxnxqle";
const MAX_IMAGE_WIDTH = 4096;

type ResponsiveImageSourceOptions = {
  quality?: number;
  maxWidth?: number;
};

function getImageKitAsset(source: string) {
  try {
    const url = new URL(source);
    const accountPrefix = `/${IMAGEKIT_ACCOUNT_ID}/`;
    if (url.protocol !== "https:" || url.hostname !== IMAGEKIT_HOST || url.port || url.username || url.password || url.search || url.hash) return null;
    if (!url.pathname.startsWith(accountPrefix)) return null;

    const assetPath = url.pathname.slice(accountPrefix.length);
    if (!assetPath || assetPath.split("/").some(segment => !segment || segment === "." || segment === ".." || segment.startsWith("tr:"))) return null;
    return { url, assetPath, accountPrefix };
  } catch {
    return null;
  }
}

function transformedUrl(source: string, width: number, quality: number) {
  const asset = getImageKitAsset(source);
  if (!asset) return source;
  const url = new URL(asset.url);
  url.pathname = `${asset.accountPrefix}tr:w-${width},q-${quality},f-auto/${asset.assetPath}`;
  return url.toString();
}

/** Build src/srcSet URLs for display. Full-resolution downloads must keep using the stored original URL. */
export function getResponsiveImageSource(
  source: string,
  requestedWidths: number[],
  options: ResponsiveImageSourceOptions = {},
): { src: string; srcSet?: string } {
  const asset = getImageKitAsset(source);
  if (!asset) return { src: source };

  const maxWidthValue = options.maxWidth ?? MAX_IMAGE_WIDTH;
  const maxWidth = Number.isFinite(maxWidthValue)
    ? Math.max(1, Math.min(MAX_IMAGE_WIDTH, Math.round(maxWidthValue)))
    : MAX_IMAGE_WIDTH;
  const widths = [...new Set(requestedWidths
    .filter(width => Number.isFinite(width) && width > 0)
    .map(width => Math.min(maxWidth, MAX_IMAGE_WIDTH, Math.max(1, Math.round(width)))))].sort((a, b) => a - b);
  if (!widths.length) return { src: source };

  const qualityValue = options.quality ?? 80;
  const quality = Number.isFinite(qualityValue) ? Math.max(50, Math.min(95, Math.round(qualityValue))) : 80;
  const fallbackWidth = widths[Math.floor(widths.length / 2)];
  const srcSet = widths.map(width => `${transformedUrl(source, width, quality)} ${width}w`).join(", ");
  return { src: transformedUrl(source, fallbackWidth, quality), srcSet };
}
